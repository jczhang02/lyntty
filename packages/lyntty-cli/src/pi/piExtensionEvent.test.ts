import { describe, expect, it } from 'vitest';

import { installLynttyPiExtension } from './piExtensionInstall';
import { isLifecyclePiExtensionEvent, toPiAgentSessionEvent } from './piExtensionEvent';

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Pi extension event bridge', () => {
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
    expect(isLifecyclePiExtensionEvent({ type: 'message_update' })).toBe(false);
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
      expect(source).toContain('127.0.0.1');
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
