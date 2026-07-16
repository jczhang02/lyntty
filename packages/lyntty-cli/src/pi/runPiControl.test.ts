import { describe, expect, it } from 'bun:test';

import { PiCommandLedger, resolvePiRemoteAction } from './runPiControl';

const slashPolicy = {
  supportedSlashCommands: ['/lyntty'],
  localOnlySlashCommands: ['/model', '/settings'],
};

describe('resolvePiRemoteAction', () => {
  it('sends idle text as a new prompt', () => {
    expect(resolvePiRemoteAction({ text: 'build the feature', isStreaming: false, ...slashPolicy })).toEqual({
      kind: 'prompt',
      text: 'build the feature',
    });
  });

  it('queues running text as follow-up by default', () => {
    expect(resolvePiRemoteAction({ text: 'also add tests', isStreaming: true, ...slashPolicy })).toEqual({
      kind: 'followUp',
      text: 'also add tests',
    });
  });

  it('requires explicit redirect while running', () => {
    expect(resolvePiRemoteAction({ text: '/redirect stop polishing and fix auth first', isStreaming: true, ...slashPolicy })).toEqual({
      kind: 'steer',
      text: 'stop polishing and fix auth first',
    });
  });

  it('maps stop commands to abort', () => {
    expect(resolvePiRemoteAction({ text: '/stop', isStreaming: true, ...slashPolicy })).toEqual({
      kind: 'abort',
      reason: 'user_requested_stop',
    });
  });

  it('blocks local-only slash commands from remote prompt delivery', () => {
    expect(resolvePiRemoteAction({ text: '/model sonnet', isStreaming: false, ...slashPolicy })).toEqual({
      kind: 'localOnlySlash',
      command: '/model',
      reason: 'local_only',
    });
  });

  it('blocks unknown slash commands until Pi declares support', () => {
    expect(resolvePiRemoteAction({ text: '/unknown arg', isStreaming: false, ...slashPolicy })).toEqual({
      kind: 'localOnlySlash',
      command: '/unknown',
      reason: 'unsupported',
    });
  });
});

describe('PiCommandLedger', () => {
  it('claims unique command keys once for idempotent remote delivery', () => {
    const ledger = new PiCommandLedger();

    expect(ledger.claim('cmd-1')).toBe(true);
    expect(ledger.claim('cmd-1')).toBe(false);
    expect(ledger.claim('cmd-2')).toBe(true);
  });

  it('allows commands without keys because they cannot be deduped safely', () => {
    const ledger = new PiCommandLedger();

    expect(ledger.claim(undefined)).toBe(true);
    expect(ledger.claim(undefined)).toBe(true);
  });
});
