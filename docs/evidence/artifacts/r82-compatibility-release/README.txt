TEST-ONLY validation BOM signed with the deterministic test key from lyntty-wire compatibility fixtures.
Production release tooling explicitly rejects this key ID, public root, and private seed. It is not a Stable/Preview trust root and is not a publishable release candidate. Native-signing references are schema fixtures only; they are not macOS notarization or Windows Authenticode evidence.
The retained files prove canonical file-byte signing (including the final LF), channel identity, immutable references, and current-plus-two rolling matrix behavior.
validation-bom.json SHA-256: fa8896865d1293add4dca2a7df6000c6e7c5c6ae599d8baa34e9ef564577602f
validation-bom.sig.json SHA-256: 829fd82734262801500e6334f12d9e9a473af2ab57ef3dda7acbd1d89409eeaa
