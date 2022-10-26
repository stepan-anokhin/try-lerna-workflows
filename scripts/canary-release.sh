#!/usr/bin/env bash

set -e
set -x

FEATURE_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
COMMIT="$(git rev-parse --short HEAD)"

# Create branch-specific version
npx lerna version --no-changelog --conventional-commits --conventional-prerelease --no-push --preid "$FEATURE_BRANCH-$COMMIT" --yes

# Publish canary release
npx lerna publish from-git --dist-tag "$FEATURE_BRANCH" --yes

