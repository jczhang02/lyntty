import { describe, expect, it, mock } from 'bun:test';
import { compatibilityBomFileBytes } from 'lyntty-wire/compatibility';
import { createSignedCompatibilityBomFixture } from 'lyntty-wire/compatibility/testing';
import { resolveChannelUpdate } from './channelUpdate';

function signedFetch(fixture: ReturnType<typeof createSignedCompatibilityBomFixture>) {
  return mock(async (input: string | URL | Request) => new Response(
    String(input).endsWith('.sig.json')
      ? JSON.stringify(fixture.signature)
      : compatibilityBomFileBytes(fixture.bom),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )) as unknown as typeof fetch;
}

describe('signed CLI channel updates', () => {
  it('selects the exact current-platform archive from a newer stable BOM', async () => {
    const fixture = createSignedCompatibilityBomFixture({ sequence: 8, cliVersion: '1.3.0' });
    const result = await resolveChannelUpdate({
      channel: 'stable',
      currentVersion: '1.2.0',
      trustStore: fixture.trustStore,
      target: 'linux-x64-gnu',
      fetcher: signedFetch(fixture),
    });
    expect(result).toMatchObject({
      available: true,
      channel: 'stable',
      releaseId: 'stable-8',
      sequence: 8,
      currentVersion: '1.2.0',
      candidateVersion: '1.3.0',
      archive: { target: 'linux-x64-gnu', artifactManifestSha256: 'b'.repeat(64) },
    });
  });

  it('reports a signed same-version candidate as current', async () => {
    const fixture = createSignedCompatibilityBomFixture({ sequence: 9, cliVersion: '1.2.0' });
    expect(await resolveChannelUpdate({
      channel: 'stable',
      currentVersion: '1.2.0',
      trustStore: fixture.trustStore,
      target: 'darwin-arm64',
      fetcher: signedFetch(fixture),
    })).toMatchObject({ available: false, candidateVersion: '1.2.0' });
  });

  it('treats a higher-sequence signed rollback as authoritative even when SemVer decreases', async () => {
    const rollback = createSignedCompatibilityBomFixture({ sequence: 12, cliVersion: '1.1.10' });
    expect(await resolveChannelUpdate({
      channel: 'stable',
      currentVersion: '1.2.0',
      minimumSequence: 11,
      trustStore: rollback.trustStore,
      target: 'linux-x64-gnu',
      fetcher: signedFetch(rollback),
    })).toMatchObject({ available: true, sequence: 12, candidateVersion: '1.1.10' });
  });

  it('requires an explicit preview URL and rejects stable trust for preview', async () => {
    const preview = createSignedCompatibilityBomFixture({ channel: 'preview', sequence: 10 });
    await expect(resolveChannelUpdate({
      channel: 'preview',
      currentVersion: '1.2.0',
      trustStore: preview.trustStore,
      target: 'windows-x64',
      fetcher: signedFetch(preview),
    })).rejects.toThrow('Preview update checks require --bom-url');

    const stable = createSignedCompatibilityBomFixture({ sequence: 10 });
    await expect(resolveChannelUpdate({
      channel: 'preview',
      currentVersion: '1.2.0',
      bomUrl: 'https://example.invalid/preview.json',
      trustStore: stable.trustStore,
      target: 'windows-x64',
      fetcher: signedFetch(preview),
    })).rejects.toThrow('Untrusted');
  });

  it('rejects a signed BOM delivered with non-canonical file bytes', async () => {
    const fixture = createSignedCompatibilityBomFixture({ sequence: 14 });
    const fetcher = mock(async (input: string | URL | Request) => new Response(
      String(input).endsWith('.sig.json')
        ? JSON.stringify(fixture.signature)
        : `${JSON.stringify(fixture.bom, null, 2)}\n`,
    )) as unknown as typeof fetch;
    await expect(resolveChannelUpdate({
      channel: 'stable', currentVersion: '1.2.0', trustStore: fixture.trustStore, fetcher,
    })).rejects.toThrow('not in canonical file form');
  });

  it('rejects tampered BOMs and replayed sequences', async () => {
    const fixture = createSignedCompatibilityBomFixture({ sequence: 11, cliVersion: '1.4.0' });
    fixture.bom.components.cli.version = '9.9.9';
    await expect(resolveChannelUpdate({
      channel: 'stable',
      currentVersion: '1.2.0',
      trustStore: fixture.trustStore,
      target: 'linux-arm64-gnu',
      fetcher: signedFetch(fixture),
    })).rejects.toThrow('digest does not match');

    const signed = createSignedCompatibilityBomFixture({ sequence: 11 });
    await expect(resolveChannelUpdate({
      channel: 'stable',
      currentVersion: '1.2.0',
      minimumSequence: 12,
      trustStore: signed.trustStore,
      target: 'linux-arm64-gnu',
      fetcher: signedFetch(signed),
    })).rejects.toThrow('older than accepted');
  });
});
