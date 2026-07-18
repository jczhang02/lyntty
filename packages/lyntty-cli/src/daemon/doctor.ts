import psList from 'ps-list';
import spawn from 'cross-spawn';

/** Find active Lyntty/Pi daemon and session processes. */
export async function findAllLynttyProcesses(): Promise<Array<{ pid: number; command: string; type: string }>> {
  try {
    const processes = await psList();
    const result: Array<{ pid: number; command: string; type: string }> = [];
    for (const proc of processes) {
      const command = proc.cmd || '';
      const name = proc.name || '';
      const isLyntty = name.includes('lyntty')
        || command.includes('lyntty.mjs')
        || command.includes('dist/index.mjs')
        || command.includes('/lyntty/');
      if (!isLyntty) continue;

      let type = 'unknown';
      if (proc.pid === process.pid) type = 'current';
      else if (command.includes('--version')) type = 'daemon-version-check';
      else if (command.includes('daemon start-sync') || command.includes('daemon start')) type = 'daemon';
      else if (command.includes('--started-by daemon')) type = 'daemon-spawned-session';
      else if (command.includes('doctor')) type = 'doctor';
      else type = 'user-session';
      result.push({ pid: proc.pid, command: command || name, type });
    }
    return result;
  } catch {
    return [];
  }
}

export async function findRunawayLynttyProcesses(): Promise<Array<{ pid: number; command: string }>> {
  const processes = await findAllLynttyProcesses();
  return processes
    .filter(processInfo => processInfo.pid !== process.pid && (
      processInfo.type === 'daemon'
      || processInfo.type === 'daemon-spawned-session'
      || processInfo.type === 'daemon-version-check'
    ))
    .map(processInfo => ({ pid: processInfo.pid, command: processInfo.command }));
}

export async function killRunawayLynttyProcesses(): Promise<{
  killed: number;
  errors: Array<{ pid: number; error: string }>;
}> {
  const runaway = await findRunawayLynttyProcesses();
  const errors: Array<{ pid: number; error: string }> = [];
  let killed = 0;
  for (const { pid, command } of runaway) {
    try {
      console.log(`Killing runaway process PID ${pid}: ${command}`);
      if (process.platform === 'win32') {
        const result = spawn.sync('taskkill', ['/F', '/PID', String(pid)], { stdio: 'pipe' });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(`taskkill exited with code ${result.status}`);
      } else {
        process.kill(pid, 'SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1_000));
        const current = await psList();
        if (current.some(processInfo => processInfo.pid === pid)) process.kill(pid, 'SIGKILL');
      }
      console.log(`Successfully killed runaway process PID ${pid}`);
      killed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ pid, error: message });
      console.log(`Failed to kill process PID ${pid}: ${message}`);
    }
  }
  return { killed, errors };
}
