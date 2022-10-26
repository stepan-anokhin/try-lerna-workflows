#!/usr/bin/env bash

set -e
set -x

COMMIT_MESSAGE=$1

# Check for uncommitted changes
git update-index --refresh > /dev/null
if ! git diff-index --quiet HEAD ; then
  echo "Committing changes in working tree"
  git add . && git commit -m "$COMMIT_MESSAGE"
fi
