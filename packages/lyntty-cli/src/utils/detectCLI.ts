import { execSync } from 'node:child_process';
import os from 'node:os';

export interface CLIAvailability {
  pi: boolean;
  detectedAt: number;
}

/** Detect whether the Pi executable is available on this machine. */
export function detectCLIAvailability(): CLIAvailability {
  const pi = commandExists('pi');
  return { pi, detectedAt: Date.now() };
}

function commandExists(command: string): boolean {
  try {
    if (os.platform() === 'win32') {
      execSync(`powershell -NoProfile -Command "Get-Command ${command} -ErrorAction SilentlyContinue"`, {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      execSync(`command -v ${command} >/dev/null 2>&1`, { stdio: 'ignore' });
    }
    return true;
  } catch {
    return false;
  }
}
