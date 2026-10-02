#!/usr/bin/env bash
# DiceCloud in production on this machine (Ubuntu Server): the app, MongoDB as
# a replica set of one, a Cloudflare tunnel, and daily database backups.
#
#   ./dicecloud.sh install          once: Docker, power settings, .env, backup timer
#   ./dicecloud.sh start            builds the image if needed and starts everything
#   ./dicecloud.sh update           pulls the code, backs up, rebuilds and restarts
#   ./dicecloud.sh stop             stops everything; the data stays
#   ./dicecloud.sh status           containers, backups, next backup
#   ./dicecloud.sh logs [service]   follows a service's log (default: dicecloud)
#   ./dicecloud.sh backup           backs the database up now (the timer does it daily)
#   ./dicecloud.sh restore <file>   replaces the database with a backup
#   ./dicecloud.sh libraries <folder> <username>
#                                   imports the libraries of tools/libraryImport
#                                   (its data/*.gz and manifests), owned by that
#                                   account, which must exist
#   ./dicecloud.sh admin <username> makes that account an administrator
#   ./dicecloud.sh import <url> [database]
#                                   replaces the database with another MongoDB's,
#                                   such as Atlas. Its database: the one named in
#                                   the URL, else "test", MongoDB's default
#
# Settings are in .env (see .env.example); README.md in this folder explains
# the setup.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$DEPLOY_DIR")"
ENV_FILE="${DICECLOUD_ENV_FILE:-$DEPLOY_DIR/.env}"

log() { printf '%s %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

confirm() {
  [ "${DICECLOUD_YES:-}" = 1 ] && return 0
  local answer
  printf '%s Type "yes" to go on: ' "$1"
  read -r answer
  [ "$answer" = yes ] || die "cancelled"
}

# .env, read as data rather than run: values may hold spaces and symbols.
# A value can be wrapped in single or double quotes
load_env() {
  [ -f "$ENV_FILE" ] || die "$ENV_FILE is missing: run ./dicecloud.sh install"
  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    key="${BASH_REMATCH[1]}"
    value="${BASH_REMATCH[2]}"
    if [[ "$value" =~ ^\'(.*)\'$ ]] || [[ "$value" =~ ^\"(.*)\"$ ]]; then
      value="${BASH_REMATCH[1]}"
    fi
    printf -v "$key" '%s' "$value"
  done < "$ENV_FILE"
  : "${ROOT_URL:=}" "${SETTINGS_FILE:=../app/settings.production.json}"
  : "${CLOUDFLARE_TUNNEL_TOKEN:=}" "${MAIL_URL:=}"
  : "${MONGO_ROOT_PASSWORD:=}" "${MONGO_APP_PASSWORD:=}" "${MONGO_REPLICA_KEY:=}"
  : "${MONGO_APP_DATABASE:=dicecloud}"
  : "${BACKUP_DIR:=/srv/dicecloud/backups}" "${BACKUP_KEEP_DAYS:=7}" "${BACKUP_TIME:=*-*-* 03:30:00}"
  : "${BACKUP_S3_BUCKET:=}" "${BACKUP_S3_PREFIX:=dicecloud-backups}" "${BACKUP_S3_REGION:=eu-west-3}"
  : "${BACKUP_S3_ACCESS_KEY_ID:=}" "${BACKUP_S3_SECRET_ACCESS_KEY:=}" "${BACKUP_S3_ENDPOINT:=}"
  : "${APP_LOCAL_PORT:=3000}"
}

# Sets a value in .env, adding the line if it is not there
set_env() {
  local tmp
  tmp="$(mktemp)"
  awk -v key="$1" -v value="$2" '
    index($0, key "=") == 1 { print key "=" value; done = 1; next }
    { print }
    END { if (!done) print key "=" value }
  ' "$ENV_FILE" > "$tmp"
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
}

# Docker, through sudo until the user's docker group membership applies (at
# their next login). sudo keeps only the variables compose and the backups pass
DOCKER=()
docker_() {
  if [ ${#DOCKER[@]} -eq 0 ]; then
    if docker info >/dev/null 2>&1; then
      DOCKER=(docker)
    else
      DOCKER=(sudo --preserve-env=METEOR_SETTINGS,CONTAINER_VERSION,AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY,AWS_DEFAULT_REGION docker)
    fi
  fi
  "${DOCKER[@]}" "$@"
}

compose() {
  # Only `start` creates the app's container, with the real settings; other
  # commands need a value for compose to read its file
  if [ -z "${METEOR_SETTINGS+set}" ]; then export METEOR_SETTINGS='{}'; fi
  docker_ compose --project-directory "$DEPLOY_DIR" --env-file "$ENV_FILE" -f "$DEPLOY_DIR/compose.yml" "$@"
}

# The tunnel runs once it has a token
up_profiles() {
  if [ -n "$CLOUDFLARE_TUNNEL_TOKEN" ]; then printf '%s\n' --profile tunnel; fi
}

settings_path() {
  case "$SETTINGS_FILE" in
    /*) printf '%s' "$SETTINGS_FILE" ;;
    *) printf '%s' "$DEPLOY_DIR/$SETTINGS_FILE" ;;
  esac
}

check_config() {
  if [ -z "$MONGO_ROOT_PASSWORD" ] || [ -z "$MONGO_APP_PASSWORD" ] || [ -z "$MONGO_REPLICA_KEY" ]; then
    die "the database passwords are missing from $ENV_FILE: run ./dicecloud.sh install"
  fi
  [ -n "$ROOT_URL" ] || die "set ROOT_URL in $ENV_FILE"
  [ -f "$(settings_path)" ] || die "settings file $(settings_path) not found (SETTINGS_FILE in $ENV_FILE)"
  [ -n "$CLOUDFLARE_TUNNEL_TOKEN" ] \
    || log "No CLOUDFLARE_TUNNEL_TOKEN: the app only answers on this machine, at http://localhost:$APP_LOCAL_PORT"
  [ -n "$MAIL_URL" ] || log "No MAIL_URL: account emails are printed in the app's log instead of sent"
}

# What a failing container says: its latest log lines and health checks
show_failure() {
  local service="$1" id
  id="$(compose ps -aq "$service" 2>/dev/null)"
  [ -n "$id" ] || return 0
  echo "--- $service: log" >&2
  compose logs --no-log-prefix --tail 40 "$service" >&2 || true
  echo "--- $service: latest health checks" >&2
  docker_ inspect -f '{{if .State.Health}}{{range .State.Health.Log}}exit {{.ExitCode}}: {{.Output}}{{println}}{{end}}{{end}}' "$id" >&2 || true
}

# Waits for a container's health check, and shows its log if it fails
wait_healthy() {
  local service="$1" id status
  id="$(compose ps -q "$service")"
  [ -n "$id" ] || die "$service is not running"
  for _ in $(seq 1 60); do
    status="$(docker_ inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || echo gone)"
    case "$status" in
      healthy) return 0 ;;
      unhealthy | gone) break ;;
    esac
    sleep 5
  done
  show_failure "$service"
  die "$service did not start properly ($status)"
}

is_running() {
  [ -n "$(compose ps -q --status running "$1" 2>/dev/null)" ]
}

cmd_install() {
  [ "$(id -u)" -ne 0 ] || die "run this as your own user, not root: it uses sudo where needed"

  if command -v docker >/dev/null && sudo docker compose version >/dev/null 2>&1 \
    && sudo docker buildx version >/dev/null 2>&1; then
    log "Docker and Compose are installed"
  else
    # Ubuntu's own packages; buildx is what Compose builds images with
    log "Installing Docker, Compose and the tools the script uses"
    sudo apt-get update
    sudo apt-get install -y docker.io docker-compose-v2 docker-buildx git openssl python3 gzip
  fi
  sudo systemctl enable --now docker
  if ! id -nG | tr ' ' '\n' | grep -qx docker; then
    sudo usermod -aG docker "$(id -un)"
    log "Added $(id -un) to the docker group: it applies at the next login, sudo is used until then"
  fi

  log "Laptop as a server: no sleep, even with the lid closed"
  sudo mkdir -p /etc/systemd/logind.conf.d
  printf '[Login]\nHandleLidSwitch=ignore\nHandleLidSwitchExternalPower=ignore\nHandleLidSwitchDocked=ignore\n' \
    | sudo tee /etc/systemd/logind.conf.d/dicecloud-lid.conf >/dev/null
  sudo systemctl mask --quiet sleep.target suspend.target hibernate.target hybrid-sleep.target

  if [ ! -f "$ENV_FILE" ]; then
    cp "$DEPLOY_DIR/.env.example" "$ENV_FILE"
    log "Created $ENV_FILE"
  fi
  chmod 600 "$ENV_FILE"
  load_env
  # Generated once: the database is created with them
  if [ -z "$MONGO_ROOT_PASSWORD" ]; then set_env MONGO_ROOT_PASSWORD "$(openssl rand -hex 24)"; fi
  if [ -z "$MONGO_APP_PASSWORD" ]; then set_env MONGO_APP_PASSWORD "$(openssl rand -hex 24)"; fi
  if [ -z "$MONGO_REPLICA_KEY" ]; then set_env MONGO_REPLICA_KEY "$(openssl rand -base64 756 | tr -d '\n')"; fi
  load_env

  sudo mkdir -p "$BACKUP_DIR"
  sudo chown "$(id -un):$(id -gn)" "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"

  log "Daily backup at $BACKUP_TIME, kept $BACKUP_KEEP_DAYS days in $BACKUP_DIR"
  sudo tee /etc/systemd/system/dicecloud-backup.service >/dev/null <<EOF
[Unit]
Description=DiceCloud database backup
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
User=$(id -un)
ExecStart="$DEPLOY_DIR/dicecloud.sh" backup
EOF
  sudo tee /etc/systemd/system/dicecloud-backup.timer >/dev/null <<EOF
[Unit]
Description=Daily DiceCloud database backup

[Timer]
OnCalendar=$BACKUP_TIME
# A backup missed while the machine was off runs once it is back on
Persistent=true
RandomizedDelaySec=10min

[Install]
WantedBy=timers.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable --now --quiet dicecloud-backup.timer

  log "Installed. Next:"
  log "  1. In $ENV_FILE: ROOT_URL, CLOUDFLARE_TUNNEL_TOKEN and MAIL_URL"
  log "  2. Copy the settings file to $(settings_path)"
  log "  3. ./dicecloud.sh start"
}

cmd_start() {
  load_env
  check_config
  export CONTAINER_VERSION METEOR_SETTINGS
  CONTAINER_VERSION="$(git -C "$REPO_DIR" rev-parse --short=8 HEAD)"
  # One line of JSON, checked on the way
  METEOR_SETTINGS="$(python3 -c 'import json, sys; print(json.dumps(json.load(open(sys.argv[1])), separators=(",", ":")))' "$(settings_path)")" \
    || die "$(settings_path) is not valid JSON"

  log "Building DiceCloud $CONTAINER_VERSION (the first build takes a while)"
  compose build dicecloud
  log "Starting"
  if ! compose up -d mongo; then
    show_failure mongo
    die "MongoDB did not start: see above"
  fi
  wait_healthy mongo
  # The app's account, brought up to date before the app connects with it
  compose exec -T mongo sh -c 'exec mongosh --quiet -u root -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin admin /docker-entrypoint-initdb.d/create-app-user.js' \
    || die "could not update the app's database account"
  # shellcheck disable=SC2046
  if ! compose $(up_profiles) up -d --remove-orphans; then
    show_failure mongo
    show_failure dicecloud
    die "the containers did not start: see above"
  fi
  wait_healthy dicecloud
  log "DiceCloud $CONTAINER_VERSION is running: $ROOT_URL"
}

cmd_update() {
  load_env
  check_config
  log "Pulling the code"
  git -C "$REPO_DIR" pull --ff-only
  if is_running mongo; then
    log "Backing up before the update"
    cmd_backup
  fi
  cmd_start
  # The current image and the one before it stay, to go back if needed
  docker_ images dicecloud --format '{{.Repository}}:{{.Tag}}' | tail -n +3 | xargs -r "${DOCKER[@]}" rmi >/dev/null 2>&1 || true
}

cmd_stop() {
  load_env
  compose --profile tunnel stop
}

cmd_status() {
  load_env
  compose --profile tunnel ps
  echo
  local latest
  latest="$(find "$BACKUP_DIR" -maxdepth 1 -name 'dicecloud-*.archive.gz' 2>/dev/null | sort | tail -n 1)"
  if [ -z "$latest" ]; then
    echo "No backup in $BACKUP_DIR yet"
  else
    echo "Backups in $BACKUP_DIR:"
    find "$BACKUP_DIR" -maxdepth 1 -name 'dicecloud-*.archive.gz' -printf '  %f  %s bytes\n' | sort
    if [ -n "$(find "$latest" -mmin +2160)" ]; then
      echo "WARNING: the latest backup is more than 36 hours old: journalctl -u dicecloud-backup"
    fi
  fi
  echo
  systemctl list-timers dicecloud-backup.timer --no-pager 2>/dev/null || true
}

cmd_logs() {
  load_env
  compose --profile tunnel logs -f --tail 100 "${1:-dicecloud}"
}

# Removes the backups older than BACKUP_KEEP_DAYS days, but never one of the
# BACKUP_KEEP_DAYS latest: a machine stopped for a while keeps its last ones
prune_backups() {
  local cutoff file stamp
  cutoff="$(date -d "-$BACKUP_KEEP_DAYS days" +%F_%H%M%S)"
  find "$BACKUP_DIR" -maxdepth 1 -name 'dicecloud-*.archive.gz' | sort | head -n -"$BACKUP_KEEP_DAYS" \
    | while read -r file; do
      stamp="$(basename "$file" .archive.gz)"
      stamp="${stamp#dicecloud-}"
      if [[ "$stamp" < "$cutoff" ]]; then
        rm -f -- "$file"
        log "Removed the old backup $(basename "$file")"
      fi
    done
}

# The same backups in the bucket: files removed here are removed there
copy_to_s3() {
  log "Copying the backups to s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/"
  export AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY"
  export AWS_DEFAULT_REGION="$BACKUP_S3_REGION"
  local endpoint=()
  if [ -n "$BACKUP_S3_ENDPOINT" ]; then endpoint=(--endpoint-url "$BACKUP_S3_ENDPOINT"); fi
  docker_ run --rm \
    -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY -e AWS_DEFAULT_REGION \
    -v "$BACKUP_DIR:/backups:ro" amazon/aws-cli "${endpoint[@]}" \
    s3 sync /backups "s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/" \
    --delete --exclude '*' --include 'dicecloud-*.archive.gz' --only-show-errors
}

cmd_backup() {
  load_env
  is_running mongo || die "MongoDB is not running: ./dicecloud.sh start"
  mkdir -p "$BACKUP_DIR"
  local file="$BACKUP_DIR/dicecloud-$(date +%F_%H%M%S).archive.gz"
  log "Backing up the database to $file"
  # Written aside, then renamed: a failed backup never passes for a good one
  if ! compose exec -T mongo sh -c 'exec mongodump --quiet --host localhost -u root -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db "$MONGO_APP_DATABASE" --archive --gzip' > "$file.part"; then
    rm -f "$file.part"
    die "the backup failed"
  fi
  if ! gzip -t "$file.part"; then
    rm -f "$file.part"
    die "the backup is damaged"
  fi
  mv "$file.part" "$file"
  log "Backed up: $(du -h "$file" | cut -f1)"
  prune_backups
  if [ -n "$BACKUP_S3_BUCKET" ]; then copy_to_s3; fi
}

restore_archive() {
  compose exec -T mongo sh -c 'exec mongorestore --quiet --host localhost -u root -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip --drop --nsInclude "$MONGO_APP_DATABASE.*"'
}

cmd_restore() {
  load_env
  local file="${1:-}"
  [ -n "$file" ] && [ -f "$file" ] || die "usage: ./dicecloud.sh restore <backup file>"
  gzip -t "$file" || die "$file is damaged"
  is_running mongo || die "MongoDB is not running: ./dicecloud.sh start"
  confirm "This replaces the whole database with $(basename "$file")."
  log "Backing up the current database first"
  cmd_backup
  compose stop dicecloud
  log "Restoring $(basename "$file")"
  restore_archive < "$file"
  compose start dicecloud
  wait_healthy dicecloud
  log "Restored"
}

cmd_import() {
  load_env
  local url="${1:-}" source_db="${2:-}"
  [ -n "$url" ] || die 'usage: ./dicecloud.sh import "<mongodb URL>" [database]'
  if [ -z "$source_db" ]; then
    source_db="$(printf '%s' "$url" | sed -nE 's#^mongodb(\+srv)?://[^/]+/([^?]+).*#\2#p')"
    source_db="${source_db:-test}"
  fi
  # The database is given apart: mongodump refuses it in both places
  local source_url
  source_url="$(printf '%s' "$url" | sed -E 's#^(mongodb(\+srv)?://[^/?]+)/?[^?]*#\1/#')"
  confirm "This replaces the whole database with the \"$source_db\" database of $(printf '%s' "$url" | sed -E 's#//[^@/]*@#//#; s#\?.*##')."

  if ! is_running mongo; then
    compose up -d mongo
  fi
  wait_healthy mongo
  log "Backing up the current database first"
  cmd_backup
  if is_running dicecloud; then compose stop dicecloud; fi
  log "Copying \"$source_db\" into \"$MONGO_APP_DATABASE\""
  # The URL, password included, goes through the input: not in any process list
  printf '%s\n' "$source_url" | compose exec -T -e "SOURCE_DB=$source_db" mongo sh -c 'read -r SOURCE_URL
    mongodump --quiet --uri "$SOURCE_URL" --db "$SOURCE_DB" --archive --gzip \
    | mongorestore --quiet --host localhost -u root -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin \
      --archive --gzip --drop --nsInclude "$SOURCE_DB.*" --nsFrom "$SOURCE_DB.*" --nsTo "$MONGO_APP_DATABASE.*"'
  log "Imported. Start the app: ./dicecloud.sh start"
}

# The MongoDB driver inside the app's image, for the library import tools
MONGODB_DRIVER=/home/node/bundle/programs/server/npm/node_modules/meteor/npm-mongo/node_modules/mongodb

# The library import tools run inside the app's container, which has Node,
# that driver and the database's address: the database is not reachable from
# outside the containers
cmd_libraries() {
  load_env
  local dir="${1:-}" owner="${2:-}" id file
  [ -n "$dir" ] && [ -n "$owner" ] || die "usage: ./dicecloud.sh libraries <tools/libraryImport folder> <owner's username>"
  for file in import.js createCollection.js lib.js; do
    [ -f "$dir/$file" ] || die "$dir/$file not found"
  done
  compgen -G "$dir/data/*.gz" >/dev/null || die "no snapshot (*.gz) in $dir/data"
  is_running dicecloud || die "DiceCloud is not running: ./dicecloud.sh start"
  id="$(compose ps -q dicecloud)"

  log "Backing up the database first"
  cmd_backup
  log "Copying the import tools into the app's container"
  tar -C "$dir" -cf - import.js createCollection.js lib.js data \
    | docker_ exec -i "$id" sh -c 'rm -rf /tmp/libraryImport && mkdir /tmp/libraryImport && tar -C /tmp/libraryImport -xf -'
  log "Importing the libraries, owned by $owner"
  if ! docker_ exec -w /tmp/libraryImport -e "MONGODB_PATH=$MONGODB_DRIVER" -e "OWNER=$owner" "$id" sh -c '
    set -e
    node import.js --owner "$OWNER" data/*.gz
    for manifest in data/manifest*.json; do
      [ -e "$manifest" ] || continue
      node createCollection.js --owner "$OWNER" --manifest "$manifest"
    done'; then
    docker_ exec "$id" rm -rf /tmp/libraryImport || true
    die "the import failed: see above"
  fi
  docker_ exec "$id" rm -rf /tmp/libraryImport
  log "Libraries imported: they are in $owner's library, and in the community libraries"
}

# A new database has no administrator: the first one is made here
cmd_admin() {
  load_env
  local username="${1:-}"
  [ -n "$username" ] || die "usage: ./dicecloud.sh admin <username>"
  is_running mongo || die "MongoDB is not running: ./dicecloud.sh start"
  if compose exec -T -e "ADMIN_USERNAME=$username" mongo sh -c 'exec mongosh --quiet -u root -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin "$MONGO_APP_DATABASE" --eval "quit(db.users.updateOne({ username: process.env.ADMIN_USERNAME }, { \$addToSet: { roles: \"admin\" } }).matchedCount ? 0 : 1)"'; then
    log "$username is now an administrator"
  else
    die "no account named $username: create it on the site first"
  fi
}

main() {
  local command="${1:-}"
  shift || true
  case "$command" in
    install) cmd_install ;;
    start) cmd_start ;;
    update) cmd_update ;;
    stop) cmd_stop ;;
    status) cmd_status ;;
    logs) cmd_logs "$@" ;;
    backup) cmd_backup ;;
    restore) cmd_restore "$@" ;;
    import) cmd_import "$@" ;;
    libraries) cmd_libraries "$@" ;;
    admin) cmd_admin "$@" ;;
    *) awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "${BASH_SOURCE[0]}"
      [ -z "$command" ] || exit 1 ;;
  esac
}

# On one line, read before anything runs: `update` may rewrite this file
if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; exit $?; fi
