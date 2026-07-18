/** Low-level ripgrep wrapper - arguments in, string out. */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn as crossSpawn } from 'cross-spawn';
import { runtimeLayout } from '@/distribution/runtimeLayout';

export interface RipgrepResult {
    exitCode: number;
    stdout: string;
    stderr: string;
}

export interface RipgrepOptions {
    cwd?: string;
}

function getBinaryPath(): string {
    const layout = runtimeLayout();
    const bundledPath = join(layout.toolsDir, process.platform === 'win32' ? 'rg.exe' : 'rg');
    if (existsSync(bundledPath)) return bundledPath;
    if (layout.compiled) throw new Error(`Bundled ripgrep executable not found at ${bundledPath}`);
    return 'rg';
}

export function run(args: string[], options?: RipgrepOptions): Promise<RipgrepResult> {
    return new Promise((resolve, reject) => {
        const child = crossSpawn(getBinaryPath(), args, {
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
