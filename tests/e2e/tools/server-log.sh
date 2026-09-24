#!/bin/bash
# Server-side exceptions a browser check cannot see: a clean console can hide an
# async error that only reached the server's log.
#
#   meteor run 2>&1 | tee /tmp/dicecloud-dev.log      # in app/
#   tests/e2e/tools/server-log.sh /tmp/dicecloud-dev.log [from-line]
#
# Prints each distinct error line with its count; nothing means a clean log.
LOG="${1:?usage: server-log.sh <dev-server-log> [from-line]}"
FROM="${2:-0}"
tail -n +"$FROM" "$LOG" | grep -aE 'Exception|TypeError|ReferenceError|Error:|Unhandled|ERROR' \
  | grep -av 'Exception from sub searchLibraryNodes id' | sort | uniq -c | sort -rn | head -20
