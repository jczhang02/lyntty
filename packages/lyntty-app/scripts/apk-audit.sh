#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'APK audit failed: %s\n' "$*" >&2
  exit 1
}

require_equal() {
  local field="$1"
  local actual="$2"
  local expected="$3"
  [[ "$actual" == "$expected" ]] || fail "$field mismatch: expected <$expected>, got <$actual>"
}

apk="${1:?usage: apk-audit.sh <apk> <application-id> [version-name] [version-code] [signer-sha256] [native-abis]}"
expected_application_id="${2:?expected application id is required}"
expected_version_name="${3:-}"
expected_version_code="${4:-}"
expected_signer_sha256="${5:-}"
expected_native_abis="${6:-}"
android_home="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[[ -n "$android_home" ]] || fail 'ANDROID_HOME or ANDROID_SDK_ROOT is required'
[[ -d "$android_home/build-tools" ]] || fail 'Android SDK build-tools directory is missing'

build_tools="$(find "$android_home/build-tools" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -V | tail -n1)"
[[ -n "$build_tools" ]] || fail 'no Android SDK build-tools installation found'
apksigner="$android_home/build-tools/$build_tools/apksigner"
apkanalyzer="$android_home/cmdline-tools/latest/bin/apkanalyzer"
[[ -x "$apksigner" ]] || fail "apksigner is not executable for build-tools $build_tools"
[[ -x "$apkanalyzer" ]] || fail 'apkanalyzer is not executable under cmdline-tools/latest'
[[ -s "$apk" ]] || fail 'APK is missing or empty'

if ! signature_report="$("$apksigner" verify --verbose --print-certs "$apk")"; then
  fail 'apksigner verification command failed'
fi
grep -Fq 'Verified using v2 scheme (APK Signature Scheme v2): true' <<<"$signature_report" \
  || fail 'APK Signature Scheme v2 verification did not succeed'

reported_signer_counts="$(awk -F': ' '/^Number of signers: [0-9]+$/ { print $2 }' <<<"$signature_report")"
reported_signer_count_lines="$(awk 'NF { count++ } END { print count + 0 }' <<<"$reported_signer_counts")"
[[ "$reported_signer_count_lines" -eq 1 ]] \
  || fail "expected one Number of signers field, got $reported_signer_count_lines"
reported_signer_count="$(awk 'NF { print; exit }' <<<"$reported_signer_counts")"
[[ "$reported_signer_count" -eq 1 ]] \
  || fail "expected exactly one signer, got $reported_signer_count"

# Build-tools 36 reports "Signer #1 certificate ..." while build-tools 37
# reports scheme-specific "V2 Signer: certificate ..." lines. Deduplicate the
# certificate digest across schemes and bind it to the explicit signer count.
signer_sha256s="$(awk -F': ' '/certificate SHA-256 digest:/ { print $NF }' <<<"$signature_report" \
  | sed 's/[[:space:]:]//g' | tr '[:upper:]' '[:lower:]' | sort -u)"
signer_digest_count="$(awk 'NF { count++ } END { print count + 0 }' <<<"$signer_sha256s")"
[[ "$signer_digest_count" -eq 1 ]] \
  || fail "expected one unique signer certificate SHA-256 digest, got $signer_digest_count"
signer_sha256="$(awk 'NF { print; exit }' <<<"$signer_sha256s")"
[[ "$signer_sha256" =~ ^[0-9a-f]{64}$ ]] || fail 'signer certificate SHA-256 digest is malformed'

manifest_value() {
  local field="$1"
  local value
  if ! value="$("$apkanalyzer" manifest "$field" "$apk")"; then
    fail "apkanalyzer could not read manifest $field"
  fi
  printf '%s' "$value"
}

application_id="$(manifest_value application-id)"
version_name="$(manifest_value version-name)"
version_code="$(manifest_value version-code)"
debuggable="$(manifest_value debuggable)"
if ! apk_entries="$(unzip -Z1 "$apk")"; then
  fail 'could not enumerate APK entries'
fi
bundle_count="$(awk '$0 == "assets/index.android.bundle" { count++ } END { print count + 0 }' <<<"$apk_entries")"
[[ "$bundle_count" -eq 1 ]] || fail "expected one standalone Android bundle, got $bundle_count"
native_abis="$(awk -F/ '$1 == "lib" && NF >= 3 { print $2 }' <<<"$apk_entries" | sort -u | paste -sd, -)"

require_equal application_id "$application_id" "$expected_application_id"
require_equal debuggable "$debuggable" false
if [[ -n "$expected_version_name" ]]; then require_equal version_name "$version_name" "$expected_version_name"; fi
if [[ -n "$expected_version_code" ]]; then require_equal version_code "$version_code" "$expected_version_code"; fi
if [[ -n "$expected_signer_sha256" ]]; then
  normalized_expected="$(printf '%s' "$expected_signer_sha256" | tr -d ':[:space:]' | tr '[:upper:]' '[:lower:]')"
  [[ "$normalized_expected" =~ ^[0-9a-f]{64}$ ]] || fail 'expected signer certificate SHA-256 digest is malformed'
  require_equal signer_sha256 "$signer_sha256" "$normalized_expected"
fi
if [[ -n "$expected_native_abis" ]]; then require_equal native_abis "$native_abis" "$expected_native_abis"; fi

printf 'application_id=%s\nversion_name=%s\nversion_code=%s\ndebuggable=%s\nsigner_count=1\nsigner_sha256=%s\n' \
  "$application_id" "$version_name" "$version_code" "$debuggable" "$signer_sha256"
printf 'signature_scheme_v2=true\nstandalone_bundle=assets/index.android.bundle\nnative_abis=%s\n' "$native_abis"
