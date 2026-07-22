# R105 — Development lifecycle ownership race

Date: 2026-07-22

Branch: `fix/dev-ownership-race`

Bead: `lyntty-24v.5`

## Result

The Linux `ci:dev` claim/receipt recovery failure was reproduced at the process-identity boundary and fixed without weakening ownership checks.

Failed PR #44 checks that exposed the race:

- workflow run `29884117565`
- initial job `88811027850`
- rerun job `88812201145`

The first recovery test could observe a receipt and then receive exit code `1` from `dev:down`. Its failure left a live recovered instance, so the following crash-hook test could reuse that instance and incorrectly return exit code `0` instead of exercising the hook.

## Root cause

`supervisorOwnership()`, child ownership, and descendant ownership first checked a PID with `kill(pid, 0)`, then asynchronously read `/proc`, `lsof`, the process start token, command, environment, and working directory. A short-lived process could exit during those reads. The old failure paths still returned `alive: true`, even when the PID had disappeared or had become a zombie. Receipt reconciliation therefore treated a normal exit race as an unproven live process and failed closed before `dev:down` could recover the process group.

A controlled harness kept each killed child unreaped until ownership classification completed. Across 100 iterations:

```text
old={"count":100,"falseAlive":100,"stopped":0}
fixed={"count":100,"falseAlive":0,"stopped":100}
```

The regression in `scripts/dev.test.ts` uses the same ordering: start the ownership proof, kill the process during its first asynchronous identity read, classify it before awaiting child reaping, and require `not-running`. The pre-fix implementation fails this test.

## Fix and safety properties

- Every failed supervisor, child, descendant, and unrelated-group-member identity proof now refreshes process status before returning an ownership failure.
- A disappeared or zombie PID is `not-running`; it no longer blocks recovery.
- A still-live PID, a PID reused by a non-zombie process, or an unreadable status refresh remains fail-closed and is never signaled without complete ownership proof.
- Receipt waiting and reconciliation use the same ownership result instead of a separate stale liveness/start-token decision.
- Before deleting a receipt after an empty stale process-group snapshot, reconciliation enumerates the group again. A newly observed non-zombie member preserves the receipt and requests a retry.
- Failure assertions now include the captured command result so a future CI failure identifies the rejected lifecycle phase instead of only reporting an exit-code mismatch.

No production Relay, Preview profile, global Pi extension, or live user session was touched.

## Verification

Passed locally in the isolated worktree:

```text
CI=true bun test scripts/dev.test.ts --test-name-pattern 'exits during identity proof'
1 pass, 0 fail

CI=true bun run ci:dev
36 pass, 0 fail

bun run ci:audit
No vulnerabilities found

CI=true bun run ci:fast
pass (repo hardening, audit, Wire, CLI, Relay, app, development lifecycle, diff check)

git diff --check
pass
```

An independent final review reported no P0/P1/P2 findings after checking PID reuse, zombie handling, process-group refresh, receipt retention, and fail-closed behavior.

## Not run and residual risk

- No Android or physical-device behavior changed, so no APK/device test was run for this fix.
- No production deployment or rollback was run.
- Linux and macOS protected PR checks remain the merge gate; this evidence does not claim them before GitHub reports completion.
