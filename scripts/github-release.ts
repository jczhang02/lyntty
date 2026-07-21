#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

const DEFAULT_API_URL = 'https://api.github.com';
const API_VERSION = '2022-11-28';
export const EXPECTED_CURRENT_LATEST_NONE = 'none';

export type ReleasePublishPhase = 'start' | 'before-publish' | 'after-audit';

export interface ProtectedVerifierContext {
  phase: ReleasePublishPhase;
  repository: string;
  tag: string;
  target: string;
  requiredActor: string;
}

export type ProtectedVerifier = (context: ProtectedVerifierContext) => void | Promise<void>;
export type DirectTagBinder = (context: ProtectedVerifierContext) => void | Promise<void>;
export type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface GitHubReleaseDependencies {
  fetch?: FetchImplementation;
  verifier?: ProtectedVerifier;
  tagBinder?: DirectTagBinder;
}

export interface GitHubReleasePublishOptions {
  repository: string;
  tag: string;
  title: string;
  target: string;
  bodyPath?: string;
  /** Alias for bodyPath, retained for callers that use "body" for the input path. */
  body?: string;
  assetPaths?: readonly string[];
  /** Alias for assetPaths. */
  assets?: readonly string[];
  prerelease: boolean;
  latest: boolean;
  auditPath?: string;
  /** Alias for auditPath. */
  audit?: string;
  requiredActor: string;
  token?: string;
  apiUrl?: string;
  expectedCurrentLatest?: string;
  /** Alias for expectedCurrentLatest. */
  expectedCurrentLatestTag?: string;
  verifier?: ProtectedVerifier;
  /** Alias for verifier. */
  verifyProtected?: ProtectedVerifier;
  tagBinder?: DirectTagBinder;
  dependencies?: GitHubReleaseDependencies;
  fetch?: FetchImplementation;
  /** Alias for fetch. */
  fetchImpl?: FetchImplementation;
}

export interface ReleaseAuditAsset {
  id: number;
  name: string;
  size: number;
  sha256: string;
}

export interface ReleaseAudit {
  releaseId: number;
  tag: string;
  target: string;
  bodySha256: string;
  assets: ReleaseAuditAsset[];
  publicationOccurred: boolean;
}

export interface GitHubReleasePublishResult extends ReleaseAudit {
  auditPath: string;
}

interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
  state: string;
  digest: string;
  url?: string;
  browser_download_url?: string;
}

interface Release {
  id: number;
  tag_name: string;
  target_commitish: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  immutable: boolean;
  upload_url: string;
  assets: ReleaseAsset[];
}

interface ReleaseMatch {
  id: number;
}

interface LocalAsset {
  path: string;
  name: string;
  size: number;
  sha256: string;
}

interface TagRef {
  ref: string;
  object: {
    sha: string;
    type: string;
  };
}

interface NormalizedOptions {
  repository: string;
  tag: string;
  title: string;
  target: string;
  bodyPath: string;
  body: string;
  assetPaths: readonly string[];
  prerelease: boolean;
  latest: boolean;
  auditPath: string;
  requiredActor: string;
  token: string;
  apiUrl: string;
  expectedCurrentLatest: string | undefined;
  verifier: ProtectedVerifier;
  tagBinder: DirectTagBinder;
  fetch: FetchImplementation;
}

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(`${name} must be a non-empty string`);
  return value;
}

function requireBoolean(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') fail(`${name} must be boolean`);
  return value;
}

function requireReleaseId(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    fail(`${label} must be a positive numeric integer`);
  }
  return value;
}

function requireAssetId(value: unknown, label: string): number {
  return requireReleaseId(value, label);
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function hashFile(path: string): Promise<{ size: number; sha256: string }> {
  const metadata = await stat(path);
  if (!metadata.isFile()) fail(`Asset is not a regular file: ${path}`);
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    size += chunk.length;
  }
  return { size, sha256: hash.digest('hex') };
}

async function readLocalAssets(paths: readonly string[]): Promise<LocalAsset[]> {
  if (paths.length === 0) fail('At least one asset path is required');
  const seen = new Set<string>();
  const assets: LocalAsset[] = [];
  for (const inputPath of paths) {
    const path = resolve(inputPath);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) fail(`Asset may not be a symlink: ${inputPath}`);
    if (!metadata.isFile()) fail(`Asset is not a regular file: ${inputPath}`);
    const name = basename(path);
    if (!name || name === '.' || name === '..') fail(`Asset has an invalid basename: ${inputPath}`);
    if (seen.has(name)) fail(`Asset basenames must be unique: ${name}`);
    seen.add(name);
    const digest = await hashFile(path);
    assets.push({ path, name, size: digest.size, sha256: digest.sha256 });
  }
  return assets;
}

function normalizeOptions(options: GitHubReleasePublishOptions): NormalizedOptions {
  const bodyPath = options.bodyPath ?? options.body;
  const auditPath = options.auditPath ?? options.audit;
  const assetPaths = options.assetPaths ?? options.assets;
  const expectedCurrentLatest = options.expectedCurrentLatest ?? options.expectedCurrentLatestTag;
  const verifier = options.verifier ?? options.verifyProtected ?? options.dependencies?.verifier;
  const tagBinder = options.tagBinder ?? options.dependencies?.tagBinder;
  const fetchImplementation = options.fetch ?? options.fetchImpl ?? options.dependencies?.fetch ?? globalThis.fetch;

  requireString(options.repository, 'repository');
  const repositoryParts = options.repository.split('/');
  if (
    repositoryParts.length !== 2 ||
    repositoryParts.some(part => part.length === 0 || part === '.' || part === '..' || /\s/.test(part))
  ) {
    fail('repository must be owner/repo');
  }
  requireString(options.tag, 'tag');
  if (!/^[a-z0-9][A-Za-z0-9._-]{2,127}$/.test(options.tag)) fail('tag has an unsupported format');
  requireString(options.title, 'title');
  requireString(options.target, 'target');
  if (!/^[0-9a-fA-F]{40}$/.test(options.target)) fail('target must be exactly 40 hexadecimal characters');
  requireString(bodyPath, 'bodyPath');
  if (!assetPaths) fail('assetPaths is required');
  if (!Array.isArray(assetPaths)) fail('assetPaths must be an array');
  requireBoolean(options.prerelease, 'prerelease');
  requireBoolean(options.latest, 'latest');
  requireString(auditPath, 'auditPath');
  requireString(options.requiredActor, 'requiredActor');
  const token = options.token ?? process.env.GH_TOKEN;
  requireString(token, 'GH_TOKEN');
  const apiUrl = options.apiUrl ?? process.env.GITHUB_API_URL ?? DEFAULT_API_URL;
  requireString(apiUrl, 'apiUrl');
  if (expectedCurrentLatest !== undefined) {
    requireString(expectedCurrentLatest, 'expectedCurrentLatest');
    if (expectedCurrentLatest === EXPECTED_CURRENT_LATEST_NONE) {
      // "none" is intentionally reserved as the explicit no-current-release sentinel.
    }
  }
  if (typeof verifier !== 'function') fail('A protected verifier dependency is required');
  if (typeof tagBinder !== 'function') fail('A direct tag binder dependency is required');
  if (typeof fetchImplementation !== 'function') fail('A fetch dependency is required');

  return {
    repository: options.repository,
    tag: options.tag,
    title: options.title,
    target: options.target,
    bodyPath: bodyPath!,
    body: '',
    assetPaths,
    prerelease: options.prerelease,
    latest: options.latest,
    auditPath: auditPath!,
    requiredActor: options.requiredActor,
    token: token!,
    apiUrl,
    expectedCurrentLatest,
    verifier,
    tagBinder,
    fetch: fetchImplementation,
  };
}

function repositoryPath(repository: string): string {
  const [owner, name] = repository.split('/');
  return `/repos/${encodeURIComponent(owner!)}/${encodeURIComponent(name!)}`;
}

function tagRefPath(repository: string, tag: string): string {
  return `${repositoryPath(repository)}/git/ref/tags/${encodeURIComponent(tag)}`;
}

class GitHubApi {
  private readonly baseUrl: URL;
  private readonly requestFetch: FetchImplementation;
  private readonly headers: HeadersInit;

  constructor(apiUrl: string, token: string, requestFetch: FetchImplementation) {
    try {
      this.baseUrl = new URL(apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`);
    } catch {
      fail('apiUrl must be a valid URL');
    }
    if (this.baseUrl.protocol !== 'http:' && this.baseUrl.protocol !== 'https:') fail('apiUrl must use HTTP or HTTPS');
    this.requestFetch = requestFetch;
    this.headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': 'lyntty-github-release-publisher',
    };
  }

  private url(path: string): URL {
    if (/^https?:\/\//i.test(path)) return new URL(path);
    return new URL(path.replace(/^\/+/, ''), this.baseUrl);
  }

  async request(
    method: string,
    path: string,
    options: {
      body?: BodyInit;
      headers?: HeadersInit;
      allow404?: boolean;
    } = {},
  ): Promise<Response | undefined> {
    const response = await this.requestFetch(this.url(path), {
      method,
      headers: { ...this.headers, ...(options.headers ?? {}) },
      body: options.body,
    });
    if (options.allow404 && response.status === 404) return undefined;
    if (!response.ok) fail(`GitHub API ${method} ${path} failed with HTTP ${response.status}`);
    return response;
  }

  async json<T>(method: string, path: string, options: { body?: BodyInit; headers?: HeadersInit } = {}): Promise<T> {
    const response = await this.request(method, path, options);
    if (!response) fail(`GitHub API ${method} ${path} returned an unexpected 404`);
    try {
      return (await response.json()) as T;
    } catch {
      fail(`GitHub API ${method} ${path} returned invalid JSON`);
    }
  }

  async maybeJson<T>(method: string, path: string): Promise<T | undefined> {
    const response = await this.request(method, path, { allow404: true });
    if (!response) return undefined;
    try {
      return (await response.json()) as T;
    } catch {
      fail(`GitHub API ${method} ${path} returned invalid JSON`);
    }
  }

  uploadUrl(value: string, name: string): URL {
    const withoutTemplate = value.replace(/\{[^}]*\}/g, '');
    let url: URL;
    try {
      url = this.url(withoutTemplate);
    } catch {
      fail('Release upload_url must be a valid URL');
    }
    url.searchParams.set('name', name);
    return url;
  }

  async upload(url: URL, asset: LocalAsset): Promise<ReleaseAsset> {
    const response = await this.requestFetch(url, {
      method: 'POST',
      headers: {
        ...this.headers,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(asset.size),
      },
      body: Bun.file(asset.path),
    });
    if (!response.ok) fail(`GitHub API POST release asset ${asset.name} failed with HTTP ${response.status}`);
    try {
      return (await response.json()) as ReleaseAsset;
    } catch {
      fail(`GitHub API POST release asset ${asset.name} returned invalid JSON`);
    }
  }
}

function parseRelease(value: unknown, label: string): Release {
  if (!isRecord(value)) fail(`${label} is not an object`);
  const id = requireReleaseId(value.id, `${label}.id`);
  const tagName = requireString(value.tag_name, `${label}.tag_name`);
  const target = requireString(value.target_commitish, `${label}.target_commitish`);
  const name = requireString(value.name, `${label}.name`);
  if (typeof value.body !== 'string') fail(`${label}.body must be a string`);
  const draft = requireBoolean(value.draft, `${label}.draft`);
  const prerelease = requireBoolean(value.prerelease, `${label}.prerelease`);
  const immutable = requireBoolean(value.immutable, `${label}.immutable`);
  const uploadUrl = requireString(value.upload_url, `${label}.upload_url`);
  if (!Array.isArray(value.assets)) fail(`${label}.assets must be an array`);
  const assets = value.assets.map((asset, index) => parseAsset(asset, `${label}.assets[${index}]`));
  return {
    id,
    tag_name: tagName,
    target_commitish: target,
    name,
    body: value.body,
    draft,
    prerelease,
    immutable,
    upload_url: uploadUrl,
    assets,
  };
}

function parseAsset(value: unknown, label: string): ReleaseAsset {
  if (!isRecord(value)) fail(`${label} is not an object`);
  const id = requireAssetId(value.id, `${label}.id`);
  const name = requireString(value.name, `${label}.name`);
  if (typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size < 0) {
    fail(`${label}.size must be a non-negative numeric integer`);
  }
  const state = requireString(value.state, `${label}.state`);
  const digest = requireString(value.digest, `${label}.digest`);
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) fail(`${label}.digest must be sha256:<64 lowercase hex>`);
  const url = value.url === undefined ? undefined : requireString(value.url, `${label}.url`);
  const browserDownloadUrl = value.browser_download_url === undefined
    ? undefined
    : requireString(value.browser_download_url, `${label}.browser_download_url`);
  return {
    id,
    name,
    size: value.size,
    state,
    digest,
    url,
    browser_download_url: browserDownloadUrl,
  };
}

function assertReleaseMetadata(release: Release, options: NormalizedOptions, expectedDraft: boolean): void {
  if (release.tag_name !== options.tag) fail(`Release ${release.id} tag does not match requested tag`);
  if (release.target_commitish !== options.target) fail(`Release ${release.id} target does not match requested target`);
  if (release.name !== options.title) fail(`Release ${release.id} title does not match requested title`);
  if (release.body !== options.body) fail(`Release ${release.id} body does not match requested body`);
  if (release.prerelease !== options.prerelease) fail(`Release ${release.id} prerelease flag does not match requested value`);
  if (release.draft !== expectedDraft) fail(`Release ${release.id} draft state does not match requested state`);
  if (expectedDraft && release.immutable !== false) fail(`Draft release ${release.id} must have immutable=false`);
  if (!expectedDraft && release.immutable !== true) fail(`Published release ${release.id} must have immutable=true`);
}

function assertDraftMetadata(release: Release, options: NormalizedOptions): void {
  assertReleaseMetadata(release, options, true);
}

function assertPublishedMetadata(release: Release, options: NormalizedOptions): void {
  assertReleaseMetadata(release, options, false);
}

function assertAssetNames(release: Release, localAssets: readonly LocalAsset[]): Map<string, ReleaseAsset> {
  const expected = new Map(localAssets.map(asset => [asset.name, asset]));
  const remote = new Map<string, ReleaseAsset>();
  for (const asset of release.assets) {
    if (remote.has(asset.name)) fail(`Release contains duplicate asset name: ${asset.name}`);
    if (!expected.has(asset.name)) fail(`Release contains unexpected asset: ${asset.name}`);
    remote.set(asset.name, asset);
  }
  return remote;
}

function assertUniqueAssetIds(assets: Iterable<ReleaseAsset>): void {
  const ids = new Set<number>();
  for (const asset of assets) {
    if (ids.has(asset.id)) fail(`Release assets contain duplicate numeric ID: ${asset.id}`);
    ids.add(asset.id);
  }
}

function assertExpectedAssetMetadata(asset: ReleaseAsset, local: LocalAsset): void {
  if (asset.name !== local.name) fail(`Release asset name does not match expected name: ${local.name}`);
  if (asset.state !== 'uploaded') fail(`Release asset ${local.name} is not uploaded`);
  if (asset.size !== local.size) fail(`Release asset ${local.name} size does not match local file`);
  if (asset.digest !== `sha256:${local.sha256}`) fail(`Release asset ${local.name} digest does not match local file`);
}

async function hashResponse(response: Response, label: string): Promise<{ size: number; sha256: string }> {
  const hash = createHash('sha256');
  let size = 0;
  if (!response.body) return { size, sha256: hash.digest('hex') };
  const reader = response.body.getReader();
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      hash.update(item.value);
      size += item.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  if (size < 0) fail(`Downloaded asset ${label} has an invalid size`);
  return { size, sha256: hash.digest('hex') };
}

async function verifyDownloadedAsset(
  api: GitHubApi,
  repository: string,
  asset: ReleaseAsset,
  local: LocalAsset,
): Promise<void> {
  // Use the canonical authenticated asset endpoint rather than trusting a response-provided
  // download host with the bearer token.
  const endpoint = `${repositoryPath(repository)}/releases/assets/${asset.id}`;
  const response = await api.request('GET', endpoint, {
    headers: { Accept: 'application/octet-stream' },
  });
  if (!response) fail(`Download for release asset ${asset.name} returned an unexpected 404`);
  const downloaded = await hashResponse(response, asset.name);
  if (downloaded.size !== local.size || downloaded.sha256 !== local.sha256) {
    fail(`Downloaded release asset ${asset.name} does not match the local file`);
  }
}

interface BoundAssets {
  byName: Map<string, number>;
  audit: ReleaseAuditAsset[];
}

async function verifyAssets(
  api: GitHubApi,
  repository: string,
  release: Release,
  localAssets: readonly LocalAsset[],
  bound: BoundAssets | undefined,
): Promise<BoundAssets> {
  const remote = assertAssetNames(release, localAssets);
  assertUniqueAssetIds(remote.values());
  if (remote.size !== localAssets.length) fail('Release asset name set does not exactly match local assets');
  const byName = new Map<string, number>();
  const audit: ReleaseAuditAsset[] = [];
  for (const local of localAssets) {
    const asset = remote.get(local.name);
    if (!asset) continue;
    assertExpectedAssetMetadata(asset, local);
    if (bound && bound.byName.get(local.name) !== asset.id) {
      fail(`Release asset ID changed for ${local.name}`);
    }
    await verifyDownloadedAsset(api, repository, asset, local);
    byName.set(local.name, asset.id);
    audit.push({ id: asset.id, name: asset.name, size: local.size, sha256: local.sha256 });
  }
  if (bound) {
    if (bound.byName.size !== byName.size) fail('Release asset set changed after IDs were bound');
    for (const [name, id] of bound.byName) {
      if (byName.get(name) !== id) fail(`Release asset ID changed for ${name}`);
    }
  }
  return { byName, audit };
}

async function assertLocalAssetsUnchanged(localAssets: readonly LocalAsset[]): Promise<void> {
  for (const local of localAssets) {
    const current = await hashFile(local.path);
    if (current.size !== local.size || current.sha256 !== local.sha256) {
      fail(`Local asset changed during publication: ${local.name}`);
    }
  }
}

async function getRelease(api: GitHubApi, repository: string, id: number, label = 'release'): Promise<Release> {
  const value = await api.json<unknown>('GET', `${repositoryPath(repository)}/releases/${id}`);
  const release = parseRelease(value, label);
  if (release.id !== id) fail(`${label} ID does not match requested Release ID`);
  return release;
}

async function listReleaseForTag(api: GitHubApi, repository: string, tag: string): Promise<ReleaseMatch | undefined> {
  const matches: Record<string, unknown>[] = [];
  for (let page = 1; ; page += 1) {
    const value = await api.json<unknown>(
      'GET',
      `${repositoryPath(repository)}/releases?per_page=100&page=${page}`,
    );
    if (!Array.isArray(value)) fail('GitHub releases list response must be an array');
    for (const item of value) {
      if (isRecord(item) && item.tag_name === tag) matches.push(item);
    }
    if (value.length < 100) break;
  }
  if (matches.length > 1) fail(`More than one release has exact tag ${tag}`);
  if (matches.length === 0) return undefined;
  return { id: requireReleaseId(matches[0]!.id, 'release list entry.id') };
}

async function getTagRef(api: GitHubApi, repository: string, tag: string): Promise<TagRef | undefined> {
  const value = await api.maybeJson<unknown>('GET', tagRefPath(repository, tag));
  if (value === undefined) return undefined;
  if (!isRecord(value) || value.ref !== `refs/tags/${tag}` || !isRecord(value.object)) {
    fail('GitHub tag ref response is malformed');
  }
  const sha = requireString(value.object.sha, 'tag ref object sha');
  const type = requireString(value.object.type, 'tag ref object type');
  return { ref: value.ref as string, object: { sha, type } };
}

async function assertTagAbsent(api: GitHubApi, repository: string, tag: string): Promise<void> {
  const ref = await getTagRef(api, repository, tag);
  if (ref) fail(`Tag ${tag} already exists; refusing release publication`);
}

async function assertTagAbsentOrDirect(
  api: GitHubApi,
  repository: string,
  tag: string,
  target: string,
): Promise<'absent' | 'direct'> {
  const ref = await getTagRef(api, repository, tag);
  if (!ref) return 'absent';
  if (ref.object.type !== 'commit' || ref.object.sha !== target) {
    fail(`Tag ${tag} exists but does not point directly to target commit`);
  }
  return 'direct';
}

async function assertRemoteMain(api: GitHubApi, repository: string, target: string): Promise<void> {
  const value = await api.json<unknown>('GET', `${repositoryPath(repository)}/git/ref/heads/main`);
  if (!isRecord(value) || value.ref !== 'refs/heads/main' || !isRecord(value.object)) {
    fail('GitHub main ref response is malformed');
  }
  if (value.object.type !== 'commit' || value.object.sha !== target) {
    fail('GitHub main ref no longer points directly to target commit');
  }
}

async function assertDirectTag(api: GitHubApi, repository: string, tag: string, target: string): Promise<void> {
  const ref = await getTagRef(api, repository, tag);
  if (!ref) fail(`Tag ${tag} is missing after publication`);
  if (ref.object.type !== 'commit' || ref.object.sha !== target) {
    fail(`Tag ${tag} does not point directly to target commit`);
  }
}

function parseLatest(value: unknown): { id: number; tag: string } {
  if (!isRecord(value)) fail('GitHub latest release response must be an object');
  return {
    id: requireReleaseId(value.id, 'latest release id'),
    tag: requireString(value.tag_name, 'latest release tag'),
  };
}

async function assertExpectedCurrentLatest(
  api: GitHubApi,
  repository: string,
  expected: string,
): Promise<void> {
  const value = await api.maybeJson<unknown>('GET', `${repositoryPath(repository)}/releases/latest`);
  if (value === undefined) {
    if (expected === EXPECTED_CURRENT_LATEST_NONE) return;
    fail(`Current latest release is missing; expected tag ${expected}`);
  }
  if (!isRecord(value)) fail('GitHub latest release response must be an object');
  const actualTag = requireString(value.tag_name, 'current latest release tag');
  if (expected === EXPECTED_CURRENT_LATEST_NONE) fail('Current latest release exists but none was expected');
  if (actualTag !== expected) fail(`Current latest release tag changed: expected ${expected}`);
}

async function assertFinalLatest(api: GitHubApi, repository: string, releaseId: number, latestExpected: boolean): Promise<void> {
  const value = await api.maybeJson<unknown>('GET', `${repositoryPath(repository)}/releases/latest`);
  if (value === undefined) {
    if (latestExpected) fail('Published release is not the latest release');
    return;
  }
  const latest = parseLatest(value);
  if (latestExpected && latest.id !== releaseId) fail('Published release is not the latest release');
  if (!latestExpected && latest.id === releaseId) fail('Published release unexpectedly became the latest release');
}

async function audit(
  auditPath: string,
  value: ReleaseAudit,
): Promise<void> {
  const destination = resolve(auditPath);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function patchBody(options: NormalizedOptions): Record<string, unknown> {
  return {
    tag_name: options.tag,
    target_commitish: options.target,
    name: options.title,
    body: options.body,
    draft: false,
    prerelease: options.prerelease,
    make_latest: options.latest ? 'true' : 'false',
  };
}

function verifierContext(options: NormalizedOptions, phase: ReleasePublishPhase): ProtectedVerifierContext {
  return {
    phase,
    repository: options.repository,
    tag: options.tag,
    target: options.target,
    requiredActor: options.requiredActor,
  };
}

async function callVerifier(options: NormalizedOptions, phase: ReleasePublishPhase): Promise<void> {
  await options.verifier(verifierContext(options, phase));
}

async function bindDirectTag(options: NormalizedOptions): Promise<void> {
  await options.tagBinder(verifierContext(options, 'before-publish'));
}

async function publishUnpublished(
  api: GitHubApi,
  options: NormalizedOptions,
  bodySha256: string,
  localAssets: readonly LocalAsset[],
  release: Release | undefined,
): Promise<GitHubReleasePublishResult> {
  let draft: Release;

  if (release) {
    draft = release;
    assertDraftMetadata(draft, options);
  } else {
    if (options.expectedCurrentLatest !== undefined) {
      await assertExpectedCurrentLatest(api, options.repository, options.expectedCurrentLatest);
    }
    await assertTagAbsent(api, options.repository, options.tag);
    const createdValue = await api.json<unknown>('POST', `${repositoryPath(options.repository)}/releases`, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: options.tag,
        target_commitish: options.target,
        name: options.title,
        body: options.body,
        draft: true,
        prerelease: options.prerelease,
      }),
    });
    if (!isRecord(createdValue)) fail('Created draft response is not an object');
    const createdId = requireReleaseId(createdValue.id, 'created draft.id');
    draft = await getRelease(api, options.repository, createdId, 'created draft');
    assertDraftMetadata(draft, options);
  }

  if (options.expectedCurrentLatest !== undefined && release) {
    await assertExpectedCurrentLatest(api, options.repository, options.expectedCurrentLatest);
  }
  if (release) await assertTagAbsentOrDirect(api, options.repository, options.tag, options.target);
  else await assertTagAbsent(api, options.repository, options.tag);

  const existingAssets = assertAssetNames(draft, localAssets);
  assertUniqueAssetIds(existingAssets.values());
  for (const local of localAssets) {
    const existing = existingAssets.get(local.name);
    if (!existing) continue;
    assertExpectedAssetMetadata(existing, local);
    await verifyDownloadedAsset(api, options.repository, existing, local);
  }

  for (const local of localAssets) {
    if (existingAssets.has(local.name)) continue;
    await api.upload(api.uploadUrl(draft.upload_url, local.name), local);
  }

  await assertLocalAssetsUnchanged(localAssets);
  const finalDraft = await getRelease(api, options.repository, draft.id, 'draft before publication');
  assertDraftMetadata(finalDraft, options);
  const bound = await verifyAssets(api, options.repository, finalDraft, localAssets, undefined);
  await assertTagAbsentOrDirect(api, options.repository, options.tag, options.target);

  await callVerifier(options, 'before-publish');
  await assertLocalAssetsUnchanged(localAssets);
  const prePublishDraft = await getRelease(api, options.repository, draft.id, 'pre-publication draft');
  assertDraftMetadata(prePublishDraft, options);
  const rebound = await verifyAssets(api, options.repository, prePublishDraft, localAssets, bound);
  if (rebound.audit.length !== bound.audit.length) fail('Release assets changed before publication');
  if (options.expectedCurrentLatest !== undefined) {
    await assertExpectedCurrentLatest(api, options.repository, options.expectedCurrentLatest);
  }
  await assertRemoteMain(api, options.repository, options.target);
  const tagState = await assertTagAbsentOrDirect(api, options.repository, options.tag, options.target);
  if (tagState === 'absent') await bindDirectTag(options);
  await assertDirectTag(api, options.repository, options.tag, options.target);
  await assertRemoteMain(api, options.repository, options.target);
  if (options.expectedCurrentLatest !== undefined) {
    await assertExpectedCurrentLatest(api, options.repository, options.expectedCurrentLatest);
  }

  const patchedValue = await api.json<unknown>('PATCH', `${repositoryPath(options.repository)}/releases/${draft.id}`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patchBody(options)),
  });
  const patched = parseRelease(patchedValue, 'patched release');
  if (patched.id !== draft.id) fail('PATCH returned a different Release ID');
  assertPublishedMetadata(patched, options);
  await verifyAssets(api, options.repository, patched, localAssets, bound);
  const postPublish = await getRelease(api, options.repository, draft.id, 'published release');
  assertPublishedMetadata(postPublish, options);
  const postAssets = await verifyAssets(api, options.repository, postPublish, localAssets, bound);
  await assertDirectTag(api, options.repository, options.tag, options.target);
  await assertFinalLatest(api, options.repository, draft.id, options.latest);
  await assertLocalAssetsUnchanged(localAssets);

  const auditValue: ReleaseAudit = {
    releaseId: draft.id,
    tag: options.tag,
    target: options.target,
    bodySha256,
    assets: postAssets.audit,
    publicationOccurred: true,
  };
  await audit(options.auditPath, auditValue);
  await callVerifier(options, 'after-audit');
  return { ...auditValue, auditPath: resolve(options.auditPath) };
}

async function retryPublished(
  api: GitHubApi,
  options: NormalizedOptions,
  bodySha256: string,
  localAssets: readonly LocalAsset[],
  published: Release,
): Promise<GitHubReleasePublishResult> {
  assertPublishedMetadata(published, options);
  const bound = await verifyAssets(api, options.repository, published, localAssets, undefined);
  await assertDirectTag(api, options.repository, options.tag, options.target);
  await assertFinalLatest(api, options.repository, published.id, options.latest);
  const auditValue: ReleaseAudit = {
    releaseId: published.id,
    tag: options.tag,
    target: options.target,
    bodySha256,
    assets: bound.audit,
    publicationOccurred: false,
  };
  await audit(options.auditPath, auditValue);
  await callVerifier(options, 'after-audit');
  return { ...auditValue, auditPath: resolve(options.auditPath) };
}

/**
 * Publish one immutable GitHub Release without ever deleting or replacing a tag or asset.
 *
 * If expectedCurrentLatest is supplied, `none` is the explicit sentinel meaning that the
 * repository must currently have no latest release. The assertion is made before a new or
 * draft publication starts and again at the final publication boundary. It is deliberately
 * skipped for an already-published audit-only retry.
 */
export async function publishGitHubRelease(
  input: GitHubReleasePublishOptions,
): Promise<GitHubReleasePublishResult> {
  const options = normalizeOptions(input);
  await callVerifier(options, 'start');

  const bodyBytes = await readFile(resolve(options.bodyPath));
  const body = bodyBytes.toString('utf8');
  options.body = body;
  const localAssets = await readLocalAssets(options.assetPaths);
  const bodySha256 = sha256Bytes(bodyBytes);
  const api = new GitHubApi(options.apiUrl, options.token, options.fetch);
  const releaseMatch = await listReleaseForTag(api, options.repository, options.tag);
  if (!releaseMatch) return publishUnpublished(api, options, bodySha256, localAssets, undefined);
  const release = await getRelease(api, options.repository, releaseMatch.id, 'existing release');
  if (release.draft === false) return retryPublished(api, options, bodySha256, localAssets, release);
  if (release.draft !== true) fail(`Release ${release.id} has an invalid draft state`);
  return publishUnpublished(api, options, bodySha256, localAssets, release);
}

/** Short aliases for callers that use the command name as the function name. */
export const publishRelease = publishGitHubRelease;
export const publishGithubRelease = publishGitHubRelease;
export default publishGitHubRelease;

function usage(): never {
  throw new Error(`Usage:
  bun scripts/github-release.ts publish --repository owner/repo --tag TAG --title TITLE --target 40HEX --body PATH --prerelease true|false --latest true|false --audit PATH --required-actor ACTOR [--expected-current-latest TAG|none] -- ASSET_PATH...`);
}

function parseCliOptions(args: string[]): { options: GitHubReleasePublishOptions; assetPaths: string[] } {
  const separator = args.indexOf('--');
  if (separator < 0) usage();
  const flags = args.slice(0, separator);
  const assetPaths = args.slice(separator + 1);
  if (assetPaths.length === 0) usage();
  const values = new Map<string, string[]>();
  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index];
    const value = flags[index + 1];
    if (!flag?.startsWith('--') || value === undefined || value.startsWith('--')) usage();
    const list = values.get(flag) ?? [];
    list.push(value);
    values.set(flag, list);
  }
  const allowed = new Set([
    '--repository', '--tag', '--title', '--target', '--body', '--prerelease', '--latest', '--audit',
    '--required-actor', '--expected-current-latest',
  ]);
  for (const flag of values.keys()) if (!allowed.has(flag)) throw new Error(`Unknown github-release argument: ${flag}`);
  const one = (flag: string): string => {
    const list = values.get(flag);
    if (!list || list.length !== 1) throw new Error(`${flag} is required exactly once`);
    return list[0]!;
  };
  const optional = (flag: string): string | undefined => {
    const list = values.get(flag);
    if (!list) return undefined;
    if (list.length !== 1) throw new Error(`${flag} may be supplied at most once`);
    return list[0];
  };
  const boolean = (flag: string): boolean => {
    const value = one(flag);
    if (value !== 'true' && value !== 'false') throw new Error(`${flag} must be true or false`);
    return value === 'true';
  };
  const options: GitHubReleasePublishOptions = {
    repository: one('--repository'),
    tag: one('--tag'),
    title: one('--title'),
    target: one('--target'),
    bodyPath: one('--body'),
    assetPaths,
    prerelease: boolean('--prerelease'),
    latest: boolean('--latest'),
    auditPath: one('--audit'),
    requiredActor: one('--required-actor'),
    expectedCurrentLatest: optional('--expected-current-latest'),
  };
  return { options, assetPaths };
}

async function runGit(args: string[]): Promise<string> {
  const child = Bun.spawn(['git', ...args], { stdout: 'pipe', stderr: 'ignore' });
  const output = await new Response(child.stdout).text();
  const exitCode = await child.exited;
  if (exitCode !== 0) fail(`git ${args[0]} failed with exit status ${exitCode}`);
  return output.trim();
}

export async function bindDirectTagWithGit(context: ProtectedVerifierContext): Promise<void> {
  const child = Bun.spawn(
    ['git', 'push', '--porcelain', 'origin', `${context.target}:refs/tags/${context.tag}`],
    {
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    },
  );
  const exitCode = await child.exited;
  if (exitCode !== 0) fail('git push failed to create the exact direct release tag');
}

export async function verifyProtectedMain(context: ProtectedVerifierContext): Promise<void> {
  if (process.env.GITHUB_REF !== 'refs/heads/main') fail('GITHUB_REF must be refs/heads/main');
  if (process.env.GITHUB_REF_PROTECTED !== 'true') fail('GITHUB_REF_PROTECTED must be true');
  if (process.env.GITHUB_SHA !== context.target) fail('GITHUB_SHA does not match target');
  if (process.env.GITHUB_ACTOR !== context.requiredActor) fail('GITHUB_ACTOR does not match required actor');
  const fetchProcess = Bun.spawn(['git', 'fetch', '--no-tags', 'origin', 'main'], { stdout: 'ignore', stderr: 'ignore' });
  const fetchExit = await fetchProcess.exited;
  if (fetchExit !== 0) fail('git fetch --no-tags origin main failed');
  const head = await runGit(['rev-parse', 'HEAD']);
  const originMain = await runGit(['rev-parse', 'origin/main']);
  if (head !== context.target || originMain !== context.target || head !== originMain) {
    fail('HEAD and origin/main must both equal target');
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command !== 'publish') usage();
  const { options } = parseCliOptions(process.argv.slice(3));
  const result = await publishGitHubRelease({
    ...options,
    verifier: verifyProtectedMain,
    tagBinder: bindDirectTagWithGit,
    token: process.env.GH_TOKEN,
    apiUrl: process.env.GITHUB_API_URL ?? DEFAULT_API_URL,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.main) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
