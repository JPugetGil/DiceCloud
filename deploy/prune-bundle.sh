#!/bin/sh
# Removes from a Meteor server bundle the npm packages the server never loads.
# Used by the Dockerfile, and by the production bundle check, so that what is
# checked is what ships.
#
#   sh prune-bundle.sh <bundle>   the bundle/ folder `meteor build --directory` writes
#
# The server bundle gets a copy of every npm package the app's dependencies
# reach, optional peer dependencies included (vue-router's unplugin brings
# Rspack and its native binary, pinia brings TypeScript): about 285 MB. Rspack
# has already bundled the app's own npm code into the server program, so from
# that copy the server only loads the Meteor packages' own dependencies
# (meteor/) and @babel/runtime, which Meteor packages import. Checked on
# 2026-10-06 by tracing the modules a production bundle loads during every
# browser check (tests/e2e), and by listing the requires left in the bundle.
# uWebSockets.js, ddp-server's optional transport (packages.ddp-server.transport:
# "uws", not used), ships a binary per platform and Node version: only the
# Linux x64 ones stay. The bundle goes from about 607 to 230 MB.
#
# A server dependency that Rspack leaves external (a native module:
# @meteorjs/rspack does so for bcrypt) must be added to the names kept below.
#
# POSIX sh: the Docker build runs it with Debian's dash.
set -eu

bundle="${1:?usage: sh prune-bundle.sh <bundle directory>}"
cd "$bundle/programs/server/npm/node_modules"
find . -mindepth 1 -maxdepth 1 ! -name meteor ! -name @babel -exec rm -rf {} +
find @babel -mindepth 1 -maxdepth 1 ! -name runtime -exec rm -rf {} +
find meteor/ddp-server/node_modules/uWebSockets.js -name 'uws_*.node' ! -name 'uws_linux_x64_*' -delete
