#!/usr/bin/env bun

import packageJson from '../../package.json';
import { printBuildInfo } from '../distribution/buildInfo';
import { initializeRuntimeLayout } from '../distribution/runtimeLayout';

initializeRuntimeLayout();

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args[0] === '--build-info') {
    if (args.some(arg => arg !== '--build-info' && arg !== '--json')) {
      throw new Error('Usage: lynttyd --build-info [--json]');
    }
    await printBuildInfo('lynttyd', args.includes('--json'));
    return;
  }

  if (args.length === 1 && (args[0] === '--version' || args[0] === '-v')) {
    console.log(`lynttyd version: ${packageJson.version}`);
    return;
  }

  if (args.length > 0) {
    console.error('Usage: lynttyd [--version] [--build-info [--json]]');
    process.exitCode = 2;
    return;
  }

  process.env.LYNTTY_DAEMON_PROCESS = '1';
  const { startDaemon } = await import('./run');
  await startDaemon();
}

main().catch((error: unknown) => {
  console.error('lynttyd failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
