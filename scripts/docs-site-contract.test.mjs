import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'bun:test';

import {
  alternateLocaleLink,
  hasLocalizedRoute,
  navigationForLocale,
  sitePages,
  siteSections,
  sourcePageRecords,
  staticParamsForLocale,
} from '../docs/.site/lib/site-pages.ts';
import {
  absolutizeSiteMarkdownLinks,
  resolveContainedPath,
  resolveExistingContainedPath,
  resolveMarkdownSourcePath,
  splitLeadingMarkdownH1,
} from '../docs/.site/lib/site-output.ts';

const repositoryRoot = new URL('../', import.meta.url);

const siteContractPaths = {
  docsPackage: 'docs/.site/package.json',
  globalNotFound: 'docs/.site/app/global-not-found.tsx',
  nextConfig: 'docs/.site/next.config.mjs',
  prepare: 'docs/.site/scripts/prepare-fumadocs-pages.mjs',
  staticOutputValidator: 'docs/.site/scripts/validate-static-output.mjs',
  writer: 'docs/.site/scripts/write-fumadocs-agent-files.mjs',
};

const requiredPairedSources = [
  ['docs/README.md', 'docs/README.zh.md'],
  ['docs/getting-started.md', 'docs/getting-started.zh.md'],
  ['docs/faq.md', 'docs/faq.zh.md'],
  ['docs/troubleshooting.md', 'docs/troubleshooting.zh.md'],
  ['docs/prds/lyntty-product.md', 'docs/prds/lyntty-product.zh.md'],
  ['docs/contexts/product/CONTEXT.md', 'docs/contexts/product/CONTEXT.zh.md'],
  ['docs/architecture/pi-shared-control.md', 'docs/architecture/pi-shared-control.zh.md'],
  ['docs/development.md', 'docs/development.zh.md'],
  ['docs/deploy/relay-vps.md', 'docs/deploy/relay-vps.zh.md'],
  ['docs/release/android-apk.md', 'docs/release/android-apk.zh.md'],
  ['docs/release/cli.md', 'docs/release/cli.zh.md'],
  ['docs/release/compatibility-bom.md', 'docs/release/compatibility-bom.zh.md'],
  ['docs/quality/ci.md', 'docs/quality/ci.zh.md'],
  ['PRIVACY.md', 'PRIVACY.zh.md'],
  ['SECURITY.md', 'SECURITY.zh.md'],
  ['CONTRIBUTING.md', 'CONTRIBUTING.zh.md'],
];

const expectedSectionOrder = [
  'start',
  'product',
  'architecture',
  'operate',
  'release',
  'troubleshoot',
  'develop',
  'project',
  'historical',
  'agents',
];

async function read(path) {
  return readFile(new URL(path, repositoryRoot), 'utf8');
}

test('site manifest publishes current user tasks before historical and agent records', async () => {
  assert.deepEqual(
    siteSections.map((section) => section.id),
    expectedSectionOrder,
  );

  const routes = sitePages.map((page) => page.route);
  assert.equal(new Set(routes).size, routes.length, 'site routes must be unique');
  assert.equal(routes[0], 'index');

  const sources = sourcePageRecords().map((page) => page.source);
  assert.equal(new Set(sources).size, sources.length, 'site sources must be unique');

  for (const [english, chinese] of requiredPairedSources) {
    assert.equal(sources.includes(english), true, `${english} must be published`);
    assert.equal(sources.includes(chinese), true, `${chinese} must be published`);
    await Promise.all([access(new URL(english, repositoryRoot)), access(new URL(chinese, repositoryRoot))]);
  }

  for (const source of sources) {
    assert.doesNotMatch(source, /^docs\/(?:evidence|research)\//);
    assert.doesNotMatch(source, /(?:^|\/)AGENTS\.md$|^CONTEXT-MAP\.md$/);
    assert.doesNotMatch(source, /native-signing|preview-apk-release-notes/);
  }

  for (const page of sitePages) {
    assert.equal(page.locales.en !== undefined, true, `${page.route} needs an English source`);
    assert.equal(page.locales.zh !== undefined, true, `${page.route} needs a Chinese source`);
  }

  for (const route of ['getting-started', 'faq', 'troubleshooting', 'release/android-apk']) {
    assert.equal(hasLocalizedRoute(route, 'en'), true);
    assert.equal(hasLocalizedRoute(route, 'zh'), true);
  }

  const englishNavigation = navigationForLocale('en');
  const chineseNavigation = navigationForLocale('zh');
  assert.equal(englishNavigation.indexOf('getting-started') < englishNavigation.indexOf('roadmap'), true);
  assert.equal(chineseNavigation.indexOf('getting-started') < chineseNavigation.indexOf('roadmap'), true);
  assert.equal(englishNavigation.includes('agents/domain'), true);
  assert.deepEqual(
    englishNavigation.filter((entry) => !entry.startsWith('---')),
    chineseNavigation.filter((entry) => !entry.startsWith('---')),
  );
});

test('locale params publish one page-level counterpart per route', () => {
  const english = staticParamsForLocale('en');
  const chinese = staticParamsForLocale('zh');

  assert.equal(english.length, 21);
  assert.equal(chinese.length, 21);
  assert.deepEqual(english, chinese);
});

test('site output rejects lexical, encoded, and symlink traversal', async () => {
  assert.equal(
    resolveContainedPath('/tmp/site-root', 'nested/page.mdx', 'page'),
    '/tmp/site-root/nested/page.mdx',
  );
  assert.throws(
    () => resolveContainedPath('/tmp/site-root', '../escape.mdx', 'page'),
    /escapes.*site-root/i,
  );
  assert.throws(
    () => resolveContainedPath('/tmp/site-root', '/tmp/other/page.mdx', 'page'),
    /escapes.*site-root/i,
  );

  assert.equal(
    resolveMarkdownSourcePath('docs/guides/start.md', '../release/cli.md'),
    'docs/release/cli.md',
  );
  for (const candidate of [
    '../../../outside.md',
    '%2e%2e/%2e%2e/%2e%2e/outside.md',
    '/etc/passwd',
  ]) {
    assert.throws(
      () => resolveMarkdownSourcePath('docs/guides/start.md', candidate),
      /escapes.*repository/i,
    );
  }

  const root = await mkdtemp(join(tmpdir(), 'lyntty-docs-root-'));
  const outside = await mkdtemp(join(tmpdir(), 'lyntty-docs-outside-'));
  try {
    await writeFile(join(root, 'inside.md'), '# inside\n');
    await writeFile(join(outside, 'outside.md'), '# outside\n');
    await symlink(join(outside, 'outside.md'), join(root, 'linked.md'));

    assert.equal(
      resolveExistingContainedPath(root, 'inside.md', 'source'),
      join(root, 'inside.md'),
    );
    assert.throws(
      () => resolveExistingContainedPath(root, 'linked.md', 'source'),
      /escapes.*site-root/i,
    );
  } finally {
    await Promise.all([
      rm(root, { force: true, recursive: true }),
      rm(outside, { force: true, recursive: true }),
    ]);
  }
});

test('published Markdown H1 extraction preserves the exact body boundary', () => {
  assert.deepEqual(
    splitLeadingMarkdownH1('\uFEFF# Document title\r\n\r\n    indented code\r\n', 'fixture'),
    { heading: 'Document title', body: '    indented code\r\n' },
  );
  assert.deepEqual(splitLeadingMarkdownH1('# EOF title', 'fixture'), {
    heading: 'EOF title',
    body: '',
  });
  assert.deepEqual(splitLeadingMarkdownH1('#\tTabbed title\nbody\n', 'fixture'), {
    heading: 'Tabbed title',
    body: 'body\n',
  });
  assert.deepEqual(splitLeadingMarkdownH1('# \u00a0Unicode space\u00a0 \nbody\n', 'fixture'), {
    heading: '\u00a0Unicode space\u00a0',
    body: 'body\n',
  });

  for (const malformed of ['#\nParagraph\n', '#   \n', '## Wrong level\n', ' # Indented\n']) {
    assert.throws(() => splitLeadingMarkdownH1(malformed, 'fixture'), /non-empty H1/);
  }
});

test('raw Markdown links retain the configured Pages base path', () => {
  assert.equal(
    absolutizeSiteMarkdownLinks(
      '[Start](/getting-started) [External](https://example.com/x) [Anchor](#part)',
      'https://jczhang02.github.io/lyntty',
    ),
    '[Start](https://jczhang02.github.io/lyntty/getting-started) [External](https://example.com/x) [Anchor](#part)',
  );
});

test('docs build owns a global 404 and validates the complete static export', async () => {
  const [docsPackage, globalNotFound, nextConfig, prepare, validator, writer] =
    await Promise.all([
      read(siteContractPaths.docsPackage).then(JSON.parse),
      read(siteContractPaths.globalNotFound),
      read(siteContractPaths.nextConfig),
      read(siteContractPaths.prepare),
      read(siteContractPaths.staticOutputValidator),
      read(siteContractPaths.writer),
    ]);

  assert.match(nextConfig, /globalNotFound:\s*true/);
  assert.match(globalNotFound, /<html lang="en"/);
  assert.match(globalNotFound, /Page not found/);
  assert.match(globalNotFound, /页面不存在/);
  assert.match(globalNotFound, /href="\/lyntty\/"/);
  assert.match(globalNotFound, /export const metadata/);

  assert.match(prepare, /resolveExistingContainedPath/);
  assert.match(prepare, /resolveMarkdownSourcePath/);
  assert.match(writer, /removeGeneratedMarkdownOutputs/);
  assert.match(validator, /404\.html/);
  assert.match(validator, /anchor/i);
  assert.match(validator, /\/lyntty/);
  assert.match(validator, /jczhang02\.github\.io/);
  assert.match(docsPackage.scripts['docs:build'], /validate-static-output\.mjs/);
});

test('language switch preserves every paired route', () => {
  assert.deepEqual(alternateLocaleLink('getting-started', 'en'), {
    text: '中文',
    url: '/zh/getting-started',
  });
  assert.deepEqual(alternateLocaleLink('getting-started', 'zh'), {
    text: 'English',
    url: '/getting-started',
  });
  assert.deepEqual(alternateLocaleLink('agents/domain', 'en'), {
    text: '中文',
    url: '/zh/agents/domain',
  });
});

test('getting-started guides cover one safe owner-operated path', async () => {
  const [english, chinese] = await Promise.all([
    read('docs/getting-started.md'),
    read('docs/getting-started.zh.md'),
  ]);

  for (const document of [english, chinese]) {
    assert.match(document, /github\.com\/earendil-works\/pi/);
    assert.match(document, /releases\/latest/);
    assert.match(document, /Compatibility BOM/);
    assert.match(document, /phone -> relay -> lynttyd -> (?:local )?Pi extension -> pi/);
    assert.match(document, /settings\.json/);
    assert.match(document, /LYNTTY_SERVER_URL.*(?:does not|不会).*service/is);
    assert.match(document, /installer.*(?:auth|认证).*daemon.*(?:extension|扩展)/is);
    assert.match(document, /lyntty auth login/);
    assert.match(document, /lyntty daemon install/);
    assert.match(document, /lyntty remote install/);
    assert.match(document, /lyntty daemon status/);
    assert.match(document, /lyntty doctor/);
    assert.match(document, /lyntty update check/);
    assert.match(document, /lyntty update rollback/);
    assert.match(document, /\/reload/);
    assert.match(document, /physical (?:Android|device)|实体.*(?:Android|设备)/i);
    assert.doesNotMatch(document, /curl[^\n|]*\|\s*(?:sh|bash)/i);
    assert.doesNotMatch(document, /public relay|公共 relay.*(?:可用|提供)/i);
  }
});

test('Stable bootstrap pins one complete first-install transaction', async () => {
  const [readme, cli, cliZh] = await Promise.all([
    read('README.md'),
    read('docs/release/cli.md'),
    read('docs/release/cli.zh.md'),
  ]);
  const quickStart = readme.slice(
    readme.indexOf('### Use a Stable release'),
    readme.indexOf('### Run locally'),
  );
  assert.match(quickStart, /hash-pinned installer/i);
  assert.match(quickStart, /lyntty daemon status/);
  assert.match(quickStart, /lyntty doctor/);
  assert.doesNotMatch(
    quickStart,
    /lyntty auth login\s+lyntty daemon install\s+lyntty remote install/,
  );

  const pinnedValues = [
    'compat-v1.2.0_1.2.0_1.2.0_0.2.0-s1',
    'e6db6345bc2c0c22a180ff86d93df67486dbad9e694699ba74a8f4738272e85f',
    'def81e7ccffac1915c5b792674876f0c24fb4b8df648da0f3d39e75e117b0608',
    'df231effa7b3047fb7acdd400cff49434494012b8e17767aee72f1d7049a8bca',
    'd74fb3508fad79c0705349788da12e1ba7e417953cf46d9e8afb4260b00bf43e',
    'f665417d53d259da143a42589a7efc1374e61aeff6c26367a6974719c08d658f',
    '9702e4f9c5220c549763fd796da747d92ad04d36d6af794dd1b75947b7822df9',
    '29d6e6fc56eb0d7017c709bcc2de5fb48aaa97505c8eeec32aec72dca03a0091',
    'd0e5f254356870e45d8ed032e42989532e3308e03395adc5b37bbc309b3ce751',
    'bfdaf396ed1c26ed6275811221a406a00c7fc87e1be72c913afac23968f2658d',
    'a6288f3839cbc59afe8aed63efa5ed1b4b50c28ef29e685b9ca8bcb1f3c13c05',
    '5b48ef1cd3cd830cb99b765bfe47159f185803a9d18eaa793aa6cd12db801731',
    'd29eaa68f21f6c85c0c61b90302191ba1e46f90c6018f7f8f1f8060726b78443',
  ];
  for (const document of [cli, cliZh]) {
    for (const value of pinnedValues) assert.match(document, new RegExp(value));
    assert.match(document, /stable-release-trust-roots\.json/);
    assert.match(document, /--target "\$target"/);
    assert.match(document, /installer.*(?:authentication|认证).*daemon.*(?:extension|扩展)/is);
    assert.doesNotMatch(document, /INSTALLER_SHA256_FROM|ARCHIVE_SHA256_FROM|MANIFEST_SHA256_FROM/);
    assert.doesNotMatch(document, /curl[^\n|]*\|\s*(?:sh|bash)/i);
  }
});

test('FAQ answers product, trust, and support questions without broadening claims', async () => {
  const [english, chinese] = await Promise.all([
    read('docs/faq.md'),
    read('docs/faq.zh.md'),
  ]);

  for (const document of [english, chinese]) {
    assert.match(document, /hosted.*relay|托管.*relay/is);
    assert.match(document, /same.*pi session|同一个.*pi session/is);
    assert.match(document, /Compatibility BOM/);
    assert.match(document, /Pi JSONL.*canonical/is);
    assert.match(document, /Expo Dev.*(?:Metro.*8081|8081.*Metro)/is);
    assert.match(document, /current APK-only Preview|当前 APK-only Preview/is);
    assert.match(document, /Stable.*android-validation\.json/is);
    assert.match(document, /APK-only Preview.*checksum.*audit.*provenance/is);
    assert.match(document, /physical.*(?:acceptance|validation)|实体.*验收/is);
    assert.match(document, /Windows.*service/is);
    assert.match(document, /SECURITY(?:\.zh)?\.md/);
    assert.doesNotMatch(document, /signing material|签名材料/is);
    assert.doesNotMatch(document, /zero-trust design|零信任设计/is);
  }
});

test('README visual is labeled as isolated non-release evidence', async () => {
  const [readme, image] = await Promise.all([
    read('README.md'),
    readFile(new URL('../docs/assets/readme/preview-onboarding-emulator.png', import.meta.url)),
  ]);

  assert.match(readme, /docs\/assets\/readme\/preview-onboarding-emulator\.png/);
  assert.match(readme, /isolated Android emulator/i);
  assert.match(readme, /local Preview-style build/i);
  assert.match(readme, /not (?:a )?Stable artifact/i);
  assert.match(readme, /not physical-device acceptance evidence/i);
  assert.equal(image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), true);
  assert.equal(image.readUInt32BE(16), 1080);
  assert.equal(image.readUInt32BE(20), 2400);
});

test('troubleshooting guides use symptoms and preserve remediation boundaries', async () => {
  const [english, chinese] = await Promise.all([
    read('docs/troubleshooting.md'),
    read('docs/troubleshooting.zh.md'),
  ]);

  for (const document of [english, chinese]) {
    assert.match(document, /Waiting for Pi extension/);
    assert.match(document, /history_gap/);
    assert.match(document, /lyntty auth login --force/);
    assert.match(document, /lyntty daemon status/);
    assert.match(document, /lyntty doctor/);
    assert.match(document, /unknown sources|未知来源/i);
    assert.match(document, /Metro.*8081|8081.*Metro/is);
    assert.match(document, /version mismatch|版本不匹配/i);
    assert.match(document, /pairing URL|配对 URL/i);
    assert.match(document, /auth header|认证请求头/i);
    assert.match(document, /SECURITY\.md/);
    assert.doesNotMatch(document, /Preview.*(?:trust root|relay image)|Preview.*(?:信任根|Relay 镜像)/is);
    assert.doesNotMatch(document, /start a duplicate runtime|启动重复 runtime/i);
  }
});

test('published release and architecture summaries preserve platform and ownership facts', async () => {
  const [cli, cliZh, architectureZh] = await Promise.all([
    read('docs/release/cli.md'),
    read('docs/release/cli.zh.md'),
    read('docs/architecture/pi-shared-control.zh.md'),
  ]);

  assert.match(cli, /shasum -a 256/);
  assert.match(cli, /sha256sum/);
  assert.match(cliZh, /shasum -a 256/);
  assert.match(architectureZh, /relay.*(?:persist|持久化).*command intent/is);
  assert.match(architectureZh, /lynttyd.*(?:local delivery|本地发送|本地交付)/is);
  assert.doesNotMatch(
    architectureZh,
    /`lynttyd`[^.\n]*(?:负责|owns)[^.\n]*durable command intent/i,
  );
});
