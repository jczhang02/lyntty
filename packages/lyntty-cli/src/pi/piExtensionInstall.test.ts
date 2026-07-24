import { afterEach, describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  installLynttyPiExtension,
  lynttyPiExtensionPath,
  lynttyPiExtensionSha256,
  LYNTTY_PI_EXTENSION_SOURCE,
} from './piExtensionInstall';

const roots: string[] = [];
const previousExplicitPath = process.env.LYNTTY_PI_EXTENSION_PATH;
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'extension-install-'));
  roots.push(value);
  return value;
}

afterEach(async () => {
  if (previousExplicitPath === undefined) delete process.env.LYNTTY_PI_EXTENSION_PATH;
  else process.env.LYNTTY_PI_EXTENSION_PATH = previousExplicitPath;
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })));
});

describe('Pi extension installation', () => {
  it('resolves explicit path before Pi agent directory and default home', async () => {
    const base = await root();
    process.env.LYNTTY_PI_EXTENSION_PATH = join(base, 'explicit', 'index.ts');
    process.env.PI_CODING_AGENT_DIR = join(base, 'agent');
    expect(lynttyPiExtensionPath()).toBe(process.env.LYNTTY_PI_EXTENSION_PATH);

    delete process.env.LYNTTY_PI_EXTENSION_PATH;
    expect(lynttyPiExtensionPath()).toBe(join(base, 'agent', 'extensions', 'lyntty', 'index.ts'));
    expect(lynttyPiExtensionPath(join(base, 'home'))).toBe(join(base, 'home', '.pi', 'agent', 'extensions', 'lyntty', 'index.ts'));
  });

  it('writes the managed source atomically with private permissions', async () => {
    const base = await root();
    const path = join(base, 'agent', 'extensions', 'lyntty', 'index.ts');
    const result = await installLynttyPiExtension({ extensionPath: path });

    expect(result).toEqual({ path, changed: true, previousSha256: null });
    expect(await readFile(path, 'utf8')).toBe(LYNTTY_PI_EXTENSION_SOURCE);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await readdir(join(base, 'agent', 'extensions', 'lyntty'))).filter(name => name.endsWith('.tmp'))).toEqual([]);
    expect(lynttyPiExtensionSha256()).toHaveLength(64);
  });

  it('refuses to overwrite an unrecognized extension unless explicitly authorized', async () => {
    const base = await root();
    const path = join(base, 'extension', 'index.ts');
    await mkdir(join(base, 'extension'), { recursive: true });
    await writeFile(path, '// user extension\n');

    await expect(installLynttyPiExtension({ extensionPath: path })).rejects.toThrow('Refusing to overwrite');
    expect(await readFile(path, 'utf8')).toBe('// user extension\n');

    const replaced = await installLynttyPiExtension({ extensionPath: path, replaceUnknown: true });
    expect(replaced.changed).toBe(true);
    expect(replaced.previousSha256).toHaveLength(64);
    expect(await readFile(path, 'utf8')).toBe(LYNTTY_PI_EXTENSION_SOURCE);
  });

  it('upgrades the last known managed source without a destructive override', async () => {
    const base = await root();
    const path = join(base, 'extension', 'index.ts');
    await mkdir(join(base, 'extension'), { recursive: true });
    const previousCommand = [
      '  pi.registerCommand("lyntty", {',
      '    description: "Alias for /remote",',
      '    handler: async (args, ctx) => {',
      '      const action = String(args || "").trim().toLowerCase();',
      '      if (action === "off" || action === "remote off") {',
      '        enabled = false;',
      '        stopHeartbeat(ctx);',
      '        stopCommandPolling(ctx);',
      '        ctx.ui.notify("Lyntty remote sync disabled for this Pi process", "info");',
      '        return;',
      '      }',
      '      if (action === "on" || action === "remote on") {',
      '        if (bridgeLockedOff) {',
      '          ctx.ui.notify("Lyntty remote bridge is owned by the managed runtime in this Pi process", "warning");',
      '          return;',
      '        }',
      '        enabled = true;',
      '        startCommandPolling(pi, ctx);',
      '        send(ctx, { type: "command_list", commands: safePiCommands(pi) });',
      '        send(ctx, { type: "session_start", reason: "lyntty-command" });',
      '        ctx.ui.notify("Lyntty remote sync enabled", "info");',
      '        return;',
      '      }',
      '      startHeartbeat(ctx);',
      '      startCommandPolling(pi, ctx);',
      '      const session = safeSessionSnapshot(ctx);',
      '      if (!session?.piSessionId) {',
      '        ctx.ui.notify(`Lyntty remote: ${lastStatus}`, "warning");',
      '        return;',
      '      }',
      '      const ok = await postToDaemon("/pi-extension/status", { session });',
      '      ctx.ui.notify(ok ? "Lyntty remote: connected" : `Lyntty remote: ${lastStatus}`, ok ? "info" : "warning");',
      '    },',
      '  });',
    ].join('\n');
    const previousSource = LYNTTY_PI_EXTENSION_SOURCE.replace(
      '\n  pi.on("session_start"',
      `\n${previousCommand}\n\n  pi.on("session_start"`,
    );
    await writeFile(path, previousSource);

    const result = await installLynttyPiExtension({ extensionPath: path });
    expect(result.previousSha256).toBe('27ccaac0d08ace0eb770681426701af91e7ac4852b2bf1443733f1b936ad1a56');
    expect(await readFile(path, 'utf8')).toBe(LYNTTY_PI_EXTENSION_SOURCE);
  });
});
