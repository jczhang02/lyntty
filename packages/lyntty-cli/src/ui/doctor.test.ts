import { describe, expect, it } from 'bun:test';

import { redactDaemonStateForDisplay } from './doctor';

describe('redactDaemonStateForDisplay', () => {
  it('never exposes the Pi extension control token', () => {
    const displayed = redactDaemonStateForDisplay({
      pid: 123,
      httpPort: 4567,
      piExtensionToken: 'super-secret-token',
      startTime: 'now',
      startedWithCliVersion: '1.2.3',
    });

    expect(displayed).toEqual({
      pid: 123,
      httpPort: 4567,
      piExtensionToken: '<redacted>',
      startTime: 'now',
      startedWithCliVersion: '1.2.3',
    });
    expect(JSON.stringify(displayed)).not.toContain('super-secret-token');
  });
});
