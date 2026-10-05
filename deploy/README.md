# Running DiceCloud on your own server

`dicecloud.sh` runs DiceCloud in production on one Ubuntu Server machine, here a
laptop at home:

- the app, built from this repository's `Dockerfile`;
- MongoDB 7.0 as a replica set of one, so that Meteor keeps pages live with
  change streams rather than polling. Only the app's containers reach it. Not
  8.x, which refuses recent Linux kernels (see `compose.yml`);
- a Cloudflare tunnel, which publishes the app at its address over HTTPS
  without opening any port on the router, even behind a shared or changing IP;
- a database backup every day, the last 7 days kept, optionally copied to an
  S3 bucket.

Everything restarts on its own when the machine boots.

## 1. The machine

- Ubuntu Server 22.04 or newer, on a wired connection if possible, with fibre:
  players download the app from it.
- In the Dell BIOS (F2 at start-up):
  - **Battery charge configuration: Primarily AC use**, or a custom 50-80 %
    range. A battery kept at 100 % around the clock can swell.
  - **AC behavior / Power on when AC is connected**, if the model has it, so
    that it starts again after a power cut.
- `dicecloud.sh install` stops the machine from sleeping, lid closed included.

## 2. The domain: Namecheap, with Cloudflare's DNS

The domain stays registered at Namecheap; Cloudflare only answers its DNS
queries, which the tunnel requires. Both are free.

1. Create a Cloudflare account, **Add a domain**: `hemoreg.me`, Free plan.
   Cloudflare copies the DNS records it finds: check the list against
   Namecheap's (Advanced DNS) before going on.
2. In Namecheap, **Domain List > hemoreg.me > Manage > Nameservers > Custom
   DNS**: the two nameservers Cloudflare gives. It takes from a few minutes to a
   few hours; Cloudflare emails once the domain is active.
3. From then on, DNS records are edited in Cloudflare, Brevo's included.

## 3. The tunnel

In Cloudflare: **Zero Trust > Networks > Tunnels > Create a tunnel >
Cloudflared**, name it `dicecloud`.

1. On the install step, choose Docker and copy the token: the long value after
   `--token` in the command shown. It goes in `CLOUDFLARE_TUNNEL_TOKEN`.
   Nothing else on that page needs running: the script starts the connector.
2. **Public hostname**: subdomain `dicecloud`, domain `hemoreg.me` (or no
   subdomain for `hemoreg.me` itself), service URL `http://dicecloud:3000`.
   Plain `http`: the tunnel already encrypts the way to Cloudflare, which
   gives visitors HTTPS; the app's container answers in plain HTTP. Cloudflare
   creates the DNS record.

## 4. Install and start

```sh
git clone <this repository> ~/DiceCloud
cd ~/DiceCloud/deploy
./dicecloud.sh install
```

`install` installs Docker, creates `.env` with new database passwords, and sets
up the daily backup. Then:

1. In `deploy/.env`:
   - `ROOT_URL`: the public address, `https://dicecloud.hemoreg.me`;
   - `CLOUDFLARE_TUNNEL_TOKEN`: the tunnel's token;
   - `MAIL_URL`: the SMTP server, see `.env.example`;
   - `MAIL_FROM`: the sender, on the domain authenticated with the SMTP
2. Copy the settings file from your computer:
   `scp app/settings.production.json <user>@<server>:~/DiceCloud/app/`.
   Its `galaxy.meteor.com` section is ignored here: `MAIL_URL` comes from
   `.env`.
3. `./dicecloud.sh start`. The first build takes 10 to 20 minutes; later ones
   reuse what has not changed.

Until the tunnel runs, the app answers on the server itself:
`curl -I http://localhost:3000`.

Keep `.env` safe, and a copy of it somewhere else: the database was created
with its passwords, and a restore on a new machine needs them.

## 5. Administrator and libraries

The database starts empty. Once the app runs:

1. Create your account on the site, then make it an administrator:
   `./dicecloud.sh admin <username>`.
2. Copy the library import tools to the server. They are kept out of git, in
   `tools/libraryImport`; only these are needed:

   ```sh
   cd tools/libraryImport
   tar -czf - import.js createCollection.js lib.js data | ssh <user>@<server> 'mkdir -p ~/libraryImport && tar -C ~/libraryImport -xzf -'
   ```

3. Import them, owned by your account:
   `./dicecloud.sh libraries ~/libraryImport <username>`. Every snapshot in
   `data/*.gz` is imported, then each `data/manifest*.json` becomes a library
   collection. It takes a few minutes; the database is backed up first.
   Libraries already there are skipped, so it can be run again.

4. Subscribe new accounts to the rulesets, so that they can build a
   character at once: in `.env`, set `DEFAULT_LIBRARY_COLLECTIONS` to the
   ids of the collections, comma-separated (a collection's page,
   `/library-collection/<id>`, gives its id: for the Libraries of Vexus,
   its English and French collections), then `./dicecloud.sh start`.
   Only accounts created afterwards are subscribed; `DEFAULT_LIBRARIES` does
   the same for single libraries.

To bring a whole database from another MongoDB instead, such as Atlas:
`./dicecloud.sh import "<its URL>"`. It replaces the current database (backed
up first); when the URL names no database, the data is in `test`, MongoDB's
default. The app stops during the copy: start it again with
`./dicecloud.sh start`.

Then:

- **Google sign-in**: in Google Cloud's console, add
  `https://dicecloud.hemoreg.me/_oauth/google` to the OAuth client's
  authorized redirect URIs.
- **Emails**: in Brevo, authenticate the domain of `MAIL_FROM` (Senders,
  domains and dedicated IPs > Domains), then add the records it gives in
  Cloudflare, its DKIM records as **DNS only**: proxied, they hide the keys
  that receiving servers check signatures with.
- Once everything works, stop Galaxy and the Atlas cluster.

## 6. Backups

Every day at 03:30 (`BACKUP_TIME`), a systemd timer runs
`./dicecloud.sh backup`: the whole database in one compressed file,
`BACKUP_DIR/dicecloud-<date>_<time>.archive.gz`. Backups older than 7 days
(`BACKUP_KEEP_DAYS`) are removed, but never one of the 7 latest: after a week
switched off, the last ones are still there. A backup missed while the machine
was off runs when it starts again.

- `./dicecloud.sh status`: the backups and the next run; it warns when the
  latest is more than 36 hours old.
- `./dicecloud.sh backup`: one more, now.
- `journalctl -u dicecloud-backup`: the backup log.
- `./dicecloud.sh restore /srv/dicecloud/backups/dicecloud-<date>.archive.gz`:
  replaces the database with that backup, after backing the current one up.

A disk failure, a theft or a fire takes the backups along with the machine. To
keep a copy elsewhere, fill in the `BACKUP_S3_*` values: after each backup, the
bucket gets the same files under `BACKUP_S3_PREFIX`, old ones removed there
too. An AWS key limited to that prefix is best.

## 7. Day to day

- `./dicecloud.sh update`: pulls the code, backs up, rebuilds and restarts.
  The previous image is kept.
- `./dicecloud.sh logs` (or `logs mongo`, `logs cloudflared`): follows a log.
- `./dicecloud.sh stop`, then `start`.

The containers restart on their own after a crash or a reboot. Ubuntu installs
its security updates itself; a kernel update needs a reboot now and then
(`sudo reboot`), after which everything starts again.
