export const STABLE_ANDROID_WAIVER_PHRASE = 'I accept publishing this exact Stable Candidate without physical Android validation';

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface StableAndroidValidation {
  schemaVersion: 1;
  mode: boolean;
  authorizationMode: 'physical-phone' | 'owner-waiver-unverified';
  physicalPhoneAccepted: boolean;
  apkSha256: string;
  ownerWaiverAcknowledgement: string | null;
}

export function createStableAndroidValidation(input: {
  physicalPhoneAccepted: string;
  acceptedApkSha256: string;
  actualApkSha256: string;
  ownerWaiverAcknowledgement: string;
}): StableAndroidValidation {
  if (!SHA256_PATTERN.test(input.actualApkSha256)) throw new Error('Stable Android APK SHA-256 is invalid');
  if (input.physicalPhoneAccepted === 'true') {
    if (input.ownerWaiverAcknowledgement !== '') throw new Error('Physical acceptance and owner waiver are mutually exclusive');
    if (input.acceptedApkSha256 !== input.actualApkSha256) throw new Error('Physical acceptance does not bind the exact Stable APK');
    return {
      schemaVersion: 1,
      mode: true,
      authorizationMode: 'physical-phone',
      physicalPhoneAccepted: true,
      apkSha256: input.actualApkSha256,
      ownerWaiverAcknowledgement: null,
    };
  }
  if (input.physicalPhoneAccepted === 'false') {
    if (input.acceptedApkSha256 !== '') throw new Error('Owner waiver requires an empty physically accepted APK SHA-256');
    if (input.ownerWaiverAcknowledgement !== STABLE_ANDROID_WAIVER_PHRASE) throw new Error('Stable owner waiver acknowledgement is invalid');
    return {
      schemaVersion: 1,
      mode: false,
      authorizationMode: 'owner-waiver-unverified',
      physicalPhoneAccepted: false,
      apkSha256: input.actualApkSha256,
      ownerWaiverAcknowledgement: STABLE_ANDROID_WAIVER_PHRASE,
    };
  }
  throw new Error('Stable physical-phone acceptance value is invalid');
}

function assertStableAndroidValidation(value: unknown): asserts value is StableAndroidValidation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Stable Android validation must be an object');
  const validation = value as Partial<StableAndroidValidation>;
  if (validation.schemaVersion !== 1 || !SHA256_PATTERN.test(validation.apkSha256 ?? '')) {
    throw new Error('Stable Android validation identity is invalid');
  }
  if (validation.mode === true) {
    if (validation.authorizationMode !== 'physical-phone'
      || validation.physicalPhoneAccepted !== true
      || validation.ownerWaiverAcknowledgement !== null) {
      throw new Error('Stable physical-phone validation record is inconsistent');
    }
    return;
  }
  if (validation.mode === false) {
    if (validation.authorizationMode !== 'owner-waiver-unverified'
      || validation.physicalPhoneAccepted !== false
      || validation.ownerWaiverAcknowledgement !== STABLE_ANDROID_WAIVER_PHRASE) {
      throw new Error('Stable owner-waiver validation record is inconsistent');
    }
    return;
  }
  throw new Error('Stable Android validation mode is invalid');
}

export function renderStableAndroidValidationWarning(value: unknown): string {
  assertStableAndroidValidation(value);
  if (value.mode) return '';
  return [
    '> [!WARNING]',
    '> Exact Stable Candidate APK was not physically validated. Published under an explicit owner self-use waiver; APK identity and integrity were verified, but physical-device install, launch, and Relay behavior were not accepted.',
    '>',
    '> 此精确 Stable Candidate APK 未完成实体机验收。本版本依据明确的 owner 自用 waiver 发布；APK 身份和完整性已验证，但未确认实体设备安装、启动与 Relay 行为。',
    '',
    '',
  ].join('\n');
}

function option(args: string[], name: string): string {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`${name} is required`);
  return args[index + 1]!;
}

async function main(args: string[]): Promise<void> {
  if (args[0] === 'audit') {
    const value = createStableAndroidValidation({
      physicalPhoneAccepted: process.env.PHYSICAL_PHONE_ACCEPTED ?? '',
      acceptedApkSha256: process.env.ACCEPTED_ANDROID_APK_SHA256 ?? '',
      actualApkSha256: process.env.ANDROID_APK_SHA256 ?? '',
      ownerWaiverAcknowledgement: process.env.STABLE_UNVERIFIED_RELEASE_WAIVER ?? '',
    });
    await Bun.write(option(args, '--output'), `${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  if (args[0] === 'warning') {
    const value = await Bun.file(option(args, '--validation')).json();
    process.stdout.write(renderStableAndroidValidationWarning(value));
    return;
  }
  throw new Error('Usage: stable-release-validation.ts <audit|warning> [options]');
}

if (import.meta.main) await main(process.argv.slice(2));
