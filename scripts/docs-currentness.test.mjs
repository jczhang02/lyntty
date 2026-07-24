import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { test } from 'bun:test';

const paths = {
  contextMap: new URL('../CONTEXT-MAP.md', import.meta.url),
  duplicateContextMap: new URL('../CONTEXT-MAP.lyntty.md', import.meta.url),
  context: new URL('../docs/contexts/product/CONTEXT.md', import.meta.url),
  contextZh: new URL('../docs/contexts/product/CONTEXT.zh.md', import.meta.url),
  duplicateContext: new URL('../docs/contexts/product/CONTEXT.lyntty.md', import.meta.url),
  rootReadme: new URL('../README.md', import.meta.url),
  docsReadme: new URL('../docs/README.md', import.meta.url),
  prd: new URL('../docs/prds/lyntty-product.md', import.meta.url),
  prdZh: new URL('../docs/prds/lyntty-product.zh.md', import.meta.url),
  roadmap: new URL('../docs/roadmap.md', import.meta.url),
  roadmapZh: new URL('../docs/roadmap.zh.md', import.meta.url),
  importedRoadmap: new URL('../docs/roadmap.lyntty.md', import.meta.url),
  piResearch: new URL('../docs/research/lyntty-pi-agent.md', import.meta.url),
  discoveryResearch: new URL('../docs/research/lyntty-session-discovery.md', import.meta.url),
  orphanScreenshot: new URL('../docs/research/agent-teams-claude-code-stuck-non-interactive.png', import.meta.url),
  forkPlan: new URL('../docs/architecture/lyntty-fork-pi-plan.md', import.meta.url),
  mobileShell: new URL('../docs/architecture/mobile-shell.md', import.meta.url),
  sharedControl: new URL('../docs/architecture/pi-shared-control.md', import.meta.url),
  standardization: new URL('../docs/standardization/PLAN.md', import.meta.url),
  standardizationZh: new URL('../docs/standardization/PLAN.zh.md', import.meta.url),
  relayDeploy: new URL('../docs/deploy/relay-vps.md', import.meta.url),
  relayDeployZh: new URL('../docs/deploy/relay-vps.zh.md', import.meta.url),
  importEvidence: new URL('../docs/evidence/h0-lyntty-import.md', import.meta.url),
  siteGenerator: new URL('../docs/.site/scripts/prepare-fumadocs-pages.mjs', import.meta.url),
};

async function read(path) {
  return readFile(path, 'utf8');
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('current context points only to present normative sources', async () => {
  const [contextMap, context, contextZh] = await Promise.all([
    read(paths.contextMap),
    read(paths.context),
    read(paths.contextZh),
  ]);

  for (const document of [contextMap, context, contextZh]) {
    assert.doesNotMatch(document, /docs\/architecture\/protocol-v0\.md/);
    assert.doesNotMatch(document, /docs\/evidence\/m0-m2\.md/);
    assert.match(document, /docs\/architecture\/pi-shared-control\.md/);
    assert.match(document, /docs\/release\/android-apk\.md/);
  }

  for (const document of [context, contextZh]) {
    assert.doesNotMatch(document, /Review Evidence/);
    assert.match(document, /Session Remote/);
    assert.match(document, /Pi JSONL.*canonical|canonical.*Pi JSONL/is);
  }
});

test('redundant imported copies and an unowned screenshot are removed with disposition evidence', async () => {
  for (const path of [paths.duplicateContextMap, paths.duplicateContext, paths.orphanScreenshot]) {
    assert.equal(await exists(path), false, `${path.pathname} should be removed`);
  }

  const evidence = await read(paths.importEvidence);
  assert.match(evidence, /## Later disposition|## 后续处置/);
  assert.match(evidence, /CONTEXT-MAP\.lyntty\.md.*CONTEXT-MAP\.md/is);
  assert.match(evidence, /CONTEXT\.lyntty\.md.*CONTEXT\.md/is);
});

test('entry points separate current docs from historical migration records', async () => {
  const [rootReadme, docsReadme, roadmap, roadmapZh, importedRoadmap, piResearch, discoveryResearch, forkPlan, mobileShell, siteGenerator] = await Promise.all([
    read(paths.rootReadme),
    read(paths.docsReadme),
    read(paths.roadmap),
    read(paths.roadmapZh),
    read(paths.importedRoadmap),
    read(paths.piResearch),
    read(paths.discoveryResearch),
    read(paths.forkPlan),
    read(paths.mobileShell),
    read(paths.siteGenerator),
  ]);

  assert.match(rootReadme, /## Current documentation/);
  assert.match(rootReadme, /## Historical (migration )?(records|context)/i);
  assert.match(docsReadme, /## Current product and operations/);
  assert.match(docsReadme, /## Historical (migration )?(records|context)/i);

  for (const document of [roadmap, roadmapZh, importedRoadmap, piResearch, discoveryResearch, forkPlan, mobileShell]) {
    assert.match(document.slice(0, 900), /historical|历史|superseded|已完成/i);
    assert.match(document.slice(0, 1200), /AGENTS\.md|docs\/contexts\/product\/CONTEXT\.md|pi-shared-control\.md/);
  }

  assert.match(siteGenerator, /Historical Migration Roadmap/);
  assert.match(siteGenerator, /历史迁移路线图/);
});

test('current PRD uses current product surfaces, topology, and package map', async () => {
  const [prd, prdZh] = await Promise.all([read(paths.prd), read(paths.prdZh)]);

  for (const document of [prd, prdZh]) {
    assert.doesNotMatch(document, /Review Evidence/);
    assert.doesNotMatch(document, /apps\/client\//);
    assert.doesNotMatch(document, /packages\/client-core\//);
    assert.doesNotMatch(document, /unknown commands may be sent raw|unknown commands.*raw fallback/is);
    assert.match(document, /packages\/lyntty-app/);
    assert.match(document, /packages\/lyntty-wire/);
    assert.match(document, /`lyntty remote`.*control-plane|control-plane.*`lyntty remote`/is);
    assert.doesNotMatch(document, /Current work should first prove|当前开发先证明/);
    assert.match(document, /established minimum acceptance path|已经建立的最小验收链路/i);
    assert.doesNotMatch(document, /Hono|HeroUI|TanStack Query|SQLite WAL/);
    assert.doesNotMatch(document, /default(?:s)? to (?:temporary )?worktree|默认 worktree-if-git|默认使用 temporary worktree/i);
    assert.match(document, /Fastify.*PGlite|PGlite.*Fastify/is);
    assert.match(document, /Zustand.*MMKV|MMKV.*Zustand/is);
    assert.match(document, /worktree.*explicit|worktree.*显式/is);
  }
});

test('accepted architecture and delivery plan declare their current implementation status', async () => {
  const [sharedControl, standardization, standardizationZh, relayDeploy, relayDeployZh] = await Promise.all([
    read(paths.sharedControl),
    read(paths.standardization),
    read(paths.standardizationZh),
    read(paths.relayDeploy),
    read(paths.relayDeployZh),
  ]);

  assert.doesNotMatch(sharedControl, /## Open implementation work/);
  assert.match(sharedControl, /## Implementation status/);
  assert.match(sharedControl, /docs\/evidence\/r50-pi-shared-control\.md/);
  assert.match(sharedControl, /durable command intent.*implemented|implemented.*durable command intent/is);
  assert.match(sharedControl, /invoke_pi_command/);
  assert.match(sharedControl, /hidden `lyntty-mobile-context`/);
  assert.match(sharedControl, /r57-mobile-send-echo-merge\.md/);
  assert.doesNotMatch(sharedControl, /Default source label for extension-injected user messages/);

  assert.match(standardization.slice(0, 500), /completed|complete|已完成/i);
  assert.doesNotMatch(standardization, /implementation remains on `refactor\/bun-migration`/i);
  assert.match(standardizationZh.slice(0, 500), /已完成|完成/);

  assert.match(relayDeploy.slice(0, 600), /r104-stable-relay-production-deployment\.md/);
  assert.match(relayDeploy, /Stable sequence 1/);
  assert.match(relayDeploy, /`lyntty remote`.*connect.*Relay/is);
  assert.match(relayDeploy, /Only `lynttyd` bridges node-side Pi sessions/i);
  assert.match(relayDeployZh.slice(0, 500), /2026-07-23/);
  assert.match(relayDeployZh, /r104-stable-relay-production-deployment\.md/);
  assert.match(relayDeployZh, /VPS copied-data.*restore drill.*仍待执行/is);
});
