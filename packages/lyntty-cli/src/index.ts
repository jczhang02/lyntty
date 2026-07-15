#!/usr/bin/env bun

import chalk from 'chalk';
import packageJson from '../package.json';
import { getLatestDaemonLog, logger } from './ui/logger';
import { readCredentials } from './persistence';
import { authAndSetupMachineIfNeeded } from './ui/auth';
import { startDaemon, initialMachineMetadata } from './daemon/run';
import {
  checkIfDaemonRunningAndCleanupStaleState,
  listDaemonSessions,
  stopDaemon,
  stopDaemonSession,
} from './daemon/controlClient';
import { killRunawayLynttyProcesses } from './daemon/doctor';
import { runDoctorCommand, runDoctorDaemon } from './ui/doctor';
import { install } from './daemon/install';
import { uninstall } from './daemon/uninstall';
import { ApiClient } from './api/api';
import { handleAuthCommand } from './commands/auth';
import { handleConnectCommand } from './commands/connect';
import { handleDevCommand } from './commands/dev';
import { handleRemoteCommand } from './commands/remote';
import { spawnLynttyCLI } from './utils/spawnLynttyCLI';
import { ensureDaemonRunning } from './daemon/ensureDaemonRunning';
import { installLynttyPiExtension } from './pi/piExtensionInstall';

async function runPiFromArgs(args: string[]): Promise<void> {
  const { runPi } = await import('./pi/runPi');
  let startedBy: 'daemon' | 'terminal' | undefined;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--started-by') {
      const value = args[++index];
      if (value !== 'daemon' && value !== 'terminal') {
        throw new Error('--started-by must be daemon or terminal');
      }
      startedBy = value;
    }
  }

  const { credentials } = await authAndSetupMachineIfNeeded();
  if (startedBy !== 'daemon') await ensureDaemonRunning();
  await runPi({ credentials, startedBy });
}

function showPiHelp(): void {
  console.log(`
${chalk.bold('lyntty')} - Mobile control for local pi sessions

${chalk.bold('Usage:')}
  lyntty [options]         Start a local pi session with mobile control
  lyntty pi                Start a local pi session with mobile control
  lyntty auth              Manage phone/computer pairing
  lyntty connect           Show Pi connection settings
  lyntty dev app-logs      Receive mobile app logs locally
  lyntty daemon            Manage lynttyd background service
  lyntty doctor            System diagnostics and troubleshooting
  lyntty remote            Control Pi sessions through the relay

${chalk.bold('Examples:')}
  lyntty
  lyntty auth login
  lyntty remote list
  lyntty remote send <session-id> "Hello"
  lyntty dev app-logs

Run the standalone lyntty-relay executable to operate a Relay server.
`);
}

async function handleDaemonCommand(args: string[]): Promise<void> {
  const daemonSubcommand = args[0];
  if (daemonSubcommand === 'list') {
    try {
      const sessions = await listDaemonSessions();
      if (sessions.length === 0) {
        console.log('No active sessions this daemon is aware of.');
      } else {
        console.log('Active sessions:');
        console.log(JSON.stringify(sessions, null, 2));
      }
    } catch {
      console.log('No daemon running');
    }
    return;
  }

  if (daemonSubcommand === 'stop-session') {
    const sessionId = args[1];
    if (!sessionId) throw new Error('Session ID required');
    try {
      const success = await stopDaemonSession(sessionId);
      console.log(success ? 'Session stopped' : 'Failed to stop session');
    } catch {
      console.log('No daemon running');
    }
    return;
  }

  if (daemonSubcommand === 'start') {
    await installLynttyPiExtension().catch(error => {
      logger.warn(`Failed to install Lyntty Pi extension: ${error instanceof Error ? error.message : error}`);
    });
    try {
      const { credentials, machineId } = await authAndSetupMachineIfNeeded();
      const api = await ApiClient.create(credentials);
      await api.getOrCreateMachine({
        machineId,
        metadata: initialMachineMetadata,
        daemonState: { status: 'offline', pid: process.pid, startedAt: Date.now() },
      });
    } catch (error) {
      throw new Error(`Failed to start daemon: ${error instanceof Error ? error.message : String(error)}`);
    }

    const child = spawnLynttyCLI(['daemon', 'start-sync'], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    child.unref();

    let started = false;
    for (let index = 0; index < 50; index += 1) {
      if (await checkIfDaemonRunningAndCleanupStaleState()) {
        started = true;
        break;
      }
      await delay(100);
    }
    if (!started) throw new Error('Failed to start daemon');
    console.log('Daemon started successfully');
    return;
  }

  if (daemonSubcommand === 'start-sync') {
    await installLynttyPiExtension().catch(error => {
      logger.warn(`Failed to install Lyntty Pi extension: ${error instanceof Error ? error.message : error}`);
    });
    await startDaemon();
    return;
  }

  if (daemonSubcommand === 'stop') {
    await stopDaemon();
    return;
  }
  if (daemonSubcommand === 'status') {
    await runDoctorDaemon();
    return;
  }
  if (daemonSubcommand === 'logs') {
    const latest = await getLatestDaemonLog();
    console.log(latest?.path ?? 'No daemon logs found');
    return;
  }
  if (daemonSubcommand === 'install') {
    await install();
    return;
  }
  if (daemonSubcommand === 'uninstall') {
    await uninstall();
    return;
  }

  console.log(`
${chalk.bold('lyntty daemon')} - Daemon management

${chalk.bold('Usage:')}
  lyntty daemon start              Start lynttyd (detached)
  lyntty daemon stop               Stop lynttyd
  lyntty daemon status             Show lynttyd status
  lyntty daemon list               List active Pi sessions
  lyntty daemon logs               Show the latest daemon log path
  lyntty daemon install            Install lynttyd as a service
  lyntty daemon uninstall          Remove the lynttyd service
`);
}

async function handleNotifyCommand(args: string[]): Promise<void> {
  let message = '';
  let title = '';
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '-p') message = args[++index] ?? '';
    else if (arg === '-t') title = args[++index] ?? '';
    else if (arg === '-h' || arg === '--help') {
      console.log('Usage: lyntty notify -p <message> [-t <title>]');
      return;
    } else {
      throw new Error(`Unknown argument for notify command: ${arg}`);
    }
  }
  if (!message) throw new Error('Message is required. Use -p "your message".');

  const credentials = await readCredentials();
  if (!credentials) throw new Error('Not authenticated. Please run "lyntty auth login" first.');
  const api = await ApiClient.create(credentials);
  const notificationTitle = title || 'Lyntty';
  await api.push().sendToAllDevices(notificationTitle, message, { source: 'cli', timestamp: Date.now() });
  console.log(chalk.green('✓ Push notification sent successfully!'));
}

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === '--version' || args[0] === '-v')) {
    console.log(`lyntty version: ${packageJson.version}`);
    return;
  }
  if (!args.includes('--version')) logger.debug('Starting lyntty CLI with args: ', process.argv);

  const subcommand = args[0];
  if (!subcommand || subcommand.startsWith('-')) {
    if (args.includes('--help') || args.includes('-h')) {
      showPiHelp();
      return;
    }
    await runPiFromArgs(args);
    return;
  }

  switch (subcommand) {
    case 'pi':
      if (args.includes('--help') || args.includes('-h')) showPiHelp();
      else await runPiFromArgs(args.slice(1));
      return;
    case 'auth':
      await handleAuthCommand(args.slice(1));
      return;
    case 'connect':
      await handleConnectCommand(args.slice(1));
      return;
    case 'dev':
      await handleDevCommand(args.slice(1));
      return;
    case 'doctor':
      if (args[1] === 'clean') {
        if (args.slice(2).includes('--help') || args.slice(2).includes('-h')) {
          console.log('Usage: lyntty doctor clean\n\nStops lynttyd and running Pi sessions.');
          return;
        }
        const result = await killRunawayLynttyProcesses();
        console.log(`Cleaned up ${result.killed} runaway processes`);
        if (result.errors.length > 0) console.log('Errors:', result.errors);
      } else {
        await runDoctorCommand();
      }
      return;
    case 'daemon':
      await handleDaemonCommand(args.slice(1));
      return;
    case 'notify':
      await handleNotifyCommand(args.slice(1));
      return;
    case 'logout':
      console.log(chalk.yellow('Note: "lyntty logout" is deprecated. Use "lyntty auth logout" instead.\n'));
      await handleAuthCommand(['logout']);
      return;
    case 'remote':
      await handleRemoteCommand(args.slice(1));
      return;
    case 'bye':
      console.log('Bye!');
      return;
    default:
      throw new Error(`Unknown lyntty command: ${subcommand}. Run \`lyntty --help\` for usage.`);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

run().catch(error => {
  console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
  if (process.env.DEBUG) console.error(error);
  process.exitCode = 1;
});
