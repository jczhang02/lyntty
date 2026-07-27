# Security policy

[简体中文](./SECURITY.zh.md)

## Supported releases

Security fixes target the current Stable Compatibility Release shown as GitHub Latest. Preview and Expo Dev builds are not supported release channels for security fixes. Old releases, Actions artifacts, source snapshots, and locally modified builds do not receive security support.

Lyntty is owner-operated and self-hosted. `relay` operators remain responsible for host security, TLS, access control, backups, retention, and incident response for their deployment.

## Report a vulnerability

GitHub Private Vulnerability Reporting is the intended private channel. If GitHub shows the report form at [this advisory URL](https://github.com/jczhang02/lyntty/security/advisories/new), submit the report there.

If the private form is unavailable, open a [detail-free security contact request](https://github.com/jczhang02/lyntty/issues/new?template=security-contact.yml). That request is public. Include only the confirmation requested by the form. The maintainer will arrange a private contact path before asking for technical information.

A useful private report includes:

- the affected App, CLI/`lynttyd`, `relay`, Pi extension, Wire, workflow, or release artifact;
- exact version, release tag, source commit, image digest, or asset name;
- expected impact and the conditions required to reproduce it;
- minimal reproduction steps;
- sanitized logs or screenshots when they help explain the issue.

Remove credentials, complete pairing URLs, auth headers, encryption keys, signing keys, private code, request bodies, and private command output before attaching evidence. Do not test against systems, accounts, or nodes that you do not own or have permission to assess.

## Response expectations

The maintainer handles reports on a best-effort basis. There is no response SLA, bounty program, or guaranteed release schedule. Confirmed issues are triaged against the current Stable release, coordinated privately when disclosure timing matters, and documented publicly after a fix or mitigation is available when that is safe.

## Public bug reports

Use the regular [bug form](https://github.com/jczhang02/lyntty/issues/new?template=bug.yml) for non-sensitive defects. Follow its redaction checklist. Keep vulnerability details in the private conversation arranged through the process above.
