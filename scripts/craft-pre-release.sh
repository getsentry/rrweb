#!/bin/bash
set -eux

# Move to the project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd $SCRIPT_DIR/..
OLD_VERSION=${CRAFT_OLD_VERSION}
NEW_VERSION=${CRAFT_NEW_VERSION}

# The release runner doesn't ship pnpm, so install the version pinned in package.json.
if ! command -v pnpm >/dev/null; then
  npm install -g "$(node -p "require('./package.json').packageManager")"
fi

pnpm install --frozen-lockfile

# Bump version in all workspace packages (exact versions, no git tags or commits)
node scripts/bump-version.js "${NEW_VERSION}"
# pnpm-lock.yaml stores the version of each workspace dependency, so it must be updated after the bump.
# CI defaults to a frozen lockfile, which would reject this update.
pnpm install --lockfile-only --no-frozen-lockfile
