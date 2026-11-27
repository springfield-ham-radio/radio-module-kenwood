#!/bin/sh
# GitHub-sourced @springfield/ham-radio-api tarballs ship source only (no dist/).
set -eu

pkg_root="$(cd "$(dirname "$0")/.." && pwd)"
api_pkg="$pkg_root/node_modules/@springfield/ham-radio-api"
lockfile="$pkg_root/yarn.lock"

if [ -f "$api_pkg/dist/index.js" ]; then
  exit 0
fi

if [ ! -f "$api_pkg/src/index.ts" ]; then
  exit 0
fi

pinned_commit="${HAM_RADIO_API_GIT_COMMIT:-}"

if [ -z "$pinned_commit" ] && [ -f "$lockfile" ]; then
  pinned_commit=$(
    grep -E 'resolution: "@springfield/ham-radio-api@https://github\.com/springfield-ham-radio/ham-radio-api\.git#commit=' "$lockfile" \
      | sed -n 's/.*#commit=\([0-9a-fA-F]*\).*/\1/p' \
      | head -n 1
  )
fi

if [ -z "$pinned_commit" ]; then
  echo "build-ham-radio-api-dep: could not resolve pinned ham-radio-api commit from yarn.lock" >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

git init -q "$tmp_dir"
git -C "$tmp_dir" remote add origin https://github.com/springfield-ham-radio/ham-radio-api.git
git -C "$tmp_dir" fetch --depth 1 origin "$pinned_commit"
git -C "$tmp_dir" checkout -q FETCH_HEAD

(
  cd "$tmp_dir"
  corepack enable 2>/dev/null || true
  HUSKY=0 YARN_ENABLE_SCRIPTS=false yarn install
  yarn build
)

mkdir -p "$api_pkg/dist"
cp -R "$tmp_dir/dist/." "$api_pkg/dist/"