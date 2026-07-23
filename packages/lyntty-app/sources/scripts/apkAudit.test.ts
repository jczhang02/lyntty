import { afterEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const auditScript = resolve(import.meta.dir, '../../scripts/apk-audit.sh');
const temporaryRoots: string[] = [];

interface AuditFixture {
    applicationId?: string;
    expectedApplicationId?: string;
    debuggable?: boolean;
    entries?: string[];
    expectedNativeAbis?: string;
    runtimeMode?: 'standalone' | 'metro';
    metroPort?: number | null;
    expectedMetroPort?: number;
}

async function writeExecutable(path: string, content: string): Promise<void> {
    await writeFile(path, content, { mode: 0o700 });
    await chmod(path, 0o700);
}

async function runAudit(
    signatureReport: string,
    fixture: AuditFixture = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const applicationId = fixture.applicationId ?? 'dev.jczhang.lyntty.preview';
    const expectedApplicationId = fixture.expectedApplicationId ?? applicationId;
    const debuggable = fixture.debuggable ?? false;
    const entries = fixture.entries ?? [
        'assets/index.android.bundle',
        'lib/arm64-v8a/libapp.so',
        'lib/x86_64/libapp.so',
    ];
    const expectedNativeAbis = fixture.expectedNativeAbis ?? 'arm64-v8a,x86_64';
    const runtimeMode = fixture.runtimeMode ?? 'standalone';
    const metroPort = fixture.metroPort === undefined ? 8081 : fixture.metroPort;
    const expectedMetroPort = fixture.expectedMetroPort ?? 8081;
    const metroResourceCommand = metroPort === null ? 'exit 2' : `printf '%s\\n' ${metroPort}`;
    const root = await mkdtemp(join(tmpdir(), 'lyntty-apk-audit-'));
    temporaryRoots.push(root);
    const androidHome = join(root, 'android-sdk');
    const buildTools = join(androidHome, 'build-tools', '37.0.0');
    const commandLineTools = join(androidHome, 'cmdline-tools', 'latest', 'bin');
    const fakeBin = join(root, 'bin');
    await mkdir(buildTools, { recursive: true });
    await mkdir(commandLineTools, { recursive: true });
    await mkdir(fakeBin, { recursive: true });

    await writeExecutable(join(buildTools, 'apksigner'), `#!/bin/sh\ncat <<'REPORT'\n${signatureReport}\nREPORT\n`);
    await writeExecutable(join(commandLineTools, 'apkanalyzer'), `#!/bin/sh
case "$1:$2" in
  manifest:application-id) printf '%s\\n' ${applicationId} ;;
  manifest:version-name) printf '%s\\n' 1.2.0 ;;
  manifest:version-code) printf '%s\\n' 920001 ;;
  manifest:debuggable) printf '%s\\n' ${debuggable} ;;
  resources:value) ${metroResourceCommand} ;;
  *) exit 2 ;;
esac
`);
    await writeExecutable(join(fakeBin, 'unzip'), `#!/bin/sh
if [ "$1" = '-Z1' ]; then
  printf '%s\\n' ${entries.join(' ')}
  exit 0
fi
exit 2
`);
    const apk = join(root, 'candidate.apk');
    await writeFile(apk, 'fixture');

    const child = Bun.spawn([
        auditScript,
        apk,
        expectedApplicationId,
        '1.2.0',
        '920001',
        'ebd23c222b690e2be635fe3e52bd70b6fb86c5570ab279bc4e8c1f22ed90ef9c',
        expectedNativeAbis,
        runtimeMode,
        String(expectedMetroPort),
    ], {
        env: {
            ...process.env,
            ANDROID_HOME: androidHome,
            ANDROID_SDK_ROOT: '',
            PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        },
        stdout: 'pipe',
        stderr: 'pipe',
    });
    const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
    ]);
    return { exitCode, stdout, stderr };
}

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('APK audit signer parsing', () => {
    test('accepts the Android build-tools 37 signer report and deduplicates schemes', async () => {
        const digest = 'ebd23c222b690e2be635fe3e52bd70b6fb86c5570ab279bc4e8c1f22ed90ef9c';
        const result = await runAudit(`Verifies
Verified using v2 scheme (APK Signature Scheme v2): true
Number of signers: 1
V2 Signer: certificate SHA-256 digest: ${digest}
V3 Signer: certificate SHA-256 digest: ${digest}`);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout).toContain(`signer_sha256=${digest}`);
        expect(result.stdout).toContain('native_abis=arm64-v8a,x86_64');
    });

    test('continues to accept the Android build-tools 36 signer report', async () => {
        const digest = 'ebd23c222b690e2be635fe3e52bd70b6fb86c5570ab279bc4e8c1f22ed90ef9c';
        const result = await runAudit(`Verifies
Verified using v2 scheme (APK Signature Scheme v2): true
Number of signers: 1
Signer #1 certificate SHA-256 digest: ${digest}`);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
    });

    test('rejects multiple signers with an explicit diagnostic', async () => {
        const result = await runAudit(`Verifies
Verified using v2 scheme (APK Signature Scheme v2): true
Number of signers: 2
V2 Signer 1: certificate SHA-256 digest: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
V2 Signer 2: certificate SHA-256 digest: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('APK audit failed: expected exactly one signer, got 2');
    });
});

describe('APK runtime mode audit', () => {
    const signatureReport = `Verifies
Verified using v2 scheme (APK Signature Scheme v2): true
Number of signers: 1
V2 Signer: certificate SHA-256 digest: ebd23c222b690e2be635fe3e52bd70b6fb86c5570ab279bc4e8c1f22ed90ef9c`;

    test('accepts a debuggable APK without a bundle as Metro-required', async () => {
        const result = await runAudit(signatureReport, {
            applicationId: 'dev.jczhang.lyntty.dev',
            debuggable: true,
            entries: ['lib/arm64-v8a/libapp.so', 'lib/x86_64/libapp.so'],
            runtimeMode: 'metro',
            metroPort: 8081,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout).toContain('application_id=dev.jczhang.lyntty.dev');
        expect(result.stdout).toContain('debuggable=true');
        expect(result.stdout).toContain('runtime_mode=metro');
        expect(result.stdout).toContain('standalone_bundle=absent');
        expect(result.stdout).toContain('metro_port=8081');
    });

    test('rejects an embedded standalone bundle in Metro mode', async () => {
        const result = await runAudit(signatureReport, {
            applicationId: 'dev.jczhang.lyntty.dev',
            debuggable: true,
            runtimeMode: 'metro',
        });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('APK audit failed: expected no standalone Android bundle in Metro mode, got 1');
    });

    test('rejects a package that does not match the requested development identity', async () => {
        const result = await runAudit(signatureReport, {
            applicationId: 'dev.jczhang.lyntty.preview',
            expectedApplicationId: 'dev.jczhang.lyntty.dev',
            debuggable: true,
            entries: ['lib/arm64-v8a/libapp.so', 'lib/x86_64/libapp.so'],
            runtimeMode: 'metro',
        });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('APK audit failed: application_id mismatch');
    });

    test('rejects a non-debuggable APK in Metro mode', async () => {
        const result = await runAudit(signatureReport, {
            applicationId: 'dev.jczhang.lyntty.dev',
            debuggable: false,
            entries: ['lib/arm64-v8a/libapp.so', 'lib/x86_64/libapp.so'],
            runtimeMode: 'metro',
        });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('APK audit failed: debuggable mismatch: expected <true>, got <false>');
    });

    test('rejects a Metro port that does not match the requested port', async () => {
        const result = await runAudit(signatureReport, {
            applicationId: 'dev.jczhang.lyntty.dev',
            debuggable: true,
            entries: ['lib/arm64-v8a/libapp.so', 'lib/x86_64/libapp.so'],
            runtimeMode: 'metro',
            metroPort: 9090,
            expectedMetroPort: 8081,
        });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('APK audit failed: metro_port mismatch: expected <8081>, got <9090>');
    });

    test('rejects a Metro APK whose port resource cannot be read', async () => {
        const result = await runAudit(signatureReport, {
            applicationId: 'dev.jczhang.lyntty.dev',
            debuggable: true,
            entries: ['lib/arm64-v8a/libapp.so', 'lib/x86_64/libapp.so'],
            runtimeMode: 'metro',
            metroPort: null,
        });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('APK audit failed: apkanalyzer could not read the Metro development server port');
    });

    test('rejects an incomplete native ABI set', async () => {
        const result = await runAudit(signatureReport, {
            applicationId: 'dev.jczhang.lyntty.dev',
            debuggable: true,
            entries: ['lib/arm64-v8a/libapp.so'],
            runtimeMode: 'metro',
        });

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('APK audit failed: native_abis mismatch');
    });
});
