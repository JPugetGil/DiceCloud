#!/usr/bin/env bash
# The production bundle of the working tree, checked as the image runs it:
# built as the Dockerfile builds it and pruned, started on a throwaway MongoDB
# (port 27999) at port 3300, then the e2e checks against it. The development
# server (3000/3001) is left alone. Every check runs; the script exits 1 if
# any failed, and lists them.
#
#   bash tests/prod/prodcheck.sh [work dir]      (default /tmp/dicecloud-prodcheck)
#   PRODCHECK_SKIP_E2E=1 bash tests/prod/prodcheck.sh
#                                    stops before the e2e checks (a build's checks)
#   PRODCHECK_EXTRA_MARKERS='a b' bash tests/prod/prodcheck.sh
#                                    also requires these strings absent from the
#                                    client (one present there shows a failure)
#
# Needs Meteor, tests/e2e installed (meteor npm install there, and Playwright's
# Chromium), and the SRD 5.1 bestiary's snapshots in tools/libraryImport/data
# (out of git, see tools/libraryImport/README.md): the monsters' checks need it.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
W="${1:-/tmp/dicecloud-prodcheck}"
# The latest Meteor tool's MongoDB
TOOLS=("$HOME"/.meteor/packages/meteor-tool/*/mt-os.linux.x86_64)
MONGOD="$(printf '%s\n' "${TOOLS[@]}" | sort -V | tail -1)/dev_bundle/mongodb/bin/mongod"
BESTIARIES=("$REPO/tools/libraryImport/data/srd51-bestiary.json.gz" "$REPO/tools/libraryImport/data/srd51-bestiary.json-fr.gz")
START="$(date '+%F %T')"
FAILED=()
log() { echo "[$(date +%T)] $*"; }
# check <what> <status>: a check passes on status 0
check() {
  if [ "$2" -eq 0 ]; then
    echo "  ok    $1"
  else
    echo "  FAIL  $1"
    FAILED+=("$1")
  fi
}
# expect <what> <test...>: passes when the test does
expect() {
  local what="$1"
  shift
  if "$@"; then check "$what" 0; else check "$what" 1; fi
}

MONGOD_PID=''
BUNDLE_PID=''
cleanup() {
  # Only the processes this script started
  if [ -n "$BUNDLE_PID" ]; then pkill -P "$BUNDLE_PID" 2>/dev/null; kill "$BUNDLE_PID" 2>/dev/null; fi
  if [ -n "$MONGOD_PID" ]; then kill "$MONGOD_PID" 2>/dev/null; fi
  # meteor build leaves the client's production chunks in app/public: the
  # typecheck would scan them
  find "$REPO/app/public/build-chunks" "$REPO/app/public/build-assets" -type f -newermt "$START" -delete 2>/dev/null
}
trap cleanup EXIT

summary() {
  log "summary"
  if [ ${#FAILED[@]} -eq 0 ]; then
    echo "  every check passed"
    exit 0
  fi
  printf '  failed: %s\n' "${FAILED[@]}"
  exit 1
}

rm -rf "$W"; mkdir -p "$W/db"

log "build (log: $W/build.log)"
(cd "$REPO/app" && meteor build --directory "$W/dist" --architecture os.linux.x86_64 > "$W/build.log" 2>&1)
check "the bundle builds" $?
[ -d "$W/dist/bundle" ] || summary

log "prune, as the Dockerfile runs it (sh: dash here too)"
sh "$REPO/deploy/prune-bundle.sh" "$W/dist/bundle"
check "the bundle prunes" $?
echo "  bundle size after pruning: $(du -sh "$W/dist/bundle" | cut -f1)"

# Server-only code (the dice's HMAC, Discord's secrets: the webhooks' cipher,
# the bot token, interaction signatures, OAuth states, /action's menus) must
# be absent from the client, and each marker present in the server program,
# or it checks nothing. Strings and property names survive minification;
# function names do not
log "client bundle: server-only code absent (in the server program, or it checks nothing)"
for marker in createHmac 'node:crypto' _isDeactivated aes-256-gcm botToken tokenKey \
  x-signature-ed25519 timingSafeEqual discordActionSessions ${PRODCHECK_EXTRA_MARKERS:-}; do
  client="$(grep -rl --include='*.js' -F "$marker" "$W/dist/bundle/programs/web.browser" | wc -l)"
  server="$(grep -rl --include='*.js' -F "$marker" "$W/dist/bundle/programs/server/app" | wc -l)"
  expect "$marker absent from the client ($client files)" [ "$client" -eq 0 ]
  expect "$marker in the server program ($server files)" [ "$server" -gt 0 ]
done

log "npm install --omit=dev, as the image does"
(cd "$W/dist/bundle/programs/server" && meteor npm install --omit=dev > "$W/npm.log" 2>&1)
check "the server's packages install" $?

log "throwaway MongoDB :27999 (a replica set of one, as in production)"
expect "Meteor's mongod is there ($MONGOD)" [ -x "$MONGOD" ]
[ -x "$MONGOD" ] || summary
"$MONGOD" --port 27999 --replSet rs0 --dbpath "$W/db" --bind_ip 127.0.0.1 > "$W/mongod.log" 2>&1 &
MONGOD_PID=$!
cat > "$W/rsinit.js" <<EOF
const { MongoClient } = require('$REPO/tests/e2e/node_modules/mongodb');
(async () => {
  for (let i = 0; i < 30; i++) {
    try {
      const client = await MongoClient.connect('mongodb://127.0.0.1:27999/?directConnection=true');
      try { await client.db('admin').command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: '127.0.0.1:27999' }] } }); } catch {}
      const { isWritablePrimary } = await client.db('admin').command({ hello: 1 });
      await client.close();
      if (isWritablePrimary) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  process.exit(1);
})();
EOF
(cd "$REPO/app" && meteor node "$W/rsinit.js")
check "MongoDB's replica set is ready" $?

log "the bundle on :3300 (log: $W/bundle.log)"
export MONGO_URL='mongodb://127.0.0.1:27999/dicecloud?replicaSet=rs0'
# The version as deploy/dicecloud.sh start gives it to the image: the bundle
# runs outside the clone, where the server cannot read it itself
CONTAINER_VERSION="$(git -C "$REPO" rev-parse --short=8 HEAD)"
APP_VERSION="$("$REPO/deploy/version.sh")"
APP_COMMIT_DATE="$(git -C "$REPO" log -1 --format=%cI)"
export CONTAINER_VERSION APP_VERSION APP_COMMIT_DATE
(cd "$W/dist/bundle" && PORT=3300 ROOT_URL=http://localhost:3300 \
  METEOR_SETTINGS="$(cat "$REPO/app/exampleMeteorSettings.json")" \
  exec meteor node main.js > "$W/bundle.log" 2>&1) &
BUNDLE_PID=$!
status=''
for _ in $(seq 1 90); do
  status="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3300/ 2>/dev/null)"
  [ "$status" = 200 ] && break
  sleep 2
done
expect "the bundle answers / (HTTP $status)" [ "$status" = 200 ]

# What the About page and the side menu read
shown="$(curl -s http://localhost:3300/about | grep -o 'decodeURIComponent("[^"]*' | sed 's/^decodeURIComponent("//' \
  | python3 -c 'import sys, urllib.parse, json; v = json.loads(urllib.parse.unquote(sys.stdin.read()))["PUBLIC_SETTINGS"].get("appVersion") or {}; print(v.get("version"), v.get("commit"))' 2>/dev/null)"
expect "the bundle shows version $APP_VERSION ($CONTAINER_VERSION): ${shown:-nothing}" [ "$shown" = "$APP_VERSION $CONTAINER_VERSION" ]

if [ -n "${PRODCHECK_SKIP_E2E:-}" ]; then
  log "e2e checks skipped (PRODCHECK_SKIP_E2E)"
else
  log "e2e setup and checks against the bundle (logs: $W/e2e*.log)"
  (cd "$REPO/tests/e2e" && E2E_BASE_URL=http://localhost:3300 meteor npm run setup > "$W/e2e-setup.log" 2>&1)
  check "the e2e accounts are set up" $?
  missing=0
  for file in "${BESTIARIES[@]}"; do [ -f "$file" ] || missing=1; done
  if [ "$missing" -eq 0 ]; then
    (cd "$REPO/tools/libraryImport" && meteor node import.js --owner e2e-tester "${BESTIARIES[@]}" > "$W/import.log" 2>&1)
    check "the SRD 5.1 bestiaries import" $?
  else
    check "the SRD 5.1 bestiaries are in tools/libraryImport/data (the monsters' checks need them)" 1
  fi
  (cd "$REPO/tests/e2e" && E2E_BASE_URL=http://localhost:3300 meteor npm test > "$W/e2e.log" 2>&1)
  check "the e2e checks pass: $(grep -E 'checks passed' "$W/e2e.log" | tail -1)" $?
  grep -E "✗" "$W/e2e.log" | head -12
fi

log "the bundle's log"
duplicates="$(grep -c -E 'E11000|duplicate key' "$W/bundle.log")"
expect "no duplicate key in the bundle's log ($duplicates lines)" [ "$duplicates" -eq 0 ]
# Shown, not checked: some errors are the checks' own (a refused call)
grep -i -E "exception|error" "$W/bundle.log" | head -8

summary
