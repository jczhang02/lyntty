/** Low-level ripgrep wrapper - arguments in, string out. */

import { spawn as crossSpawn } from 'cross-spawn';

export interface RipgrepResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

export interface RipgrepOptions {
    cwd?: string;
}

export function run(args: string[], options?: RipgrepOptions): Promise<RipgrepResult> {
    return new Promise((resolve, reject) => {
        const child = crossSpawn('rg', args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: options?.cwd,
            windowsHide: true,
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', data => { stdout += data.toString(); });
        child.stderr?.on('data', data => { stderr += data.toString(); });
        child.on('close', code => resolve({ exitCode: code ?? 0, stdout, stderr }));
        child.on('error', reject);
    });
}
