import { mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ReleaseChannel } from 'lyntty-wire/compatibility';
import { writeJsonAtomically } from './atomicFile';

export type AcceptedReleaseChannelState = {
  schemaVersion: 1;
  channel: ReleaseChannel;
  sequence: number;
  bomSha256: string;
  releaseId: string;
  observedAt: number;
};

const STATE_FILE_PATTERN = /^(\d+)-([a-f0-9]{64})\.json$/;

function parseState(value: unknown, expectedChannel: ReleaseChannel): AcceptedReleaseChannelState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Release channel state is malformed');
  const state = value as Partial<AcceptedReleaseChannelState>;
  if (
    state.schemaVersion !== 1
    || state.channel !== expectedChannel
    || typeof state.sequence !== 'number'
    || !Number.isSafeInteger(state.sequence)
    || state.sequence < 0
    || typeof state.bomSha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(state.bomSha256)
    || typeof state.releaseId !== 'string'
    || !state.releaseId
    || typeof state.observedAt !== 'number'
    || !Number.isSafeInteger(state.observedAt)
    || state.observedAt < 0
  ) throw new Error('Release channel state is malformed');
  return state as AcceptedReleaseChannelState;
}

function channelDirectory(root: string, channel: ReleaseChannel): string {
  return join(root, channel);
}

export async function readAcceptedReleaseChannelState(
  root: string,
  channel: ReleaseChannel,
): Promise<AcceptedReleaseChannelState | null> {
  const directory = channelDirectory(root, channel);
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const states: AcceptedReleaseChannelState[] = [];
  for (const name of names.sort()) {
    const match = STATE_FILE_PATTERN.exec(name);
    if (!match) throw new Error(`Unexpected release channel state file: ${name}`);
    const state = parseState(JSON.parse(await readFile(join(directory, name), 'utf8')), channel);
    if (String(state.sequence) !== match[1] || state.bomSha256 !== match[2]) {
      throw new Error(`Release channel state filename does not match content: ${name}`);
    }
    states.push(state);
  }
  if (states.length === 0) return null;
  const highestSequence = Math.max(...states.map(state => state.sequence));
  const highest = states.filter(state => state.sequence === highestSequence);
  if (new Set(highest.map(state => state.bomSha256)).size !== 1) {
    throw new Error(`Release channel sequence ${highestSequence} has conflicting signed BOM digests`);
  }
  return highest[0]!;
}

export async function rememberAcceptedReleaseChannelState(
  root: string,
  next: Omit<AcceptedReleaseChannelState, 'schemaVersion' | 'observedAt'>,
): Promise<AcceptedReleaseChannelState> {
  const current = await readAcceptedReleaseChannelState(root, next.channel);
  if (current && next.sequence < current.sequence) {
    throw new Error(`Release BOM sequence ${next.sequence} is older than accepted sequence ${current.sequence}`);
  }
  if (current && next.sequence === current.sequence && next.bomSha256 !== current.bomSha256) {
    throw new Error(`Release channel sequence ${next.sequence} has conflicting signed BOM digests`);
  }
  if (current && next.sequence === current.sequence) return current;
  const state: AcceptedReleaseChannelState = {
    schemaVersion: 1,
    ...next,
    observedAt: Date.now(),
  };
  const directory = channelDirectory(root, next.channel);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeJsonAtomically(join(directory, `${state.sequence}-${state.bomSha256}.json`), state, 0o600);
  const accepted = await readAcceptedReleaseChannelState(root, next.channel);
  if (!accepted || accepted.sequence !== state.sequence || accepted.bomSha256 !== state.bomSha256) {
    throw new Error('A newer release channel sequence won the acceptance race');
  }
  return accepted;
}
