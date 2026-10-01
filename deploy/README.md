# Running DiceCloud on your own server

`dicecloud.sh` runs DiceCloud in production on one Ubuntu Server machine, here a
laptop at home:

- the app, built from this repository's `Dockerfile`;
- MongoDB 8.0 as a replica set of one, so that Meteor keeps pages live with
  change streams rather than polling. Only the app's containers reach it;
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
   subdomain for `hemoreg.me` itself), service type **HTTP**, URL
   `dicecloud:3000`. Cloudflare creates the DNS record.

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
   - `MAIL_URL`: the SMTP server, see `.env.example`.
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

## 5. Moving the data from Atlas

Once the app runs, copy the Atlas database into it:

```sh
./dicecloud.sh import "mongodb+srv://<user>:<password>@<cluster>.mongodb.net/"
```

The URL is the `MONGO_URL` of the current deployment. When it names no
database, as here, the data is in `test`, MongoDB's default; another one can be
given after the URL. The current database is backed up first, and the app stops
during the copy: start it again with `./dicecloud.sh start`. Characters are
computed again as they are opened.

Then:

- **Google sign-in**: in Google Cloud's console, add
  `https://dicecloud.hemoreg.me/_oauth/google` to the OAuth client's
  authorized redirect URIs.
- **Emails**: the app sends from `no-reply@<the ROOT_URL host>`. In Brevo,
  authenticate that domain (Senders, domains and dedicated IPs > Domains), then
  add the records it gives in Cloudflare.
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
