import { afterEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const auditScript = resolve(import.meta.dir, '../../scripts/apk-audit.sh');
const temporaryRoots: string[] = [];

async function writeExecutable(path: string, content: string): Promise<void> {
    await writeFile(path, content, { mode: 0o700 });
    await chmod(path, 0o700);
}

async function runAudit(signatureReport: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
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
case "$2" in
  application-id) printf '%s\\n' dev.jczhang.lyntty.preview ;;
  version-name) printf '%s\\n' 1.2.0 ;;
  version-code) printf '%s\\n' 920001 ;;
  debuggable) printf '%s\\n' false ;;
  *) exit 2 ;;
esac
`);
    await writeExecutable(join(fakeBin, 'unzip'), `#!/bin/sh
if [ "$1" = '-Z1' ]; then
  printf '%s\\n' assets/index.android.bundle lib/arm64-v8a/libapp.so lib/x86_64/libapp.so
  exit 0
fi
exit 2
`);
    const apk = join(root, 'candidate.apk');
    await writeFile(apk, 'fixture');

    const child = Bun.spawn([
        auditScript,
        apk,
        'dev.jczhang.lyntty.preview',
        '1.2.0',
        '920001',
        'ebd23c222b690e2be635fe3e52bd70b6fb86c5570ab279bc4e8c1f22ed90ef9c',
        'arm64-v8a,x86_64',
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
