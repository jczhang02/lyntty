import { describe, expect, it } from 'vitest';

import { installLynttyPiExtension } from './piExtensionInstall';
import { isLifecyclePiExtensionEvent, parseLynttyPiRemoteCommand, toPiAgentSessionEvent } from './piExtensionEvent';

import { mkdtemp, readFile, rm } from 'node:fs/promises';
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

  it('installs a global Pi extension that defaults to local lynttyd sync', async () => {
    const home = await mkdtemp(join(tmpdir(), 'lyntty-pi-extension-'));
    try {
      const first = await installLynttyPiExtension(home);
      const second = await installLynttyPiExtension(home);
      const source = await readFile(first.path, 'utf8');

      expect(first.changed).toBe(true);
      expect(second.changed).toBe(false);
      expect(source).toContain('pi.registerCommand("remote"');
      expect(source).toContain('/pi-extension/event');
      expect(source).toContain('/pi-extension/commands');
      expect(source).toContain('/pi-extension/command-ack');
      expect(source).toContain('X-Lyntty-Extension-Token');
      expect(source).toContain('deliveryToken');
      expect(source).toContain('pi.sendUserMessage');
      expect(source).toContain('lyntty-mobile-context');
      expect(source).not.toContain('[lyntty] ');
      expect(source).toContain('pi.on("input"');
      expect(source).toContain('event.source === "extension"');
      expect(source).toContain('pi.on("message_end"');
      expect(source).toContain('safePiCommands');
      expect(source).toContain('invoke_pi_command');
      expect(source).toContain('deliverAs: "followUp"');
      expect(source).toContain('127.0.0.1');
      expect(source).toContain('RETRY_DELAY_MS');
      expect(source).toContain('HEARTBEAT_MS');
      expect(source).toContain('queuedPayloads');
      expect(source).toContain('startHeartbeat(ctx)');
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
