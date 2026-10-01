#!/bin/bash
# Runs before the MongoDB image's own entrypoint. A replica set with
# authentication needs a key file that belongs to mongod's user and that only
# it can read, which a file mounted from the host cannot promise: it is written
# here from MONGO_REPLICA_KEY on every start.
set -euo pipefail

keyfile=/etc/mongo/replica.key
mkdir -p "$(dirname "$keyfile")"
printf '%s\n' "$MONGO_REPLICA_KEY" > "$keyfile"
chown mongodb:mongodb "$keyfile"
chmod 400 "$keyfile"
unset MONGO_REPLICA_KEY

exec docker-entrypoint.sh "$@"
