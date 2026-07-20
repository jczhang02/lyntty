import { rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const packageRoot = resolve(import.meta.dir, '..');
const outputRoot = join(packageRoot, 'dist', 'test-state', `bundle-smoke-${process.pid}`);
const bundlePath = join(outputRoot, 'index.android.bundle');
const sourceMapPath = `${bundlePath}.packager.map`;
const assetsPath = join(outputRoot, 'assets');
const expoPackagePath = Bun.resolveSync('expo/package.json', packageRoot);
const expoCliPath = Bun.resolveSync('@expo/cli', dirname(expoPackagePath));
const childEnvironment: Record<string, string | undefined> = {
    ...process.env,
    APP_ENV: 'preview',
    NODE_ENV: 'production',
    BUN_EXECUTABLE: process.execPath,
    EXPO_NO_DOTENV: '1',
};
for (const key of Object.keys(childEnvironment)) {
    if (key.startsWith('EXPO_PUBLIC_')) delete childEnvironment[key];
}

await rm(outputRoot, { recursive: true, force: true });

try {
    const child = Bun.spawn([
        process.execPath,
        expoCliPath,
        'export:embed',
        '--platform',
        'android',
        '--dev',
        'false',
        '--reset-cache',
        '--entry-file',
        'index.ts',
        '--bundle-output',
        bundlePath,
        '--assets-dest',
        assetsPath,
        '--sourcemap-output',
        sourceMapPath,
        '--minify',
        'false',
        '--verbose',
    ], {
        cwd: packageRoot,
        env: childEnvironment,
        stdin: 'ignore',
        stdout: 'inherit',
        stderr: 'inherit',
    });
    const exitCode = await child.exited;
    if (exitCode !== 0) {
        throw new Error(`Preview Android bundle smoke failed with exit code ${exitCode}`);
    }

    const bundle = Bun.file(bundlePath);
    if (!await bundle.exists() || bundle.size === 0) {
        throw new Error('Preview Android bundle smoke produced no bundle');
    }

    console.log(`Preview Android bundle smoke passed (${bundle.size} bytes)`);
} finally {
    await rm(outputRoot, { recursive: true, force: true });
}
