#!/bin/sh
set -eu

cd "$(dirname "$0")"

# Node.js 25+ does not ship Corepack. Match CI's verified pin.
npm install --global corepack@0.36.0
corepack enable
corepack install

yarn install
yarn prepare
