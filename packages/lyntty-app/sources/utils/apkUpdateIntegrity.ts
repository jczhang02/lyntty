const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

export function validApkSha256(value: string): boolean {
    return SHA256_PATTERN.test(value);
}

export function apkSha256Matches(expected: string, actual: string): boolean {
    return validApkSha256(expected)
        && validApkSha256(actual)
        && expected.toLowerCase() === actual.toLowerCase();
}
