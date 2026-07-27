import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'bun:test';

const rootPackagePath = new URL('../package.json', import.meta.url);
const cliPackagePath = new URL('../packages/lyntty-cli/package.json', import.meta.url);
const relayPackagePath = new URL('../packages/lyntty-relay/package.json', import.meta.url);
const docsPackagePath = new URL('../docs/.site/package.json', import.meta.url);
const guidePaths = {
  root: new URL('../AGENTS.md', import.meta.url),
  app: new URL('../packages/lyntty-app/AGENTS.md', import.meta.url),
  cli: new URL('../packages/lyntty-cli/AGENTS.md', import.meta.url),
  relay: new URL('../packages/lyntty-relay/AGENTS.md', import.meta.url),
  wire: new URL('../packages/lyntty-wire/AGENTS.md', import.meta.url),
  docs: new URL('../docs/AGENTS.md', import.meta.url),
  docsSite: new URL('../docs/.site/AGENTS.md', import.meta.url),
};

async function readGuides() {
  return Object.fromEntries(await Promise.all(Object.entries(guidePaths).map(async ([name, path]) => [
    name,
    await readFile(path, 'utf8'),
  ])));
}

test('root guide defines instruction hierarchy and evidence authority', async () => {
  const { root, app, cli, relay, wire, docs, docsSite } = await readGuides();

  assert.match(root, /## Instruction hierarchy/);
  assert.match(root, /nearest nested `AGENTS\.md`/i);
  assert.match(root, /must not weaken.*safety.*permission/is);
  assert.match(root, /## Normative sources/);
  assert.match(root, /## Historical and evidentiary sources/);
  assert.match(root, /research.*historical|historical.*research/is);
  assert.match(root, /evidence.*point in time|point in time.*evidence/is);
  assert.match(root, /must not override.*current product|current product.*must not override/is);
  assert.match(root, /external fork.*(?:exempt|optional)/is);
  assert.match(root, /Beads.*worktree.*(?:OpenPGP|GPG)/is);
  assert.match(root, /product.*safety.*isolation.*verification/is);

  for (const [name, guide] of Object.entries({ app, cli, relay, wire, docs, docsSite })) {
    assert.match(guide, /root `AGENTS\.md` applies/i, `${name} must inherit the root contract explicitly`);
    assert.match(guide, /must not weaken|cannot weaken/i, `${name} must not relax the root contract`);
  }
});

test('root guide has a Lyntty-specific product decision filter', async () => {
  const { root } = await readGuides();

  assert.match(root, /## Product decision filter/);
  assert.match(root, /Android.*local `pi`|local `pi`.*Android/is);
  assert.match(root, /phone.*relay.*lynttyd.*Pi extension.*pi/is);
  assert.match(root, /one `active runtime`|single `active runtime`/i);
  assert.match(root, /Pi JSONL.*canonical/i);
  assert.match(root, /legacy.*debug.*main APK|main APK.*legacy.*debug/is);
  assert.match(root, /narrow.*ask|ask.*narrow/is);
});

test('runtime topology distinguishes the node bridge from operator control', async () => {
  const { root, cli } = await readGuides();

  assert.match(root, /only node-side session bridge.*`lynttyd`|`lynttyd`.*only node-side session bridge/is);
  assert.match(root, /`lyntty remote`.*control-plane client.*relay/is);
  assert.match(root, /Pi extension.*only.*local `lynttyd`/is);
  assert.match(cli, /`lynttyd`.*node-side session bridge/is);
  assert.match(cli, /`lyntty remote`.*direct.*Relay.*control-plane/is);
  assert.doesNotMatch(root, /only `lynttyd` connects to the `relay`/i);
  assert.doesNotMatch(cli, /`lynttyd` alone connects to the Relay/i);
});

test('Android package guidance distinguishes development, Preview, and production', async () => {
  const { root } = await readGuides();

  assert.match(root, /Expo Dev.*`dev\.jczhang\.lyntty\.dev`/is);
  assert.match(root, /Preview.*`dev\.jczhang\.lyntty\.preview`/is);
  assert.match(root, /production.*`dev\.jczhang\.lyntty`/is);
  assert.doesNotMatch(root, /Non-production release-style APKs use package `dev\.jczhang\.lyntty\.dev`/);
});

test('verification guidance distinguishes development checks from claim gates', async () => {
  const { root, app, cli, relay, wire, docs } = await readGuides();
  const rootPackage = JSON.parse(await readFile(rootPackagePath, 'utf8'));
  const cliPackage = JSON.parse(await readFile(cliPackagePath, 'utf8'));
  const relayPackage = JSON.parse(await readFile(relayPackagePath, 'utf8'));
  const docsPackage = JSON.parse(await readFile(docsPackagePath, 'utf8'));
  const fastGate = rootPackage.scripts['ci:fast'];

  assert.match(root, /`bun run ci:fast`.*default.*fast gate/is);
  assert.match(root, /ci:fast.*isolated compiled Relay health\/shutdown smoke/is);
  for (const included of ['test:repo-hardening', 'ci:audit', 'ci:wire', 'ci:cli', 'ci:relay', 'ci:app', 'ci:dev']) {
    assert.match(fastGate, new RegExp(`bun run ${included}`), `ci:fast must include ${included}`);
  }
  for (const excluded of ['ci:daemon-integration', 'docs:check', 'docs:build', 'e2e:maestro']) {
    assert.doesNotMatch(fastGate, new RegExp(excluded), `ci:fast must exclude ${excluded}`);
  }
  for (const exclusion of ['ci:daemon-integration', 'docs:check', 'APK', 'Maestro']) {
    assert.match(root, new RegExp(`ci:fast[\\s\\S]*does not include[\\s\\S]*${exclusion}`, 'i'));
  }

  assert.match(rootPackage.scripts['ci:cli'], /lyntty-cli build/);
  assert.doesNotMatch(rootPackage.scripts['ci:cli'], /build:compiled/);
  assert.match(rootPackage.scripts['ci:daemon-integration'], /test:integration/);
  assert.match(cliPackage.scripts['test:integration'], /build:compiled/);
  assert.match(rootPackage.scripts['ci:relay'], /test:compiled/);
  assert.match(relayPackage.scripts['test:compiled'], /compiled-smoke/);
  assert.ok(docsPackage.scripts['docs:check']);
  assert.ok(docsPackage.scripts['docs:build']);

  assert.match(app, /claim[\s\S]*bun run ci:app/i);
  assert.match(cli, /package claim gate.*distributable package output[\s\S]*bun run ci:cli/is);
  assert.match(cli, /integration gate.*compiles both[\s\S]*bun run ci:daemon-integration/is);
  assert.match(relay, /claim[\s\S]*bun run ci:relay/i);
  assert.match(wire, /claim[\s\S]*bun run ci:wire/i);
  assert.match(docs, /bun run docs:check/);
  assert.match(docs, /bun run docs:build/);
});

test('GitHub operations are live-read, language-aware, and authority-bound', async () => {
  const { root } = await readGuides();

  assert.match(root, /## GitHub operations/);
  assert.match(root, /re-read.*title.*body.*comments.*state.*labels/is);
  assert.match(root, /reporter.*language|author.*language/is);
  assert.match(root, /local commit.*not.*shipped|not.*shipped.*local commit/is);
  assert.match(root, /issue.*comment.*label.*close.*explicit.*authorization/is);
});

test('documentation guide matches the repository bilingual policy', async () => {
  const { docs } = await readGuides();

  assert.match(docs, /existing.*English.*Chinese.*pair.*same (change|commit)/is);
  assert.match(docs, /new.*user-facing.*product.*decision.*English.*Chinese/is);
  assert.match(docs, /historical.*research.*evidence.*single|single.*historical.*research.*evidence/is);
  assert.match(docs, /normative singleton.*does not require.*backfill/is);
  assert.match(docs, /does not require.*backfill|need not.*backfill/i);
});
