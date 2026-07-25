# Lyntty Privacy Policy

Last updated: 2026-07-16

## Scope

Lyntty is an open-source, self-hosted control system for local `pi` sessions. This policy describes the software as shipped by the Lyntty project. A relay operator may have additional policies and responsibilities.

## Architecture

- Pi JSONL on the paired computer is canonical session history.
- The Lyntty App and `lynttyd` exchange data through a self-hosted `relay`.
- Session content, session metadata, machine metadata, attachments, and key envelopes are encrypted by Lyntty clients before relay storage where the protocol marks them as encrypted.
- The relay routes and stores ciphertext; it is not the canonical Pi-history store.

## Data handled by the relay

A relay needs some operational data to authenticate clients, order messages, route traffic, and manage presence. Depending on the feature used, this can include:

- account, machine, session, message, and local idempotency identifiers;
- sequence numbers, timestamps, presence, and connection state;
- encrypted message, metadata, attachment, and key-envelope payloads;
- push tokens and the minimal notification routing payload needed for Android notifications; and
- ordinary service logs, which may include request timing, error details, and network addresses configured by the operator's infrastructure.

The relay must not be treated as a backup for local Pi JSONL history.

## Data kept on devices

The App and paired computer keep credentials, encryption material, local settings, drafts, session state, and caches needed for operation. `lynttyd` and the Pi extension also maintain local queue, ownership, and recovery state under the configured Lyntty directories.

Protect device storage and backups. Anyone with access to local credentials or unlocked devices may be able to control paired sessions.

## Push notifications

When Android push is enabled, a push token and a minimal notification payload pass through the self-hosted relay and Expo's push delivery service, which uses the configured Firebase project for Android delivery. Do not put source code, secrets, or command output in notification text.

## Analytics, advertising, and subscriptions

Lyntty does not ship product analytics, advertising, social tracking, voice services, paywalls, or subscription telemetry. The project does not operate a hosted account or relay service as part of the software distribution.

## Retention and deletion

Relay retention is controlled by the self-host operator and the deployed database policy. Session and machine deletion removes the corresponding active records through supported product flows, subject to database transactions, backups, and operator retention procedures. Local Pi JSONL and local backups must be managed separately.

## Security responsibilities

Operators should:

- use HTTPS and restrict administrative access to the relay host;
- keep `LYNTTY_MASTER_SECRET`, pairing links, credentials, signing keys, and backups secret;
- install compatible signed releases and apply security updates;
- redact auth material and private content from logs and issue reports; and
- define backup, retention, incident-response, and lawful-access policies appropriate to their deployment.

## Your choices

You can stop using a relay, remove paired nodes, delete supported session records, clear local App data, or operate your own audited build. Removing App data does not automatically delete local Pi JSONL, relay backups, or operator logs.

## Changes and contact

Material policy changes are published in the repository. Use the official Lyntty issue tracker for non-sensitive questions. Vulnerabilities follow the private path in [`SECURITY.md`](./SECURITY.md). Never include credentials, complete pairing URLs, auth headers, encryption keys, signing material, private code, or other secrets in a public report.
