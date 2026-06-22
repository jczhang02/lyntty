# PRD: Mobile Vibe Coding Web + APK

Issue title: Build mobile web and Android app for remote vibe coding
Triage label: ready-for-agent

## Problem Statement

Developers want to keep coding with local AI coding agents from a phone, but current terminal-first workflows are hard to supervise on mobile. Long-running coding sessions require desktop presence, local project access, permission approval, command output review, and context handoff. SSH or generic remote desktop tools expose too much surface area and feel poor on small screens.

lyntty should become a mobile-first web app plus Android APK that lets a user control local or remote agent sessions from a phone while preserving workstation context: repository files, shell tools, MCP servers, agent configuration, and existing session state stay on the host machine. The phone becomes a safe, responsive control surface for vibe coding.

Reference products: Claude Code Remote Control, MindFS, and Litter.

## Solution

Build lyntty as a self-hosted agent gateway with two clients:

- a responsive web app/PWA for browser access;
- an Android APK wrapping the same mobile-optimized experience with native affordances where needed.

Users run lyntty on a workstation or remote server, pair the phone through a local URL, QR code, private network, SSH tunnel, or relay-compatible channel, then start or resume AI coding sessions. The mobile UI streams agent output, renders tool calls and permission prompts as structured cards, supports text and voice-friendly prompt entry, lets users browse referenced files, and keeps sessions alive across reconnects.

Core value: code execution and project context remain on the host; mobile device controls and reviews work.

## User Stories

1. As a mobile developer, I want to pair my phone with my workstation by scanning a QR code, so that I can start controlling coding sessions without typing host details.
2. As a mobile developer, I want to open lyntty in a browser, so that I can use it from any phone without installing an app.
3. As an Android user, I want an APK, so that I can launch lyntty like a native mobile app.
4. As a developer away from my desk, I want to resume an existing agent session, so that I can continue work without re-explaining context.
5. As a developer, I want session state synced between terminal, web, and APK, so that messages and output stay consistent across devices.
6. As a developer, I want agent execution to remain on my host machine, so that local files, tools, MCP servers, and credentials never need to move to the phone.
7. As a developer, I want token-by-token streaming output, so that I can supervise progress in real time.
8. As a developer, I want tool calls rendered as collapsible cards, so that command execution is readable on a small screen.
9. As a developer, I want permission prompts surfaced clearly, so that I can approve or reject risky agent actions from my phone.
10. As a developer, I want command results adapted to phone width, so that logs and diffs are readable without horizontal chaos.
11. As a developer, I want code blocks, markdown, images, and file previews rendered well, so that review does not require switching to desktop.
12. As a developer, I want to browse a project file tree, so that I can inspect files referenced by the agent.
13. As a developer, I want @ file reference completion, so that I can attach project files to prompts quickly.
14. As a developer, I want slash commands or quick actions, so that repeated workflows are fast on mobile.
15. As a developer, I want saved prompt shortcuts, so that common steering messages can be sent with few taps.
16. As a developer, I want a mobile-optimized composer above the soft keyboard, so that long prompts remain editable.
17. As a developer walking or commuting, I want voice input support, so that I can steer sessions hands-free.
18. As a developer, I want reconnect behavior after network drops, so that long-running sessions survive mobile connectivity changes.
19. As a developer, I want host sleep or process restart recovery when possible, so that session bindings are restored after interruption.
20. As a developer, I want multiple projects, so that workspaces stay separate and context does not leak.
21. As a developer, I want multiple agents, so that I can choose Claude Code, Codex, Pi, OpenCode, or another local CLI per session.
22. As a developer, I want agent discovery, so that installed local agents can be detected instead of manually configured.
23. As a developer, I want SSH connection support, so that I can start sessions on a remote server from mobile.
24. As a developer, I want local-network discovery where available, so that setup on home Wi-Fi is low-friction.
25. As a developer, I want a private-network mode, so that Tailscale or similar setups work without relay infrastructure.
26. As a developer, I want relay-compatible pairing as a future-compatible mode, so that NAT and firewall limitations do not block use.
27. As a developer, I want clear connection status, so that I know whether the phone, host, and agent are online.
28. As a developer, I want notifications for completed tasks and permission prompts, so that I can leave the app without missing important events.
29. As a developer, I want background-safe Android behavior, so that ongoing sessions remain observable after app switching.
30. As a developer, I want secrets to stay on the host, so that phone loss does not expose API keys or repository credentials.
31. As a developer, I want pairing revocation, so that lost or old devices can be removed.
32. As a developer, I want session search, so that I can find previous coding work by title or message content.
33. As a developer, I want session titles and project labels, so that many concurrent workstreams remain navigable.
34. As a developer, I want readable diffs, so that I can review agent edits from mobile before accepting work.
35. As a developer, I want a safe stop/interrupt action, so that I can halt a bad agent run immediately.
36. As a developer, I want follow-up messages to target the same underlying agent session, so that continuity is preserved.
37. As a developer, I want mobile UI gestures for panels, so that chat, files, and output can be navigated with one thumb.
38. As a developer, I want dark mode and compact density, so that long mobile review sessions remain comfortable.
39. As a developer, I want install/update guidance for host agents, so that missing agent dependencies are visible.
40. As a developer, I want logs for connection and session errors, so that setup problems can be diagnosed.

## Implementation Decisions

- lyntty will be host-first: agent processes, repository access, shell execution, credentials, and MCP/tooling remain on the workstation or server.
- lyntty will expose a gateway service that owns pairing, session lifecycle, agent process orchestration, streaming transport, permission events, file metadata, and reconnect state.
- Web and Android will share product behavior and UI vocabulary. APK should reuse the web app where practical, adding native shell only for notifications, deep links, QR handling, background behavior, and secure local storage.
- Session is the primary domain object. A session binds project, selected agent, agent process identity, transcript, streaming state, permissions, file references, and connected clients.
- Project is a first-class domain object. It scopes file browsing, session lists, agent launch directory, and persisted metadata.
- Agent adapter is a pluggable interface. Initial adapters should target one or two local CLIs, but the model must not hard-code a single vendor.
- Transport should support low-latency bidirectional streaming for messages, tool events, permission prompts, connection status, and file previews.
- Pairing should support QR-based local pairing first. Tokenized session URLs should be short-lived and revocable.
- Remote access modes should be layered: local browser access first, private network/SSH second, relay-compatible channel later.
- File browsing should be read-first for MVP. Write actions should happen through agent sessions or explicit future workflows, not arbitrary mobile file editing.
- Permission prompts should be explicit, modal enough to prevent accidental taps, and include command/action summary, risk category, and allow/deny controls.
- Mobile navigation should optimize for three panels: session chat, structured output/tool cards, and project files. One panel visible at a time on narrow screens.
- The composer should support text input, attachments/file references, slash commands, prompt shortcuts, and later voice input.
- Session persistence should survive browser refresh and mobile reconnect. If the underlying agent cannot resume, lyntty should report the broken binding and offer a new session.
- Security model should assume the phone is less trusted than the host. Pairing tokens should be scoped, revocable, and not grant direct shell beyond mediated agent controls.
- Observability should include connection state, agent state, last event time, and recoverable error messages.
- MVP should favor one robust vertical slice over broad agent coverage: pair phone, open project, start/resume session, stream output, approve prompt, inspect file, reconnect.

## Testing Decisions

- Highest-value seam: end-to-end session gateway behavior exercised through the public client/server contract. Tests should drive the same protocol the web/APK uses and assert observable behavior: pairing, session start, streaming events, permission prompt delivery, user response, reconnect, and session resume.
- Good tests should verify external behavior, not implementation details. They should assert messages, events, state transitions, and security boundaries visible to clients.
- Agent adapters should be tested with fake agent processes that emit deterministic streaming output, tool events, permission prompts, and exit states.
- Pairing should be tested at API/protocol level: token creation, expiry, successful binding, revocation, invalid token rejection, and multi-device behavior.
- Session lifecycle should be tested at service level: create, resume, interrupt, reconnect, broken binding handling, and concurrent client sync.
- File access should be tested through public file browsing/preview APIs: project scoping, path traversal rejection, binary/large file handling, and supported renderer metadata.
- Mobile UI should have behavior tests around panel navigation, composer behavior with soft-keyboard constraints, permission prompt controls, reconnect banners, and streaming card rendering.
- Android APK smoke tests should verify app launch, deep link/QR link handling, persisted host connection, notification permission path, and webview/PWA bridge behavior if used.
- Security tests should cover unauthenticated access rejection, expired pairing token rejection, revoked device rejection, path traversal, and no raw secret leakage in client-visible state.
- Prior art: MindFS-style mobile web gateway, Claude Code Remote Control-style local execution with remote control surface, and Litter-style native mobile client with local/SSH/peer pairing.

## Out of Scope

- Full cloud-hosted agent execution.
- Building a general mobile IDE with arbitrary file editing as primary workflow.
- Shipping every agent adapter in the first milestone.
- iOS native app for first milestone.
- Public relay infrastructure for first milestone unless a relay already exists.
- Multi-user team administration.
- App store distribution.
- Built-in AI model hosting.
- Replacing terminal/desktop workflows entirely.
- Unmediated remote shell exposed directly to the phone.

## Further Notes

- Repository currently has no source files, ADRs, or existing issue tracker metadata, so this PRD defines initial product seams rather than modifying existing architecture.
- Reference behaviors worth borrowing:
  - Claude Code Remote Control: local execution, QR pairing, synced phone/browser/terminal control, reconnect semantics.
  - MindFS: multi-agent gateway, mobile web UI, file browser, structured tool cards, local/private/relay modes, project-scoped metadata.
  - Litter: native iOS/Android posture, local discovery, SSH connection, QR pairing, voice input, thin platform clients.
- Suggested first milestone: one host service, one agent adapter, responsive web/PWA, Android wrapper, QR local pairing, session streaming, permission prompts, reconnect, read-only file browser.
