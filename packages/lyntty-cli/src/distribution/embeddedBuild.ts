import packageJson from '../../package.json';

declare const __LYNTTY_BUILD_VERSION__: string;
declare const __LYNTTY_BUILD_RELEASE_ID__: string;
declare const __LYNTTY_BUILD_TARGET_ID__: string;

export interface EmbeddedBuildIdentity {
  version: string;
  releaseId: string | null;
  targetId: string | null;
}

export function embeddedBuildIdentity(): EmbeddedBuildIdentity {
  return {
    version: typeof __LYNTTY_BUILD_VERSION__ === 'string' ? __LYNTTY_BUILD_VERSION__ : packageJson.version,
    releaseId: typeof __LYNTTY_BUILD_RELEASE_ID__ === 'string' ? __LYNTTY_BUILD_RELEASE_ID__ : null,
    targetId: typeof __LYNTTY_BUILD_TARGET_ID__ === 'string' ? __LYNTTY_BUILD_TARGET_ID__ : null,
  };
}
