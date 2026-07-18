import { resolve } from 'node:path';

const packageRoot = resolve(import.meta.dir, '..');
const glob = new Bun.Glob('sources/**/*.{test,spec}.{ts,tsx}');
const files = [...glob.scanSync({ cwd: packageRoot, onlyFiles: true })].sort();

let passed = 0;
let assertions = 0;
for (const file of files) {
    const child = Bun.spawn([
        process.execPath,
        'test',
        '--preload',
        './sources/bunTestSetup.ts',
        file,
    ], {
        cwd: packageRoot,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
    });
    const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
    ]);
    const output = `${stdout}\n${stderr}`;
    if (exitCode !== 0) {
        process.stderr.write(`App test file failed: ${file}\n${output}`);
        process.exit(exitCode);
    }
    const summary = output.match(/\n\s*(\d+) pass\n\s*0 fail(?:\n\s*(\d+) expect\(\) calls)?/);
    if (!summary) {
        process.stderr.write(`App test file emitted no recognized summary: ${file}\n${output}`);
        process.exit(1);
    }
    passed += Number(summary[1]);
    assertions += Number(summary[2] ?? 0);
}

console.log(`App isolated tests: ${passed} passed, ${assertions} assertions across ${files.length} files`);
