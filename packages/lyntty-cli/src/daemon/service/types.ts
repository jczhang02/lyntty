export interface ServiceCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type ServiceCommandRunner = (command: string, args: readonly string[]) => Promise<ServiceCommandResult>;

export interface DaemonServiceConfig {
  daemonExecutable: string;
  cliExecutable: string;
  homeDir: string;
  lynttyHomeDir: string;
  servicePath: string;
  runtimePath: string;
  uid?: number;
}

export type DaemonServiceState = 'running' | 'stopped' | 'not-installed';

export interface DaemonServiceManager {
  readonly kind: 'systemd-user' | 'launch-agent';
  install(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  status(): Promise<DaemonServiceState>;
  uninstall(): Promise<void>;
}
