import { afterEach, describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  EXPECTED_CURRENT_LATEST_NONE,
  publishGitHubRelease,
  type GitHubReleasePublishOptions,
  type ProtectedVerifierContext,
} from './github-release';

const target = 'a'.repeat(40);
const repository = 'owner/repo';
const tag = 'stable-v1';
const title = 'Stable v1';
const bodyText = 'Release body\n';
const roots: string[] = [];
const servers: Array<{ stop: () => void }> = [];

type FakeAsset = {
  id: number;
  name: string;
  size: number;
  state: string;
  digest: string;
  url: string;
  browser_download_url: string;
};

type FakeRelease = {
  id: number;
  tag_name: string;
  target_commitish: string;
  name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  immutable: boolean;
  upload_url: string;
  assets: FakeAsset[];
};

type Latest = { id: number; tag: string } | undefined;

type FakeOptions = {
  release?: Partial<FakeRelease>;
  latest?: Latest;
  tagRef?: { sha: string; type?: string };
  tagStatus?: number;
  mainSha?: string;
  initialAssets?: Array<{ name: string; id: number; bytes: Uint8Array }>;
};

class FakeGitHub {
  readonly requests: Array<{ method: string; path: string }> = [];
  readonly writes: Array<{ method: string; path: string }> = [];
  readonly assets = new Map<number, Uint8Array>();
  latest: Latest;
  tagRef?: { sha: string; type: string };
  tagStatus?: number;
  release?: FakeRelease;
  base = '';
  latestReads = 0;
  tagBinds = 0;
  mainSha: string;
  onUpload?: () => void;
  onPatch?: () => void;
  substituteAssetIdOnNextReleaseGet = false;
  private nextAssetId = 500;
  private server?: ReturnType<typeof Bun.serve>;

  constructor(options: FakeOptions = {}) {
    this.latest = options.latest;
    this.mainSha = options.mainSha ?? target;
    this.tagRef = options.tagRef ? { sha: options.tagRef.sha, type: options.tagRef.type ?? 'commit' } : undefined;
    this.tagStatus = options.tagStatus;
    this.server = Bun.serve({
      port: 0,
      fetch: request => this.handle(request),
    });
    this.base = this.server.url.origin;
    const seededAssets = options.initialAssets ?? [];
    const assets = seededAssets.map(item => {
      const asset = this.makeAsset(item.id, item.name, item.bytes);
      this.assets.set(asset.id, item.bytes);
      return asset;
    });
    if (options.release) {
      this.release = {
        id: 101,
        tag_name: tag,
        target_commitish: target,
        name: title,
        body: bodyText,
        draft: true,
        prerelease: false,
        immutable: false,
        upload_url: `${this.base}/uploads/101/assets{?name,label}`,
        assets,
        ...options.release,
      };
    }
  }

  stop(): void {
    this.server?.stop();
    this.server = undefined;
  }

  private makeAsset(id: number, name: string, bytes: Uint8Array): FakeAsset {
    return {
      id,
      name,
      size: bytes.byteLength,
      state: 'uploaded',
      digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      url: `${this.base}/downloads/${id}`,
      browser_download_url: `${this.base}/downloads/${id}`,
    };
  }

  private json(value: unknown, status = 200): Response {
    return Response.json(value, { status });
  }

  private cloneRelease(): FakeRelease {
    if (!this.release) throw new Error('fake release is absent');
    return structuredClone(this.release);
  }

  private async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    this.requests.push({ method, path });
    if (method === 'POST' || method === 'PATCH' || method === 'DELETE' || method === 'PUT') {
      this.writes.push({ method, path });
    }

    if (path === `/repos/${repository}/releases` && method === 'GET') {
      return this.json(this.release ? [this.cloneRelease()] : []);
    }
    if (path === `/repos/${repository}/releases/latest` && method === 'GET') {
      this.latestReads += 1;
      if (!this.latest) return this.json({ message: 'not found' }, 404);
      return this.json({ id: this.latest.id, tag_name: this.latest.tag });
    }
    if (path === `/repos/${repository}/git/ref/heads/main` && method === 'GET') {
      return this.json({ ref: 'refs/heads/main', object: { type: 'commit', sha: this.mainSha } });
    }
    if (path === `/repos/${repository}/git/ref/tags/${tag}` && method === 'GET') {
      if (this.tagStatus !== undefined) return this.json({ message: 'tag lookup failed' }, this.tagStatus);
      if (!this.tagRef) return this.json({ message: 'not found' }, 404);
      return this.json({ ref: `refs/tags/${tag}`, object: this.tagRef });
    }
    if (path === `/repos/${repository}/releases` && method === 'POST') {
      const input = await request.json() as Record<string, unknown>;
      if (this.release) return this.json({ message: 'already exists' }, 422);
      this.release = {
        id: 101,
        tag_name: String(input.tag_name),
        target_commitish: String(input.target_commitish),
        name: String(input.name),
        body: String(input.body),
        draft: Boolean(input.draft),
        prerelease: Boolean(input.prerelease),
        immutable: false,
        upload_url: `${this.base}/uploads/101/assets{?name,label}`,
        assets: [],
      };
      return this.json(this.cloneRelease(), 201);
    }
    const releaseMatch = path.match(new RegExp(`^/repos/${repository}/releases/(\\d+)$`));
    if (releaseMatch && method === 'GET') {
      if (!this.release || Number(releaseMatch[1]) !== this.release.id) return this.json({ message: 'not found' }, 404);
      if (this.substituteAssetIdOnNextReleaseGet) {
        this.substituteAssetIdOnNextReleaseGet = false;
        this.release.assets = this.release.assets.map(asset => ({
          ...asset,
          id: asset.id + 100,
          url: `${this.base}/downloads/${asset.id + 100}`,
          browser_download_url: `${this.base}/downloads/${asset.id + 100}`,
        }));
      }
      return this.json(this.cloneRelease());
    }
    if (releaseMatch && method === 'PATCH') {
      if (!this.release || Number(releaseMatch[1]) !== this.release.id) return this.json({ message: 'not found' }, 404);
      const input = await request.json() as Record<string, unknown>;
      this.release = {
        ...this.release,
        tag_name: String(input.tag_name),
        target_commitish: String(input.target_commitish),
        name: String(input.name),
        body: String(input.body),
        draft: Boolean(input.draft),
        prerelease: Boolean(input.prerelease),
        immutable: true,
      };
      if (input.make_latest === 'true') this.latest = { id: this.release.id, tag: this.release.tag_name };
      this.tagRef = { sha: this.release.target_commitish, type: 'commit' };
      this.onPatch?.();
      return this.json(this.cloneRelease());
    }
    const uploadMatch = path.match(/^\/uploads\/(\d+)\/assets$/);
    if (uploadMatch && method === 'POST') {
      if (!this.release || Number(uploadMatch[1]) !== this.release.id) return this.json({ message: 'not found' }, 404);
      const name = url.searchParams.get('name');
      if (!name) return this.json({ message: 'name required' }, 400);
      const bytes = new Uint8Array(await request.arrayBuffer());
      const asset = this.makeAsset(this.nextAssetId++, name, bytes);
      this.assets.set(asset.id, bytes);
      this.release.assets.push(asset);
      this.onUpload?.();
      return this.json(asset, 201);
    }
    const downloadMatch = path.match(new RegExp(`^/repos/${repository}/releases/assets/(\\d+)$`));
    if (downloadMatch && method === 'GET') {
      const bytes = this.assets.get(Number(downloadMatch[1]));
      if (!bytes) return new Response('not found', { status: 404 });
      return new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } });
    }
    return this.json({ message: 'not found' }, 404);
  }
}

async function fixture(options: FakeOptions = {}): Promise<{
  fake: FakeGitHub;
  root: string;
  bodyPath: string;
  assetPath: string;
  auditPath: string;
}> {
  const root = await mkdtemp(join(tmpdir(), 'lyntty-github-release-'));
  roots.push(root);
  const bodyPath = join(root, 'body.md');
  const assetPath = join(root, 'lyntty.apk');
  const auditPath = join(root, 'audit.json');
  await writeFile(bodyPath, bodyText);
  await writeFile(assetPath, Buffer.from('apk-bytes'));
  const fake = new FakeGitHub(options);
  servers.push(fake);
  return { fake, root, bodyPath, assetPath, auditPath };
}

function verifierRecorder(phases: string[], fake: FakeGitHub): (context: ProtectedVerifierContext) => void {
  return context => {
    phases.push(context.phase);
    if (context.phase === 'before-publish') {
      expect(fake.writes.some(write => write.method === 'PATCH')).toBe(false);
    }
  };
}

function optionsFor(
  value: Awaited<ReturnType<typeof fixture>>,
  verifier: (context: ProtectedVerifierContext) => void,
  extra: Partial<GitHubReleasePublishOptions> = {},
): GitHubReleasePublishOptions {
  return {
    repository,
    tag,
    title,
    target,
    bodyPath: value.bodyPath,
    assetPaths: [value.assetPath],
    prerelease: false,
    latest: true,
    auditPath: value.auditPath,
    requiredActor: 'jczhang02',
    token: 'test-token',
    apiUrl: value.fake.base,
    verifier,
    tagBinder: () => {
      value.fake.tagBinds += 1;
      if (value.fake.tagRef) throw new Error('fake tag already exists');
      value.fake.tagRef = { sha: target, type: 'commit' };
    },
    ...extra,
  };
}

afterEach(async () => {
  for (const server of servers.splice(0)) server.stop();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe('GitHub Release publication hardening', () => {
  it('creates an exact draft, uploads exact assets, and publishes one complete PATCH', async () => {
    const value = await fixture({ latest: { id: 7, tag: 'stable-v0' } });
    const phases: string[] = [];
    const result = await publishGitHubRelease(optionsFor(value, verifierRecorder(phases, value.fake), {
      expectedCurrentLatest: 'stable-v0',
    }));

    expect(result).toMatchObject({
      releaseId: 101,
      tag,
      target,
      publicationOccurred: true,
    });
    expect(phases).toEqual(['start', 'before-publish', 'after-audit']);
    expect(value.fake.tagBinds).toBe(1);
    expect(value.fake.writes.map(write => write.method)).toEqual(['POST', 'POST', 'PATCH']);
    const patch = value.fake.requests.find(request => request.method === 'PATCH');
    expect(patch?.path).toBe(`/repos/${repository}/releases/101`);
    expect(JSON.parse(await readFile(value.auditPath, 'utf8'))).toMatchObject({
      releaseId: 101,
      tag,
      target,
      publicationOccurred: true,
      bodySha256: createHash('sha256').update(bodyText).digest('hex'),
      assets: [{ id: 500, name: 'lyntty.apk', size: 9, sha256: createHash('sha256').update('apk-bytes').digest('hex') }],
    });
    expect(value.fake.latest).toEqual({ id: 101, tag });
  });

  it('retries an exact immutable release as audit-only with zero API writes', async () => {
    const value = await fixture({
      release: { draft: false, immutable: true },
      initialAssets: [{ name: 'lyntty.apk', id: 700, bytes: Buffer.from('apk-bytes') }],
      latest: { id: 101, tag },
      tagRef: { sha: target },
    });
    const phases: string[] = [];
    const result = await publishGitHubRelease(optionsFor(value, verifierRecorder(phases, value.fake), {
      expectedCurrentLatest: 'not-checked-on-retry',
    }));

    expect(result.publicationOccurred).toBe(false);
    expect(phases).toEqual(['start', 'after-audit']);
    expect(value.fake.writes).toEqual([]);
    expect(value.fake.latestReads).toBe(1);
    expect(JSON.parse(await readFile(value.auditPath, 'utf8')).publicationOccurred).toBe(false);
  });

  it('fails closed on changed body before writing', async () => {
    const value = await fixture({ release: { draft: true, immutable: false } });
    await writeFile(value.bodyPath, 'changed body\n');
    await expect(publishGitHubRelease(optionsFor(value, () => undefined))).rejects.toThrow('body does not match');
    expect(value.fake.writes).toEqual([]);
  });

  it('fails closed on a mismatched existing asset without reuploading', async () => {
    const value = await fixture({
      release: { draft: true, immutable: false },
      initialAssets: [{ name: 'lyntty.apk', id: 700, bytes: Buffer.from('different') }],
    });
    await expect(publishGitHubRelease(optionsFor(value, () => undefined))).rejects.toThrow('digest does not match');
    expect(value.fake.writes).toEqual([]);
  });

  it('rejects an extra remote asset before any upload or patch', async () => {
    const value = await fixture({
      release: { draft: true, immutable: false },
      initialAssets: [
        { name: 'lyntty.apk', id: 700, bytes: Buffer.from('apk-bytes') },
        { name: 'unexpected.txt', id: 701, bytes: Buffer.from('extra') },
      ],
    });
    await expect(publishGitHubRelease(optionsFor(value, () => undefined))).rejects.toThrow('unexpected asset');
    expect(value.fake.writes).toEqual([]);
  });

  it('rejects an existing draft whose tag ref points anywhere else', async () => {
    const value = await fixture({
      release: { draft: true, immutable: false },
      tagRef: { sha: 'b'.repeat(40) },
    });
    await expect(publishGitHubRelease(optionsFor(value, () => undefined))).rejects.toThrow('does not point directly');
    expect(value.fake.writes).toEqual([]);
  });

  it('resumes a draft after an exact direct tag was bound by an interrupted publication', async () => {
    const value = await fixture({
      release: { draft: true, immutable: false },
      tagRef: { sha: target },
      initialAssets: [{ name: 'lyntty.apk', id: 700, bytes: Buffer.from('apk-bytes') }],
      latest: { id: 7, tag: 'stable-v0' },
    });
    const result = await publishGitHubRelease(optionsFor(value, () => undefined, { expectedCurrentLatest: 'stable-v0' }));
    expect(result.publicationOccurred).toBe(true);
    expect(value.fake.tagBinds).toBe(0);
    expect(value.fake.writes.map(write => write.method)).toEqual(['PATCH']);
  });

  it('includes the tag lookup HTTP status and never creates after a lookup failure', async () => {
    const value = await fixture({ tagStatus: 500 });
    await expect(publishGitHubRelease(optionsFor(value, () => undefined))).rejects.toThrow('HTTP 500');
    expect(value.fake.writes).toEqual([]);
  });

  it('rejects asset ID substitution between the bound and post-publication snapshots', async () => {
    const value = await fixture();
    value.fake.onPatch = () => {
      value.fake.substituteAssetIdOnNextReleaseGet = true;
    };
    const phases: string[] = [];
    await expect(publishGitHubRelease(optionsFor(value, verifierRecorder(phases, value.fake)))).rejects.toThrow('asset ID changed');
    expect(value.fake.writes.map(write => write.method)).toEqual(['POST', 'POST', 'PATCH']);
    expect(phases).toEqual(['start', 'before-publish']);
  });

  it('does not PATCH when the expected current latest changes while assets are uploading', async () => {
    const value = await fixture({ latest: { id: 7, tag: 'stable-v0' } });
    value.fake.onUpload = () => {
      value.fake.latest = { id: 8, tag: 'stable-v0-next' };
    };
    await expect(publishGitHubRelease(optionsFor(value, () => undefined, {
      expectedCurrentLatest: 'stable-v0',
    }))).rejects.toThrow('Current latest release tag changed');
    expect(value.fake.writes.map(write => write.method)).toEqual(['POST', 'POST']);
  });

  it('does not bind a tag or PATCH when GitHub main moved before publication', async () => {
    const value = await fixture({ mainSha: 'b'.repeat(40), latest: { id: 7, tag: 'stable-v0' } });
    await expect(publishGitHubRelease(optionsFor(value, () => undefined, {
      expectedCurrentLatest: 'stable-v0',
    }))).rejects.toThrow('main ref no longer points');
    expect(value.fake.tagBinds).toBe(0);
    expect(value.fake.writes.some(write => write.method === 'PATCH')).toBe(false);
  });

  it('uses none as the explicit no-current-latest sentinel', async () => {    const value = await fixture();
    value.fake.latest = undefined;
    const result = await publishGitHubRelease(optionsFor(value, () => undefined, {
      expectedCurrentLatest: EXPECTED_CURRENT_LATEST_NONE,
    }));
    expect(result.publicationOccurred).toBe(true);
  });
});
