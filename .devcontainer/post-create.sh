#!/usr/bin/env bash
# Install the client dependencies once, when the container is created.
set -euo pipefail

corepack enable
cd "$(dirname "$0")/../client"
pnpm install --frozen-lockfile
