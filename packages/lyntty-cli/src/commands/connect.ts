import chalk from 'chalk';
import { readCredentials } from '@/persistence';

/**
 * Pi keeps provider/model credentials in Pi's own configuration.  The command
 * remains as a discoverable compatibility surface, but it no longer starts a
 * provider-specific OAuth flow.
 */
export async function handleConnectCommand(args: string[]): Promise<void> {
    const subcommand = args[0];
    if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
        showConnectHelp();
        return;
    }
    if (subcommand === 'status') {
        const credentials = await readCredentials();
        console.log(chalk.bold('\nPi Connection Status\n'));
        console.log(credentials
            ? chalk.green('✓ Lyntty relay authenticated')
            : chalk.yellow('⚠️  Lyntty relay is not authenticated'));
        console.log(chalk.gray('Pi provider credentials are managed by the local Pi installation.'));
        return;
    }
    throw new Error(`Unknown connect subcommand: ${subcommand}`);
}

function showConnectHelp(): void {
    console.log(`
${chalk.bold('lyntty connect')} - Pi connection status

${chalk.bold('Usage:')}
  lyntty connect status       Show relay authentication status
  lyntty connect help         Show this help message

${chalk.bold('Notes:')}
  Pi provider/model credentials are configured by the local Pi installation.
  Use 'lyntty auth login' to pair this computer with the Lyntty mobile app.
`);
}
