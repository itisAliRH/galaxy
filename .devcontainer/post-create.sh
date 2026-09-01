#!/usr/bin/env bash
# Install the client dependencies once, when the container is created.
set -euo pipefail

cd "$(dirname "$0")/../client"

# The image ships Node but no pnpm. Corepack would be the obvious way to get
# the pinned version, but its shim directory is not writable by the container
# user in every image, so install the pinned version directly instead.
pnpm_version="$(node -p "require('./package.json').packageManager.split('@')[1]")"

if ! pnpm --version > /dev/null 2>&1; then
    echo "Installing pnpm ${pnpm_version}"
    npm install --global "pnpm@${pnpm_version}" || sudo npm install --global "pnpm@${pnpm_version}"
fi

echo "node $(node --version), pnpm $(pnpm --version)"
pnpm install --frozen-lockfile
