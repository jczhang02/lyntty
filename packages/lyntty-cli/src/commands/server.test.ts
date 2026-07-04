import { describe, expect, it } from 'vitest';

import { isPgliteOpenAbort } from './server';

describe('lyntty server PGlite recovery detection', () => {
  it('detects PGlite open aborts from bundled relay output', () => {
    expect(isPgliteOpenAbort(`RuntimeError: Aborted(). Build with -sASSERTIONS for more info.\n      at async _checkReady (/bunfs/root/lyntty-relay:7217:33)`)).toBe(true);
  });

  it('does not treat arbitrary relay failures as PGlite open aborts', () => {
    expect(isPgliteOpenAbort('Error: Failed to apply 20260704062000_auth_request_expiry_consumption')).toBe(false);
  });
});
