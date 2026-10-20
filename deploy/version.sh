#!/usr/bin/env bash
# DiceCloud's version, read from the commits (SemVer). The commit that added
# this script is 3.0.0; after it, in order, each commit whose subject starts
# with "Feat:" bumps the minor version, each "Fix:" the patch, and a "!"
# before the colon ("Feat!:", "Fix!:"...) the major. A scope is allowed
# ("fix(actions):"), the case is not checked. The other commits ("Chore:",
# "Refactor:", "Test:"...) and the merge commits change nothing.
#
#   deploy/version.sh             the version of HEAD
#   deploy/version.sh <commit>    the version of that commit
#   deploy/version.sh --subjects  the version after the commit subjects read
#                                 on stdin, oldest first (for the tests)
#
# dicecloud.sh start gives it to the app (APP_VERSION); in development the
# server runs this script (app/imports/api/version/server/appVersion.ts).
set -euo pipefail

BASE_VERSION=(3 0 0)

# The version after the subjects read on stdin
from_subjects() {
  local major=${BASE_VERSION[0]} minor=${BASE_VERSION[1]} patch=${BASE_VERSION[2]}
  local subject type
  local re='^([A-Za-z]+)(\([^)]*\))?(!)?:'
  while IFS= read -r subject || [ -n "$subject" ]; do
    [[ $subject =~ $re ]] || continue
    type="${BASH_REMATCH[1],,}"
    if [ -n "${BASH_REMATCH[3]}" ]; then
      major=$((major + 1)); minor=0; patch=0
    elif [ "$type" = feat ]; then
      minor=$((minor + 1)); patch=0
    elif [ "$type" = fix ]; then
      patch=$((patch + 1))
    fi
  done
  echo "$major.$minor.$patch"
}

if [ "${1:-}" = --subjects ]; then
  from_subjects
  exit
fi

commit="${1:-HEAD}"
cd "$(dirname "${BASH_SOURCE[0]}")"
if [ "$(git rev-parse --is-shallow-repository)" = true ]; then
  echo "version.sh: a shallow clone does not hold the history the version is read from (git fetch --unshallow)" >&2
  exit 1
fi
# The commit that added this script, followed through renames; none while it
# is not committed yet
base="$(git log --follow --diff-filter=A --format=%H -- "$(basename "${BASH_SOURCE[0]}")" | tail -n 1)"
if [ -z "$base" ]; then
  from_subjects < /dev/null
elif git merge-base --is-ancestor "$base" "$commit"; then
  git log --no-merges --reverse --format=%s "$base..$commit" | from_subjects
else
  echo "version.sh: $commit comes before the commit that set the version to ${BASE_VERSION[0]}.${BASE_VERSION[1]}.${BASE_VERSION[2]} ($base)" >&2
  exit 1
fi
