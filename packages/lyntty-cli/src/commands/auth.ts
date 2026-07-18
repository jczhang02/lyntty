import chalk from 'chalk';
import { readCredentials, clearCredentials, clearMachineId, readSettings } from '@/persistence';
import { authAndSetupMachineIfNeeded } from '@/ui/auth';
import { configuration } from '@/configuration';
import { existsSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { stopDaemon, checkIfDaemonRunningAndCleanupStaleState } from '@/daemon/controlClient';
import os from 'node:os';

export async function handleAuthCommand(args: string[]): Promise<void> {
  const subcommand = args[0];
  if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    showAuthHelp();
    return;
  }
  switch (subcommand) {
    case 'login':
      await handleAuthLogin(args.slice(1));
      return;
    case 'logout':
      await handleAuthLogout();
      return;
    case 'status':
      await handleAuthStatus();
      return;
    default:
      throw new Error(`Unknown auth subcommand: ${subcommand}`);
  }
}

function showAuthHelp(): void {
  console.log(`
${chalk.bold('lyntty auth')} - Mobile authentication management

${chalk.bold('Usage:')}
  lyntty auth login [--force]    Authenticate this computer with the mobile app
  lyntty auth logout              Remove authentication and machine data
  lyntty auth status              Show authentication status

${chalk.bold('Options:')}
  --force                         Clear credentials, machine ID, and stop lynttyd before pairing

${chalk.gray('Authentication is completed by scanning the mobile QR code.')}
`);
}

async function handleAuthLogin(args: string[]): Promise<void> {
  if (args.some(arg => arg !== '--force' && arg !== '-f')) {
    throw new Error('Only --force is supported for `lyntty auth login`. Authentication uses the mobile QR flow.');
  }
  const forceAuth = args.includes('--force') || args.includes('-f');
  if (forceAuth) {
    console.log(chalk.yellow('Force authentication requested.'));
    try {
      await stopDaemon();
      console.log(chalk.gray('✓ Stopped lynttyd'));
    } catch (error) {
      console.log(chalk.gray('lynttyd was not running'));
    }
    await clearCredentials();
    await clearMachineId();
    console.log(chalk.gray('✓ Cleared credentials and machine ID\n'));
  }

  if (!forceAuth) {
    const existingCreds = await readCredentials();
    const settings = await readSettings();
    if (existingCreds && settings.machineId) {
      console.log(chalk.green('✓ Already authenticated'));
      console.log(chalk.gray(`  Machine ID: ${settings.machineId}`));
      console.log(chalk.gray(`  Host: ${os.hostname()}`));
      console.log(chalk.gray('  Use `lyntty auth login --force` to pair again'));
      return;
    }
  }

  const result = await authAndSetupMachineIfNeeded();
  console.log(chalk.green('\n✓ Authentication successful'));
  console.log(chalk.gray(`  Machine ID: ${result.machineId}`));
}

async function handleAuthLogout(): Promise<void> {
  const lynttyDir = configuration.lynttyHomeDir;
  const credentials = await readCredentials();
  if (!credentials) {
    console.log(chalk.yellow('Not currently authenticated'));
    return;
  }

  console.log(chalk.blue('This will log you out of Lyntty'));
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>(resolve => {
    rl.question(chalk.yellow('Are you sure you want to log out? (y/N): '), resolve);
  });
  rl.close();
  if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
    console.log(chalk.blue('Logout cancelled'));
    return;
  }

  try {
    try { await stopDaemon(); } catch { /* daemon may already be stopped */ }
    if (existsSync(lynttyDir)) rmSync(lynttyDir, { recursive: true, force: true });
    console.log(chalk.green('✓ Successfully logged out'));
    console.log(chalk.gray('  Run `lyntty auth login` to authenticate again'));
  } catch (error) {
    throw new Error(`Failed to logout: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function handleAuthStatus(): Promise<void> {
  const credentials = await readCredentials();
  const settings = await readSettings();
  console.log(chalk.bold('\nAuthentication Status\n'));
  if (!credentials) {
    console.log(chalk.red('✗ Not authenticated'));
    console.log(chalk.gray('  Run `lyntty auth login` to authenticate'));
    return;
  }
  console.log(chalk.green('✓ Authenticated'));
  console.log(chalk.gray(`  Token: ${credentials.token.substring(0, 30)}...`));
  if (settings.machineId) {
    console.log(chalk.green('✓ Machine registered'));
    console.log(chalk.gray(`  Machine ID: ${settings.machineId}`));
    console.log(chalk.gray(`  Host: ${os.hostname()}`));
  } else {
    console.log(chalk.yellow('⚠️  Machine not registered'));
  }
  console.log(chalk.gray(`\n  Data directory: ${configuration.lynttyHomeDir}`));
  try {
    console.log((await checkIfDaemonRunningAndCleanupStaleState())
      ? chalk.green('✓ lynttyd running')
      : chalk.gray('✗ lynttyd not running'));
  } catch {
    console.log(chalk.gray('✗ lynttyd not running'));
  }
}
