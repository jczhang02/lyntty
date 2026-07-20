#!/usr/bin/env bash
set -euo pipefail

apk="${1:?usage: apk-audit.sh <apk> <application-id> [version-name] [version-code] [signer-sha256] [native-abis]}"
expected_application_id="${2:?expected application id is required}"
expected_version_name="${3:-}"
expected_version_code="${4:-}"
expected_signer_sha256="${5:-}"
expected_native_abis="${6:-}"
android_home="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$android_home" ]]; then
  echo "ANDROID_HOME or ANDROID_SDK_ROOT is required" >&2
  exit 1
fi
build_tools="$(find "$android_home/build-tools" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -V | tail -n1)"
apksigner="$android_home/build-tools/$build_tools/apksigner"
apkanalyzer="$android_home/cmdline-tools/latest/bin/apkanalyzer"
test -x "$apksigner"
test -x "$apkanalyzer"
test -s "$apk"

signature_report="$("$apksigner" verify --verbose --print-certs "$apk")"
grep -Fq 'Verified using v2 scheme (APK Signature Scheme v2): true' <<<"$signature_report"
application_id="$("$apkanalyzer" manifest application-id "$apk")"
version_name="$("$apkanalyzer" manifest version-name "$apk")"
version_code="$("$apkanalyzer" manifest version-code "$apk")"
debuggable="$("$apkanalyzer" manifest debuggable "$apk")"
signer_sha256="$(awk -F': ' '/Signer #1 certificate SHA-256 digest:/ { print $2; exit }' <<<"$signature_report" \
  | tr -d ':[:space:]' | tr '[:upper:]' '[:lower:]')"
apk_entries="$(unzip -Z1 "$apk")"
test "$(grep -Fxc 'assets/index.android.bundle' <<<"$apk_entries")" -eq 1
native_abis="$(awk -F/ '$1 == "lib" && NF >= 3 { print $2 }' <<<"$apk_entries" | sort -u | paste -sd, -)"

test "$application_id" = "$expected_application_id"
test "$debuggable" = 'false'
test -n "$signer_sha256"
if [[ -n "$expected_version_name" ]]; then test "$version_name" = "$expected_version_name"; fi
if [[ -n "$expected_version_code" ]]; then test "$version_code" = "$expected_version_code"; fi
if [[ -n "$expected_signer_sha256" ]]; then
  normalized_expected="$(printf '%s' "$expected_signer_sha256" | tr -d ':[:space:]' | tr '[:upper:]' '[:lower:]')"
  test "$signer_sha256" = "$normalized_expected"
fi
if [[ -n "$expected_native_abis" ]]; then test "$native_abis" = "$expected_native_abis"; fi

printf 'application_id=%s\nversion_name=%s\nversion_code=%s\ndebuggable=%s\nsigner_sha256=%s\n' \
  "$application_id" "$version_name" "$version_code" "$debuggable" "$signer_sha256"
printf 'signature_scheme_v2=true\nstandalone_bundle=assets/index.android.bundle\nnative_abis=%s\n' "$native_abis"
