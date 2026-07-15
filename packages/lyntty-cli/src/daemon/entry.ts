#!/usr/bin/env bun

import packageJson from '../../package.json';
import { startDaemon } from './run';

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 1 && (args[0] === '--version' || args[0] === '-v')) {
    console.log(`lynttyd version: ${packageJson.version}`);
    return;
  }

  if (args.length > 0) {
    console.error('Usage: lynttyd [--version]');
    process.exitCode = 2;
    return;
  }

  await startDaemon();
}

main().catch((error: unknown) => {
  console.error('lynttyd failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
