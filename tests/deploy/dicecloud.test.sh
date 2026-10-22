#!/usr/bin/env bash
# Tests of deploy/dicecloud.sh's backups and restores, without Docker: the
# script is sourced (its main does not run), and compose, aws_ and docker_
# are replaced by stubs that log their calls and answer as told. What they
# cannot check, a restore on a real MongoDB, is the exercise in
# deploy/README.md (Backups).
#
#   bash tests/deploy/dicecloud.test.sh
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
failures=0

# A test runs in a subshell: the script's die and exit end it, not the suite;
# a call expected to fail runs in one of its own, so that the test goes on
run_test() {
  local name="$1" status
  shift
  # Not in an if: in a condition, bash ignores set -e inside the subshell too,
  # and a test would stop at nothing but its last command
  ( set -e; "$@" ) > "$WORK/out" 2>&1
  status=$?
  if [ "$status" -eq 0 ]; then
    echo "ok   $name"
  else
    echo "FAIL $name"
    sed 's/^/     /' "$WORK/out"
    failures=$((failures + 1))
  fi
}

# The script, with stubs for what reaches Docker
setup() {
  # shellcheck source=../../deploy/dicecloud.sh
  source "$REPO/deploy/dicecloud.sh"
  export CALLS="$WORK/calls"
  : > "$CALLS"
  BACKUP_DIR="$WORK/backups"
  mkdir -p "$BACKUP_DIR"
  # The settings dicecloud.sh reads, which shellcheck cannot see it read
  # shellcheck disable=SC2034
  load_env() {
    BACKUP_KEEP_DAYS=7 BACKUP_S3_BUCKET=bucket BACKUP_S3_PREFIX=dicecloud-backups SNAPSHOTS_S3_PREFIX=library-snapshots
    MONGO_APP_DATABASE=dicecloud DICECLOUD_YES=1
  }
  aws_() { echo "aws_ $*" >> "$CALLS"; }
  docker_() { echo "docker_ $*" >> "$CALLS"; }
  is_running() { return 0; }
  wait_healthy() { :; }
  compose() {
    echo "compose $*" >> "$CALLS"
    case "$*" in
      *mongodump*) printf 'a database' | gzip ;;
      *mongorestore*) cat > /dev/null; printf '%s\n' "${RESTORE_REPORT:-}"; return "${RESTORE_STATUS:-0}" ;;
    esac
  }
}

fail() { echo "$*"; return 1; }

backup_file() {
  local file="$BACKUP_DIR/dicecloud-$1.archive.gz"
  printf 'old' | gzip > "$file"
  echo "$file"
}

test_copy_never_deletes() {
  setup
  cmd_backup
  grep -q 'aws_ .* s3 sync /work s3://bucket/dicecloud-backups/' "$CALLS" || fail "no copy to the bucket"
  ! grep -q -- '--delete' "$CALLS" || fail "the copy deletes from the bucket"
}

test_restore_reports_documents() {
  setup
  local file
  file="$(backup_file 2026-10-01_033000)"
  RESTORE_REPORT=$'2026-10-21T03:30:00.000+0000\t1234 document(s) restored successfully. 0 document(s) failed to restore.'
  (cmd_restore "$file") > "$WORK/log" 2>&1 || fail "the restore failed: $(cat "$WORK/log")"
  grep -q 'Restored 1234 documents' "$WORK/log" || fail "$(cat "$WORK/log")"
  grep -q 'compose start dicecloud' "$CALLS" || fail "the app was not started again"
}

test_restore_of_nothing_is_refused() {
  setup
  local file
  file="$(backup_file 2026-10-01_033000)"
  RESTORE_REPORT=$'2026-10-21T03:30:00.000+0000\t0 document(s) restored successfully. 0 document(s) failed to restore.'
  if (cmd_restore "$file") > "$WORK/log" 2>&1; then fail "a restore of nothing passed"; fi
  grep -q 'nothing was restored' "$WORK/log" || fail "$(cat "$WORK/log")"
  grep -q 'compose start dicecloud' "$CALLS" || fail "the app stayed stopped, the database untouched"
}

test_failed_restore_says_the_way_back() {
  setup
  local file
  file="$(backup_file 2026-10-01_033000)"
  RESTORE_REPORT='Failed: connection refused' RESTORE_STATUS=1
  if (cmd_restore "$file") > "$WORK/log" 2>&1; then fail "a failed restore passed"; fi
  grep -q 'The app is stopped' "$WORK/log" || fail "$(cat "$WORK/log")"
  # The way back: the backup made just before, not the one restored
  local safety
  safety="$(latest_backup)"
  [ "$safety" != "$file" ] || fail "no backup was made first"
  grep -qF "restore $safety" "$WORK/log" || fail "$(cat "$WORK/log")"
}

test_partial_restore_fails() {
  setup
  local file
  file="$(backup_file 2026-10-01_033000)"
  RESTORE_REPORT=$'2026-10-21T03:30:00.000+0000\t1000 document(s) restored successfully. 3 document(s) failed to restore.'
  if (cmd_restore "$file") > "$WORK/log" 2>&1; then fail "a partial restore passed"; fi
  grep -q 'The app is stopped' "$WORK/log" || fail "$(cat "$WORK/log")"
}

test_pull_takes_the_latest() {
  setup
  aws_() {
    echo "aws_ $*" >> "$CALLS"
    case "$*" in
      # aws s3 ls without --human-readable: date, time, size in bytes, name
      *' s3 ls '*) printf '2026-10-01 03:30:01    1048576 dicecloud-2026-10-01_033000.archive.gz\n2026-10-20 03:30:01    1048576 dicecloud-2026-10-20_033000.archive.gz\n' ;;
      *' s3 cp '*) printf 'a database' | gzip > "$BACKUP_DIR/dicecloud-2026-10-20_033000.archive.gz.part" ;;
    esac
  }
  (cmd_backups pull) > "$WORK/log" 2>&1 || fail "$(cat "$WORK/log")"
  [ -f "$BACKUP_DIR/dicecloud-2026-10-20_033000.archive.gz" ] || fail "the latest backup did not come"
  grep -q 'restore .*dicecloud-2026-10-20_033000.archive.gz' "$WORK/log" || fail "$(cat "$WORK/log")"
}

test_pull_refuses_another_name() {
  setup
  if (cmd_backups pull '../../etc/passwd') > "$WORK/log" 2>&1; then fail "pulled a name that is no backup's"; fi
  ! grep -q 's3 cp' "$CALLS" || fail "copied it"
}

test_tools_archive_without_secrets() {
  setup
  mkdir -p "$WORK/tools/discord/probe"
  echo 'BOT_TOKEN=secret' > "$WORK/tools/discord/probe/.env.probe"
  echo 'BOT_TOKEN=' > "$WORK/tools/discord/probe/.env.probe.example"
  tar -czf "$WORK/with-env.tar.gz" -C "$WORK" tools
  if (cmd_snapshots tools "$WORK/with-env.tar.gz") > "$WORK/log" 2>&1; then fail "an archive with .env was sent"; fi
  grep -q "holds .env files" "$WORK/log" || fail "$(cat "$WORK/log")"
  tar -czf "$WORK/clean.tar.gz" --exclude='.env*' -C "$WORK" tools
  # The examples are no secrets
  tar -czf "$WORK/examples.tar.gz" --exclude='.env.probe' -C "$WORK" tools
  (cmd_snapshots tools "$WORK/clean.tar.gz") > "$WORK/log" 2>&1 || fail "$(cat "$WORK/log")"
  (cmd_snapshots tools "$WORK/examples.tar.gz") > "$WORK/log" 2>&1 || fail "$(cat "$WORK/log")"
}

# A folder of snapshots as the bucket gave them before the scripts were in
# git: with a stale script of its own, which must not be the one used
snapshot_folder() {
  mkdir -p "$WORK/kit/data"
  printf 'snapshot' | gzip > "$WORK/kit/data/srd51-bestiary.json.gz"
  echo '{}' > "$WORK/kit/data/manifest.json"
  echo 'a stale copy' > "$WORK/kit/import.js"
  echo "$WORK/kit"
}

test_libraries_take_the_clones_scripts() {
  setup
  docker_() {
    echo "docker_ $*" >> "$CALLS"
    case "$*" in *'exec -i '*) cat > "$WORK/sent.tar" ;; esac
  }
  local kit file
  kit="$(snapshot_folder)"
  (cmd_libraries "$kit" someone) > "$WORK/log" 2>&1 || fail "$(cat "$WORK/log")"
  for file in import.js createCollection.js lib.js data/srd51-bestiary.json.gz data/manifest.json; do
    tar -tf "$WORK/sent.tar" | grep -qx "$file" || fail "$file was not sent: $(tar -tf "$WORK/sent.tar")"
  done
  tar -xOf "$WORK/sent.tar" import.js | cmp -s - "$REPO/tools/libraryImport/import.js" || fail "not the clone's import.js"
}

test_snapshots_move_the_snapshots_alone() {
  setup
  local kit
  kit="$(snapshot_folder)"
  (cmd_snapshots push "$kit") > "$WORK/log" 2>&1 || fail "$(cat "$WORK/log")"
  grep -qF -- "s3://bucket/library-snapshots/kit/ --only-show-errors --exclude * --include data/*.gz --include data/manifest*.json" "$CALLS" \
    || fail "pushed more than the snapshots: $(cat "$CALLS")"
  aws_() {
    echo "aws_ $*" >> "$CALLS"
    case "$*" in *' s3 sync s3:'*) printf 'snapshot' | gzip > "$WORK/pulled/data/srd51-bestiary.json.gz" ;; esac
  }
  (cmd_snapshots pull "$WORK/pulled") > "$WORK/log" 2>&1 || fail "$(cat "$WORK/log")"
  grep -qF -- "/work --only-show-errors --exclude * --include data/*" "$CALLS" || fail "pulled more than the snapshots: $(cat "$CALLS")"
  (cmd_snapshots pull "$WORK/pulled" 'srd51-bestiary*') > "$WORK/log" 2>&1 || fail "$(cat "$WORK/log")"
  grep -qF -- "--exclude * --include data/srd51-bestiary*" "$CALLS" || fail "the pattern was not kept: $(cat "$CALLS")"
}

for test in $(declare -F | awk '$3 ~ /^test_/ { print $3 }'); do
  run_test "${test#test_}" "$test"
done
[ "$failures" -eq 0 ] || { echo "$failures failing"; exit 1; }
echo "all passed"
