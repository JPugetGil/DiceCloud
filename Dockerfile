# DiceCloud production image, built from this repository's app/.
#
# Meteor builds with the Node.js version its release bundles: Meteor 3.5.2 ships
# Node 24.15.0 and npm 11.12.1 (`meteor node --version` in app/). The bundle runs
# on that same version, so native modules compiled while building (bcrypt) load
# at runtime. When app/.meteor/release changes, update METEOR_RELEASE and the
# runtime image together.

# --- Build --------------------------------------------------------------------
FROM debian:bookworm-slim AS build

# curl for the Meteor installer; python3, make and g++ for native npm modules
# that have no prebuilt binary
RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates curl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# The Meteor installer does not run as root
RUN useradd --create-home mt
USER mt
WORKDIR /home/mt

ARG METEOR_RELEASE=3.5.2
RUN curl -fsSL "https://install.meteor.com/?release=${METEOR_RELEASE}" | sh
ENV PATH="/home/mt/.meteor:${PATH}"

# Dependencies first, so that source changes reuse this layer. Development
# dependencies included: the Rspack build needs them.
COPY --chown=mt app/package.json app/package-lock.json app/
WORKDIR /home/mt/app
RUN meteor npm ci

COPY --chown=mt app/ ./
RUN meteor build --directory /home/mt/dist --architecture os.linux.x86_64

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
# Linux x64 ones stay. The bundle goes from about 607 to 230 MB. A server
# dependency that Rspack leaves external (a native module: @meteorjs/rspack
# does so for bcrypt) must be added to the names kept below.
RUN cd /home/mt/dist/bundle/programs/server/npm/node_modules \
  && find . -mindepth 1 -maxdepth 1 ! -name meteor ! -name @babel -exec rm -rf {} + \
  && find @babel -mindepth 1 -maxdepth 1 ! -name runtime -exec rm -rf {} + \
  && find meteor/ddp-server/node_modules/uWebSockets.js -name 'uws_*.node' ! -name 'uws_linux_x64_*' -delete

# --- Run ----------------------------------------------------------------------
FROM node:24.15.0-bookworm-slim

COPY --from=build --chown=node /home/mt/dist/bundle /home/node/bundle
USER node
WORKDIR /home/node/bundle/programs/server
RUN npm install --omit=dev
WORKDIR /home/node/bundle

# The version the app records (imports/constants/VERSION.js); without git
# history in the image it falls back to GIT_VERSION_FAIL. Build with
# --build-arg CONTAINER_VERSION=$(git rev-parse --short HEAD)
ARG CONTAINER_VERSION
ENV CONTAINER_VERSION=${CONTAINER_VERSION}

# Configure with ROOT_URL, MONGO_URL, PORT, MAIL_URL and METEOR_SETTINGS
# (see docker-compose.yml and the README)
EXPOSE 3000
ENTRYPOINT ["node", "main.js"]
