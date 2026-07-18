#!/usr/bin/env bun

import { initializeRuntimeLayout } from './distribution/runtimeLayout';

initializeRuntimeLayout();

const args = process.argv.slice(2);
if (args[0] === '--build-info') {
  if (args.some(arg => arg !== '--build-info' && arg !== '--json')) {
    console.error('Error: Usage: lyntty --build-info [--json]');
    process.exitCode = 1;
  } else {
    const { printBuildInfo } = await import('./distribution/buildInfo');
    await printBuildInfo('lyntty', args.includes('--json'));
  }
} else if (args[0] === '--self-check') {
  if (args.some(arg => arg !== '--self-check' && arg !== '--json')) {
    console.error('Error: Usage: lyntty --self-check [--json]');
    process.exitCode = 1;
  } else {
    const { printSelfCheck } = await import('./distribution/selfCheck');
    await printSelfCheck(args.includes('--json')).catch((error: unknown) => {
      console.error('Self-check failed:', error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  }
} else {
  await import('./cli');
}
