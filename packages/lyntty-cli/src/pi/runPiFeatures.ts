import type { AgentSession, AgentSessionRuntime } from '@earendil-works/pi-coding-agent';

export const LYNTTY_REMOTE_COMMAND = '/lyntty';

interface InternalCommand {
  invocationName?: string;
  name?: string;
}

interface InternalRunner {
  getRegisteredCommands?: () => InternalCommand[];
}

interface InternalSkill {
  name?: string;
}

interface InternalResourceLoader {
  getSkills?: () => { skills?: InternalSkill[] };
}

interface SessionInternals {
  _extensionRunner?: InternalRunner;
  _resourceLoader?: InternalResourceLoader;
}

function normalizeSlashCommand(name: string | undefined): string | undefined {
  const trimmed = name?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function addCommand(commands: Set<string>, name: string | undefined): void {
  const normalized = normalizeSlashCommand(name);
  if (normalized) {
    commands.add(normalized);
  }
}

export function listPiRemoteSlashCommands(session: AgentSession): string[] {
  const commands = new Set<string>([LYNTTY_REMOTE_COMMAND]);
  const internalSession = session as unknown as SessionInternals;

  for (const command of internalSession._extensionRunner?.getRegisteredCommands?.() ?? []) {
    addCommand(commands, command.invocationName ?? command.name);
  }

  for (const template of session.promptTemplates) {
    addCommand(commands, template.name);
  }

  const skills = internalSession._resourceLoader?.getSkills?.().skills ?? [];
  for (const skill of skills) {
    if (skill.name) {
      addCommand(commands, `skill:${skill.name}`);
    }
  }

  return [...commands];
}

export function getPiPluginFeatureSummary(session: AgentSession): {
  slashCommands: string[];
  activeTools: string[];
  configuredTools: string[];
} {
  return {
    slashCommands: listPiRemoteSlashCommands(session),
    activeTools: session.getActiveToolNames(),
    configuredTools: session.getAllTools().map((tool) => tool.name),
  };
}

export async function bindPiSessionExtensions(
  runtime: AgentSessionRuntime,
  handlers: {
    onShutdown: () => void;
    onError: (error: unknown) => void;
  },
): Promise<void> {
  await runtime.session.bindExtensions({
    mode: 'rpc',
    commandContextActions: {
      waitForIdle: () => runtime.session.agent.waitForIdle(),
      newSession: (options) => runtime.newSession(options),
      fork: async (entryId, options) => {
        const result = await runtime.fork(entryId, options);
        return { cancelled: result.cancelled };
      },
      navigateTree: async (targetId, options) => {
        const result = await runtime.session.navigateTree(targetId, options);
        return { cancelled: result.cancelled };
      },
      switchSession: (sessionPath, options) => runtime.switchSession(sessionPath, options),
      reload: () => runtime.session.reload(),
    },
    shutdownHandler: handlers.onShutdown,
    onError: handlers.onError,
  });
}
