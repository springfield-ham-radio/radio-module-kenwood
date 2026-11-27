#!/bin/sh
# GitHub-sourced @springfield/ham-radio-utils ships source only; build dist when missing.
set -eu

pkg_root="$(cd "$(dirname "$0")/.." && pwd)"
utils_pkg="$pkg_root/node_modules/@springfield/ham-radio-utils"
api_pkg="$pkg_root/node_modules/@springfield/ham-radio-api"
lockfile="$pkg_root/yarn.lock"

if [ -f "$utils_pkg/dist/index.js" ]; then
  exit 0
fi

if [ ! -f "$utils_pkg/src/index.ts" ]; then
  exit 0
fi

sh "$pkg_root/scripts/build-ham-radio-api-dep.sh"

if [ ! -f "$api_pkg/dist/index.js" ]; then
  echo "build-ham-radio-utils-dep: ham-radio-api dist is required" >&2
  exit 1
fi

pinned_commit="${HAM_RADIO_UTILS_GIT_COMMIT:-}"

if [ -z "$pinned_commit" ] && [ -f "$lockfile" ]; then
  pinned_commit=$(
    grep -E 'resolution: "@springfield/ham-radio-utils@https://github\.com/springfield-ham-radio/ham-radio-utils\.git#commit=' "$lockfile" \
      | sed -n 's/.*#commit=\([0-9a-fA-F]*\).*/\1/p' \
      | head -n 1
  )
fi

if [ -z "$pinned_commit" ]; then
  echo "build-ham-radio-utils-dep: could not resolve pinned ham-radio-utils commit from yarn.lock" >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

git init -q "$tmp_dir"
git -C "$tmp_dir" remote add origin https://github.com/springfield-ham-radio/ham-radio-utils.git
git -C "$tmp_dir" fetch --depth 1 origin "$pinned_commit"
git -C "$tmp_dir" checkout -q FETCH_HEAD

(
  cd "$tmp_dir"
  corepack enable 2>/dev/null || true
  HUSKY=0 YARN_ENABLE_SCRIPTS=false yarn install
  mkdir -p "node_modules/@springfield/ham-radio-api"
  cp "$api_pkg/package.json" "node_modules/@springfield/ham-radio-api/"
  cp -R "$api_pkg/dist" "node_modules/@springfield/ham-radio-api/"
  yarn build
)

mkdir -p "$utils_pkg/dist"
cp -R "$tmp_dir/dist/." "$utils_pkg/dist/"