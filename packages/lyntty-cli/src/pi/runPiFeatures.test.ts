import { describe, expect, it } from 'vitest';

import { getPiPluginFeatureSummary, listPiRemoteSlashCommands } from './runPiFeatures';

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    promptTemplates: [],
    getActiveToolNames: () => ['read', 'bash'],
    getAllTools: () => [{ name: 'read' }, { name: 'bash' }, { name: 'custom_tool' }],
    ...overrides,
  } as any;
}

describe('listPiRemoteSlashCommands', () => {
  it('always exposes the Lyntty runtime command', () => {
    expect(listPiRemoteSlashCommands(makeSession())).toEqual(['/lyntty']);
  });

  it('includes extension commands, prompt templates, and skills', () => {
    const commands = listPiRemoteSlashCommands(makeSession({
      _extensionRunner: {
        getRegisteredCommands: () => [
          { invocationName: 'review' },
          { invocationName: '/ship' },
          { name: 'fallback' },
        ],
      },
      promptTemplates: [
        { name: 'plan' },
        { name: '/debug' },
      ],
      _resourceLoader: {
        getSkills: () => ({ skills: [{ name: 'tdd' }, { name: 'humanizer' }] }),
      },
    }));

    expect(commands).toEqual([
      '/lyntty',
      '/review',
      '/ship',
      '/fallback',
      '/plan',
      '/debug',
      '/skill:tdd',
      '/skill:humanizer',
    ]);
  });

  it('deduplicates and skips empty command names', () => {
    const commands = listPiRemoteSlashCommands(makeSession({
      _extensionRunner: {
        getRegisteredCommands: () => [
          { invocationName: 'lyntty' },
          { invocationName: '' },
          { invocationName: 'review' },
          { invocationName: '/review' },
        ],
      },
    }));

    expect(commands).toEqual(['/lyntty', '/review']);
  });
});

describe('getPiPluginFeatureSummary', () => {
  it('summarizes slash commands and tool capabilities', () => {
    expect(getPiPluginFeatureSummary(makeSession({
      promptTemplates: [{ name: 'plan' }],
    }))).toEqual({
      slashCommands: ['/lyntty', '/plan'],
      activeTools: ['read', 'bash'],
      configuredTools: ['read', 'bash', 'custom_tool'],
    });
  });
});
