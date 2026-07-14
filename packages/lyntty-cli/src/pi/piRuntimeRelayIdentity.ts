import { resolvePiRelaySessionTag } from './piRelaySessionTag';

export async function createPiRuntimeRelayIdentity<T extends { session: { sessionId: string } }>(options: {
  machineId: string;
  cwd: string;
  requestedPiSessionId?: string;
  createRuntime: (cwd: string, requestedPiSessionId?: string) => Promise<T>;
}): Promise<{ piRuntime: T; sessionTag: string }> {
  const piRuntime = await options.createRuntime(options.cwd, options.requestedPiSessionId);
  return {
    piRuntime,
    sessionTag: resolvePiRelaySessionTag(options.machineId, piRuntime.session.sessionId),
  };
}
