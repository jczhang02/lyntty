const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export interface StableAndroidValidation {
  schemaVersion: 2;
  mode: boolean;
  authorizationMode: 'physical-phone' | 'optional-not-performed';
  physicalPhoneAccepted: boolean;
  apkSha256: string;
}

export function createStableAndroidValidation(input: {
  physicalPhoneAccepted: string;
  acceptedApkSha256: string;
  actualApkSha256: string;
}): StableAndroidValidation {
  if (!SHA256_PATTERN.test(input.actualApkSha256)) throw new Error('Stable Android APK SHA-256 is invalid');
  if (input.physicalPhoneAccepted === 'true') {
    if (input.acceptedApkSha256 !== input.actualApkSha256) {
      throw new Error('Physical acceptance does not bind the exact Stable APK');
    }
    return {
      schemaVersion: 2,
      mode: true,
      authorizationMode: 'physical-phone',
      physicalPhoneAccepted: true,
      apkSha256: input.actualApkSha256,
    };
  }
  if (input.physicalPhoneAccepted === 'false') {
    if (input.acceptedApkSha256 !== '') {
      throw new Error('Optional non-physical validation requires an empty accepted APK SHA-256');
    }
    return {
      schemaVersion: 2,
      mode: false,
      authorizationMode: 'optional-not-performed',
      physicalPhoneAccepted: false,
      apkSha256: input.actualApkSha256,
    };
  }
  throw new Error('Stable physical-phone acceptance value is invalid');
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
    });
    await Bun.write(option(args, '--output'), `${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  throw new Error('Usage: stable-release-validation.ts audit --output <path>');
}

if (import.meta.main) await main(process.argv.slice(2));
