# R54 auth request relay-unreachable handling

Date: 2026-07-05

## User report

`lyntty auth login --force --method mobile` failed before showing a pairing URL:

```text
Failed to create authentication request, please try again later.
Authentication failed: Authentication failed or was cancelled
```

## Diagnosis

Reproduced locally. With `DEBUG=1`, the root cause was:

```text
AxiosError: connect ECONNREFUSED 127.0.0.1:3005
```

The CLI was pointed at `http://127.0.0.1:3005`, but no local Lyntty relay was listening there. The old message hid the actionable cause.

## Fix

- `doAuth()` and `waitForAuthentication()` now format auth-request failures by network/status class.
- `ECONNREFUSED` now explicitly tells the user to start the self-hosted relay and retry auth:

```text
Failed to create authentication request against http://127.0.0.1:3005.
Lyntty relay is not running or is not reachable at that address. Start your self-hosted relay, then retry:
  lyntty server --host 0.0.0.0 --port 3005
  lyntty auth login --force --method mobile
```

## Verification

- `pnpm --filter ./packages/lyntty-cli exec vitest run --project unit src/ui/auth.test.ts` — pass, 2 tests.
- `pnpm --filter ./packages/lyntty-cli typecheck` — pass.
- `lyntty auth login --force --method mobile` with no relay on `127.0.0.1:3005` — prints actionable relay-start recovery.
- Isolated temp-home relay on `127.0.0.1:3020` + `LYNTTY_SERVER_URL=http://127.0.0.1:3020 timeout 5s lyntty auth login --force --method mobile` — reaches `Mobile Authentication` and prints a `lyntty://terminal?...` pairing URL instead of failing auth request creation.

## User recovery

Start relay first, then auth:

```bash
lyntty server --host 0.0.0.0 --port 3005
lyntty auth login --force --method mobile
```
