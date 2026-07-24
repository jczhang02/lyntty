import ts from 'typescript';
import { describe, expect, it } from 'bun:test';

import { installLynttyPiExtension } from './piExtensionInstall';
import { attachImagesToPiRemoteCommand, isLifecyclePiExtensionEvent, parseLynttyPiRemoteCommand, toPiAgentSessionEvent } from './piExtensionEvent';

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Pi extension event bridge', () => {
  it('accepts assistant message_end as a live fallback event', () => {
    const event = toPiAgentSessionEvent({
      type: 'message_end',
      message: { role: 'assistant', content: [{ type: 'text', text: 'final answer' }] },
    });

    expect(event?.type).toBe('message_end');
  });

  it('accepts live Pi tool events for the shared session protocol mapper', () => {
    const event = toPiAgentSessionEvent({
      type: 'tool_execution_end',
      toolCallId: 'call-1',
      toolName: 'bash',
      result: 'ok',
      isError: false,
    });

    expect(event?.type).toBe('tool_execution_end');
  });

  it('ignores malformed tool events', () => {
    expect(toPiAgentSessionEvent({ type: 'tool_execution_end', toolName: 'bash' })).toBeNull();
  });

  it('treats session lifecycle events as metadata-only bridge events', () => {
    expect(isLifecyclePiExtensionEvent({ type: 'session_start' })).toBe(true);
    expect(isLifecyclePiExtensionEvent({ type: 'session_info_changed' })).toBe(true);
    expect(isLifecyclePiExtensionEvent({ type: 'remote_heartbeat' })).toBe(true);
    expect(isLifecyclePiExtensionEvent({ type: 'message_update' })).toBe(false);
  });

  it('parses whitelisted remote Pi control commands without raw slash passthrough', () => {
    expect(parseLynttyPiRemoteCommand('hello', { isStreaming: false })).toEqual({ type: 'send_user_message', text: 'hello' });
    expect(parseLynttyPiRemoteCommand('hello', { isStreaming: true })).toEqual({ type: 'follow_up', text: 'hello' });
    expect(parseLynttyPiRemoteCommand('/steer change direction', { isStreaming: true })).toEqual({ type: 'steer', text: 'change direction' });
    expect(parseLynttyPiRemoteCommand('/compact keep recent work', { isStreaming: false })).toEqual({ type: 'compact', instructions: 'keep recent work' });
    expect(parseLynttyPiRemoteCommand('/name New title', { isStreaming: false })).toEqual({ type: 'set_session_name', name: 'New title' });
    expect(parseLynttyPiRemoteCommand('/goal status', { isStreaming: false })).toEqual({ type: 'invoke_pi_command', commandLine: '/goal status' });
    expect(parseLynttyPiRemoteCommand('/context details', { isStreaming: true })).toEqual({ type: 'invoke_pi_command', commandLine: '/context details', deliverAs: 'followUp' });
    expect(parseLynttyPiRemoteCommand('/skill:coding-standards', { isStreaming: false })).toEqual({ type: 'invoke_pi_command', commandLine: '/skill:coding-standards' });
    expect(parseLynttyPiRemoteCommand('/unknown do thing', { isStreaming: false })).toBeNull();
    expect(parseLynttyPiRemoteCommand('x'.repeat(50_001), { isStreaming: false })).toBeNull();
  });

  it('preserves image-only and image-plus-text commands for Pi extension delivery', () => {
    const image = { type: 'image' as const, data: 'AQID', mimeType: 'image/png' };
    expect(parseLynttyPiRemoteCommand('', { isStreaming: false, hasImages: true })).toEqual({
      type: 'send_user_message',
      text: '',
    });
    expect(attachImagesToPiRemoteCommand(
      parseLynttyPiRemoteCommand('inspect', { isStreaming: true, hasImages: true })!,
      [image],
    )).toEqual({ type: 'follow_up', text: 'inspect', images: [image] });
    expect(attachImagesToPiRemoteCommand(
      parseLynttyPiRemoteCommand('/skill:coding-standards inspect', { isStreaming: false, hasImages: true })!,
      [image],
    )).toEqual({
      type: 'invoke_pi_command',
      commandLine: '/skill:coding-standards inspect',
      images: [image],
    });
    expect(parseLynttyPiRemoteCommand('/abort', { isStreaming: false, hasImages: true })).toBeNull();
  });

  it('installs a global Pi extension that defaults to local lynttyd sync', async () => {
    const home = await mkdtemp(join(tmpdir(), 'lyntty-pi-extension-'));
    try {
      const first = await installLynttyPiExtension(home);
      const second = await installLynttyPiExtension(home);
      const source = await readFile(first.path, 'utf8');

      expect(first.changed).toBe(true);
      expect(second.changed).toBe(false);
      expect(source).toContain('pi.registerCommand("remote"');
      expect(source).not.toContain('pi.registerCommand("lyntty"');
      expect(source).toContain('/pi-extension/event');
      expect(source).toContain('/pi-extension/commands');
      expect(source).toContain('/pi-extension/command-ack');
      expect(source).toContain('X-Lyntty-Extension-Token');
      expect(source).toContain('deliveryToken');
      expect(source).toContain('queueEpoch');
      expect(source).toContain('commandQueueEpochs');
      expect(source).toContain('commandPollInFlight.has(session.piSessionId)');
      expect(source).toContain('commandPollInFlight.delete(session.piSessionId)');
      expect(source).toContain('extensionInstanceId');
      expect(source).toContain('pi-extension-command-ledger');
      expect(source).toContain('persistExecutedCommandState(session.piSessionId, envelope.localKey, "executing")');
      expect(source).toContain('getExecutedCommandState(session.piSessionId, envelope.localKey)');
      expect(source).toContain('sendUserMessageAndWaitForAcceptance');
      expect(source).toContain('pi.on("before_agent_start"');
      expect(source).toContain('LYNTTY_PI_EXTENSION_DISABLED');
      expect(source).toContain('lastAckedCommandSeq.set(session.piSessionId, 0)');
      expect(source).toContain('pi.sendUserMessage');
      expect(source).toContain('lyntty-mobile-context');
      expect(source).not.toContain('[lyntty] ');
      expect(source).toContain('pi.on("input"');
      expect(source).toContain('event.source === "extension"');
      expect(source).toContain('pi.on("message_end"');
      expect(source).toContain('safePiCommands');
      expect(source).toContain('invoke_pi_command');
      expect(source).toContain('case "internal_shutdown"');
      expect(source).toContain('sendUserMessageAndWaitForAcceptance(pi, command.text, command.images, "followUp")');
      expect(source).toContain('type RemoteImage = { type: "image"; data: string; mimeType: string }');
      expect(source).toContain('pi.sendUserMessage(content, { deliverAs })');
      expect(source).toContain('127.0.0.1');
      expect(source).toContain('RETRY_DELAY_MS');
      expect(source).toContain('HEARTBEAT_MS');
      expect(source).toContain('queuedPayloads');
      expect(source).toContain('startHeartbeat(ctx)');
      expect(source).toContain('safeSessionSnapshot(ctx');
      expect(source).toContain('function isStaleContextError');
      expect(source).toContain('stopSessionTimers(session.piSessionId)');
      expect(source).toContain('void pollCommands(pi, ctx, session).catch');
      expect(source).not.toContain('void pollCommands(pi, ctx);');
      expect(source).not.toContain('send(ctx, { type: "remote_heartbeat" });');
      const transpiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        reportDiagnostics: true,
      });
      expect(transpiled.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error) ?? []).toEqual([]);

      await symlink(join(process.cwd(), 'node_modules'), join(home, 'node_modules'));
      const typecheck = await new Promise<{ exitCode: number | null; output: string }>((resolve) => {
        const child = spawn('bunx', [
          'tsc',
          '--noEmit',
          '--target', 'ES2022',
          '--module', 'NodeNext',
          '--moduleResolution', 'NodeNext',
          '--skipLibCheck',
          '--types', 'node',
          first.path,
        ], { cwd: process.cwd() });
        let output = '';
        child.stdout.on('data', (chunk) => { output += chunk.toString(); });
        child.stderr.on('data', (chunk) => { output += chunk.toString(); });
        child.on('close', (exitCode) => resolve({ exitCode, output }));
      });
      expect(typecheck.output).toBe('');
      expect(typecheck.exitCode).toBe(0);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
