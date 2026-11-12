# AWS EC2 runbook: SSH, updates and clean-up

How to connect to the AWS sandbox server, update it to the latest `main`, free disk space safely, and handle the
problems that come up. The server runs **the API only** (PostgreSQL, the API and Caddy). The React app is on Vercel,
which passes `/api/*` to this server (`frontend/vercel.json`).

> Never commit the `.pem` key or the server's `.env`. Database backups contain learners' personal data (RA 10173):
> keep them on the server or on an encrypted, access-limited drive, never in the repository or a shared folder.

## Quick facts

| Item             | Value                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------- |
| Server           | EC2 in `ap-southeast-1` (Singapore), Ubuntu 24.04, 2 vCPU, 7.6 GiB RAM, 96 GB disk      |
| Public IP        | `54.251.42.9`                                                                           |
| SSH user / key   | `ubuntu` / `tesda-track-rnd-key-pair.pem` (ask the team lead; never share it in chat)   |
| API address      | `https://54-251-42-9.sslip.io` (HTTPS from Let's Encrypt via Caddy)                     |
| Health check     | `https://54-251-42-9.sslip.io/api/v1/ready`                                             |
| Frontend         | `https://tesda-track.vercel.app` (Vercel redeploys by itself on every push to `main`)   |
| Project folder   | `~/TESDA-TRACK` (a clone of `github.com/monqzxc/TESDA-TRACK`; run `ls ~` if it differs) |
| Compose setup    | `.env` contains `COMPOSE_FILE=docker-compose.yml:docker-compose.api.yml`                |
| Matching model   | `backend/models/tesda-e5-small-v3` (git-ignored; must be on the server before a build)  |
| Hugging Face CLI | `~/hf/bin/hf` (a small virtualenv; see [Scenario D](#d-switch-the-matching-model))      |

Because of the `COMPOSE_FILE` line, a plain `docker compose ...` in the project folder always means the API-only
stack. Streamlit and the React container are not started here.

---

## 1. Connect over SSH

### 1.1 One-time: lock down the key file

SSH refuses a key that other users can read.

**Windows (PowerShell):** grant by your SID, not by name. On a PC whose computer name equals the user name,
`/grant "$env:USERNAME:R"` grants the _computer_ account and locks you out ("Load key: Permission denied").

```powershell
$key = "$HOME\Downloads\tesda-track-rnd-key-pair.pem"
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
icacls $key /reset
icacls $key /inheritance:r /grant:r "*${sid}:R"
```

**macOS / Linux:**

```bash
chmod 400 ~/Downloads/tesda-track-rnd-key-pair.pem
```

### 1.2 Connect

```powershell
ssh -i "$HOME\Downloads\tesda-track-rnd-key-pair.pem" ubuntu@54.251.42.9
```

Optional shortcut: add this to `~/.ssh/config` (Windows: `C:\Users\<you>\.ssh\config`), then connect with
`ssh tesda-aws` and copy files with `scp tesda-aws:...`.

```
Host tesda-aws
    HostName 54.251.42.9
    User ubuntu
    IdentityFile ~/Downloads/tesda-track-rnd-key-pair.pem
    ServerAliveInterval 30
```

### 1.3 "Connection timed out" on port 22

If `ssh` times out but `https://54-251-42-9.sslip.io/api/v1/ready` answers, the server is fine: the security group
only allows SSH from one IP address, and your public IP has changed (it can change during the day).

1. Find your current IP: open `https://checkip.amazonaws.com`, or in PowerShell
   `(Invoke-RestMethod https://checkip.amazonaws.com).Trim()`.
2. AWS Console → **EC2** → **Instances** → the instance → **Security** tab → click the security group.
3. **Edit inbound rules** → the **SSH (22)** rule → Source **My IP** → **Save rules**.

Never set the SSH source to `0.0.0.0/0`. Ports 80 and 443 must stay open to everyone: Vercel and partners reach the
API through them, and Caddy uses them to renew the certificate.

### 1.4 Run long jobs inside tmux

A build can take many minutes. If SSH drops while `docker compose up --build` runs in the plain shell, the build is
cancelled. Start or reattach a tmux session first:

```bash
tmux new -A -s deploy        # same command reattaches after a dropped connection
```

Detach without stopping anything: `Ctrl+B`, then `D`. (`sudo apt install -y tmux` if it is missing.)

---

## 2. Standard update: deploy the latest `main`

Use this for every normal release. Each step is safe to repeat.

```bash
ssh tesda-aws
tmux new -A -s deploy
cd ~/TESDA-TRACK
```

**Step 1. See what is about to change.**

```bash
git branch --show-current               # should print: main
git status --short                      # should print nothing (.env and backend/models/ are git-ignored)
git fetch origin
git log --oneline HEAD..origin/main     # the commits you are about to deploy
git diff --stat HEAD..origin/main -- backend/migrations deploy docker-compose.yml docker-compose.api.yml .env.example
```

- Files under `backend/migrations/` → the release changes the database: follow [Scenario B](#b-the-update-adds-a-database-migration) as well.
- `deploy/Caddyfile.api` changed → also do the Caddy step in [Scenario C](#c-only-env-or-the-caddyfile-changed).
- `.env.example` changed → compare it with the server's `.env`; a new required setting may need a value.

**Step 2. Back up the database.**

```bash
mkdir -p ~/backups
docker compose exec -T -u postgres db pg_dump -Fc -d tesda_track > ~/backups/tesda_track-$(date +%F-%H%M).dump
ls -lh ~/backups | tail -3              # the new file should not be 0 bytes
```

**Step 3. Remember the current version, for a quick rollback.**

```bash
git rev-parse --short HEAD > ~/backups/last-good-commit
docker tag tesda-track-backend:latest tesda-track-backend:rollback
```

**Step 4. Pull the code.**

```bash
git pull --ff-only origin main
```

If it says "Not possible to fast-forward", someone edited or committed on the server. Run `git status` and
`git log --oneline origin/main..HEAD`, copy anything worth keeping, then `git reset --hard origin/main`
(this discards those server-side edits; `.env` and `backend/models/` are not touched).

**Step 5. Check the model folder is there** (the build fails without it):

```bash
ls backend/models/tesda-e5-small-v3/onnx/model.onnx
```

If it is missing, download it ([Scenario D](#d-switch-the-matching-model) shows how) before building.

**Step 6. Build and restart.**

```bash
docker compose up -d --build
```

Compose builds the new image first while the old containers keep serving, then runs the `migrate` job (migrations,
seed, embedding sync) and replaces the API. Expect a short gap while the API starts; a build failure leaves the old
containers running.

**Step 7. Watch it come up.**

```bash
docker compose ps -a                    # migrate: Exited (0); db, api: healthy; caddy: Up
docker compose logs --tail=50 migrate
docker compose logs --tail=50 api
```

**Step 8. Verify** (see [section 3](#3-check-that-the-server-is-healthy)), then tidy up:

```bash
docker image prune -f                   # removes the untagged images the rebuild left behind
```

Leave tmux with `exit` (or detach with `Ctrl+B`, `D`).

> Vercel redeploys the frontend as soon as `main` is pushed; this server only changes when someone runs the steps
> above. Update the server soon after a merge that touches `backend/`, or the new frontend may call endpoints the
> old API doesn't have yet.

---

## 3. Check that the server is healthy

Run this **on the server** (it avoids office firewalls that intercept HTTPS):

```bash
curl -s https://54-251-42-9.sslip.io/api/v1/ready | python3 -m json.tool
```

A healthy server shows:

- `database`, `migrations`, `postgis`, `pgvector` and `model`: `"status": "ok"`
- `skills_bridge`: `"degraded"` with reason `not_probed` (the readiness check never calls Skills Bridge)
- overall `"status": "degraded"`, which is **normal** because of the Skills Bridge line above

Problems:

| What you see                             | Meaning                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| Overall `"unavailable"` (HTTP 503)       | A required check failed: database, migrations, PostGIS or pgvector |
| `migrations` reason `schema_not_current` | The migrate job did not finish; read `docker compose logs migrate` |
| `model` reason `not_loaded`              | Matching fell back to keywords; read `docker compose logs api`     |
| `curl` hangs or "connection refused"     | Caddy or the API is down; `docker compose ps -a`                   |

Then check through Vercel from your own browser: `https://tesda-track.vercel.app/api/v1/ready` should show the same
result, and the app should load and return recommendations.

---

## 4. Free disk space: pruning images safely

Every rebuild leaves the previous image behind, and Docker keeps a build cache. Check first:

```bash
df -h /                     # keep "Use%" under about 80%
docker system df            # images, containers, volumes, build cache
```

### 4.1 Safe routine (after every successful update)

```bash
docker image prune -f                          # untagged "<none>" images from rebuilds
docker builder prune -f --filter until=168h    # build cache older than 7 days
```

Neither touches running containers, the `:rollback` image, or any data.

### 4.2 Deeper clean (when the disk is tight)

```bash
docker container prune -f                      # stopped containers; migrate is recreated on the next deploy
docker image prune -a -f --filter until=168h   # ALSO removes unused tagged images built over 7 days ago (can include :rollback)
docker builder prune -a -f                     # ALL build cache: the next build reinstalls Python packages (slow)
```

Only do this once you're happy with the current release, because the rollback image may go too.

Other space that builds up:

```bash
sudo journalctl --disk-usage
sudo journalctl --vacuum-size=200M             # system logs
sudo apt-get clean && sudo apt-get autoremove -y
ls -lh ~/backups                               # old database dumps (see Scenario L for keeping the newest 7)
sudo sh -c 'du -ch /var/lib/docker/containers/*/*-json.log | tail -1'   # container logs
```

### 4.3 Never run these

| Command                                                   | What it destroys                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `docker compose down -v`                                  | The `pgdata` volume (every account, journey and registry import) and `caddy_data` |
| `docker system prune --volumes`, `docker volume prune -a` | Same, for any volume not attached to a running container                          |
| `docker volume rm tesda-track_pgdata`                     | The whole database                                                                |
| `docker system prune -a` while the stack is stopped       | Every image, including the API: the next start needs a full rebuild               |

Losing `caddy_data` also forces a new HTTPS certificate, and Let's Encrypt limits how many duplicate certificates it
issues per week. If you need the stack off, use `docker compose stop` (keeps everything) and `docker compose up -d`
to bring it back.

### 4.4 One-time: cap container log size

Docker's default log driver never rotates, so a busy API's log can grow until the disk fills. To cap each container at
30 MB (3 × 10 MB):

```bash
cat /etc/docker/daemon.json 2>/dev/null        # if it exists, add the keys below to it instead of overwriting
echo '{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" } }' | sudo tee /etc/docker/daemon.json
sudo systemctl restart docker                  # restarts every container: a short outage
cd ~/TESDA-TRACK && docker compose up -d --force-recreate   # the limit applies only to recreated containers
```

---

## 5. Scenarios

| #   | Situation                                                                           |
| --- | ----------------------------------------------------------------------------------- |
| A   | [Normal code update](#a-normal-code-update)                                         |
| B   | [The update adds a database migration](#b-the-update-adds-a-database-migration)     |
| C   | [Only `.env` or the Caddyfile changed](#c-only-env-or-the-caddyfile-changed)        |
| D   | [Switch the matching model](#d-switch-the-matching-model)                           |
| E   | [Roll back a bad release](#e-roll-back-a-bad-release)                               |
| F   | [The build fails](#f-the-build-fails)                                               |
| G   | [Migrate failed or the API is unhealthy](#g-migrate-failed-or-the-api-is-unhealthy) |
| H   | [Disk full](#h-disk-full)                                                           |
| I   | [HTTPS or certificate errors](#i-https-or-certificate-errors)                       |
| J   | [The server's IP address changed](#j-the-servers-ip-address-changed)                |
| K   | [OS updates and reboots](#k-os-updates-and-reboots)                                 |
| L   | [Back up and restore the database](#l-back-up-and-restore-the-database)             |
| M   | [Create an admin account](#m-create-an-admin-account)                               |

### A. Normal code update

Follow [section 2](#2-standard-update-deploy-the-latest-main) end to end.

### B. The update adds a database migration

1. The backup in step 2 is **mandatory**. Copy it off the server too ([Scenario L](#l-back-up-and-restore-the-database)).
2. Deploy as usual. The `migrate` job applies the migration before the new API starts.
3. Confirm `checks.migrations.current` equals `checks.migrations.expected` in `/api/v1/ready`.

If it goes wrong, roll back by restoring that backup ([Scenario E](#e-roll-back-a-bad-release), case 2). Don't rely
on `alembic downgrade`: some revisions refuse to downgrade once accounts exist, and a successful downgrade drops
newer tables and columns (see [migration-rehearsal.md](migration-rehearsal.md)).

### C. Only `.env` or the Caddyfile changed

```bash
cd ~/TESDA-TRACK
nano .env
docker compose up -d                    # recreates only the containers whose settings changed
```

Exceptions:

- `EMBEDDING_MODEL`, `DOCKER_EMBEDDING_MODEL_PATH` and `SEMANTIC_SEARCH_ENABLED` are baked into the image: use
  `docker compose up -d --build`.
- `POSTGRES_PASSWORD` and `APP_DB_PASSWORD` are applied only when the database volume is first created. Changing them in
  `.env` alone locks the API out; change the role's password inside PostgreSQL first (README, "Database connection or
  password fails").
- `DOMAIN` changes the address Caddy serves and requests a certificate for; see [Scenario J](#j-the-servers-ip-address-changed).

After a pull that changed `deploy/Caddyfile.api`, recreate Caddy so it mounts the new file:

```bash
docker compose up -d --force-recreate caddy
docker compose logs --tail=30 caddy
```

### D. Switch the matching model

`tesda-e5-small-v3` is the accepted pilot model. Switch only after the team has accepted another one.

```bash
cd ~/TESDA-TRACK
# Install the Hugging Face CLI once, if ~/hf/bin/hf doesn't exist:
#   sudo apt install -y python3-venv && python3 -m venv ~/hf && ~/hf/bin/pip install -U huggingface_hub
~/hf/bin/hf download Nyanta19/tesda-e5-small-v4 --local-dir backend/models/tesda-e5-small-v4
ls backend/models/tesda-e5-small-v4/onnx/model.onnx    # must exist; calibration.json should be there too
nano .env
#   EMBEDDING_MODEL=tesda-track/tesda-e5-small-v4
#   DOCKER_EMBEDDING_MODEL_PATH=/app/finetuned/tesda-e5-small-v4
docker compose up -d --build
docker compose logs --tail=50 migrate   # the embedding sync re-embeds everything for the new model name
```

The first start after a switch takes longer because every row is re-embedded. To go back, restore the two `.env`
lines and run `docker compose up -d --build` again. Every folder in `backend/models/` is copied into the image, so
delete folders you no longer serve (keep v3 for rollback).

### E. Roll back a bad release

**Case 1: the release added no migration.** Use the image and commit saved in step 3:

```bash
cd ~/TESDA-TRACK
git checkout "$(cat ~/backups/last-good-commit)"      # detached HEAD on the previous version
docker tag tesda-track-backend:rollback tesda-track-backend:latest
docker compose up -d --no-build
```

If the `:rollback` image was pruned, use `docker compose up -d --build` instead of the last two lines.

**Case 2: the release added a migration.** The old code can't start on the newer schema, so restore the backup
taken before the update:

```bash
cd ~/TESDA-TRACK
git checkout "$(cat ~/backups/last-good-commit)"
docker tag tesda-track-backend:rollback tesda-track-backend:latest
# then follow "Restore" in Scenario L with the pre-update dump, ending with: docker compose up -d --no-build
```

Anything learners saved after that backup is lost; tell the team.

**Afterwards:** the server stays on the old commit until `main` is fixed. Revert the bad commit on GitHub
(`git revert`, push to `main`), which also redeploys Vercel. For an immediate frontend rollback, use the Vercel
dashboard → **Deployments** → the previous deployment → **Instant Rollback**. When `main` is good again:

```bash
git checkout main && git pull --ff-only origin main && docker compose up -d --build
```

### F. The build fails

The old containers keep running, so nothing is down yet. Read the error at the end of the build output:

| Error                                                     | Fix                                                                                 |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `No fine-tuned model at /app/finetuned/tesda-e5-small-v3` | Download the model ([Scenario D](#d-switch-the-matching-model), with `v3`), rebuild |
| `no space left on device`                                 | [Section 4](#4-free-disk-space-pruning-images-safely), then rebuild                 |
| pip or download timeouts                                  | Run `docker compose up -d --build` again; finished layers are cached                |
| `Killed` or exit code 137                                 | Out of memory: check `free -h` and stop anything else running, then rebuild         |

### G. Migrate failed or the API is unhealthy

```bash
docker compose ps -a
docker compose logs --tail=100 migrate api db caddy
```

- **migrate `Exited (1)`:** the new API won't start until it succeeds. The log says whether a migration, the seed or
  the embedding sync failed (a failed sync only prints a warning and doesn't stop the deploy). Fix the cause, then
  `docker compose up -d`. If you can't fix it quickly, [roll back](#e-roll-back-a-bad-release).
- **api `unhealthy` or restarting:** read its log. A database error usually means `db` is down or the disk is full.
- **db `unhealthy`:** `docker compose logs db`; check `df -h /` first.
- To restart a single service: `docker compose restart api` (or `db`, `caddy`).

### H. Disk full

Symptoms: builds fail with "no space left on device", the database refuses writes, containers restart.

```bash
df -h /
docker system df
```

Work through [section 4](#4-free-disk-space-pruning-images-safely) in order: 4.1, then the log and backup clean-up
in 4.2, then the deeper image and cache prune. Then add the log cap in 4.4 so it doesn't recur.

### I. HTTPS or certificate errors

- **"Certificate not trusted" only from your office PC:** some networks (for example a FortiGate with SSL
  inspection) replace the certificate for sites like sslip.io. Test from a phone on mobile data, or with `curl` on the
  server. That error is not the server.
- **Caddy can't get or renew a certificate:** `docker compose logs caddy | grep -iE 'error|certificate'`. Check that
  ports 80 and 443 are open to `0.0.0.0/0` in the security group, and that the name points at the server:
  `getent hosts 54-251-42-9.sslip.io` should print the server's current public IP.

### J. The server's IP address changed

A **reboot** keeps the public IP. **Stop then Start** gives the instance a new one, unless an Elastic IP is attached
(check EC2 → **Elastic IPs**). If the IP changed:

1. Update `HostName` in your `~/.ssh/config` (and the ssh command you use).
2. On the server, in `.env`: `DOMAIN=<new-ip-with-dashes>.sslip.io` (and `PUBLIC_BASE_URL` if it is set), then
   `docker compose up -d`. Caddy requests a certificate for the new name.
3. In the repo, change the `/api/:path*` destination in `frontend/vercel.json` to the new address, commit and push to
   `main`. Vercel redeploys within minutes.
4. Tell partners using the MCP server (`https://<address>/mcp`) about the new address.

To avoid this, allocate an Elastic IP and associate it with the instance (check the sandbox's billing rules first),
then update the same places once.

### K. OS updates and reboots

Do this at a quiet time; upgrading Docker restarts all containers.

```bash
sudo apt update && sudo apt upgrade -y
[ -f /var/run/reboot-required ] && echo "Reboot needed"
sudo reboot
```

After reconnecting (about a minute):

```bash
cd ~/TESDA-TRACK
docker compose ps -a        # db, api and caddy come back by themselves (restart: unless-stopped)
```

Then check health ([section 3](#3-check-that-the-server-is-healthy)). `migrate` stays `Exited (0)` from the last
deploy; that is expected.

### L. Back up and restore the database

**Back up** (also step 2 of every update):

```bash
cd ~/TESDA-TRACK
mkdir -p ~/backups
docker compose exec -T -u postgres db pg_dump -Fc -d tesda_track > ~/backups/tesda_track-$(date +%F-%H%M).dump
docker compose exec -T -u postgres db pg_restore --list < ~/backups/<file>.dump | head   # readable? lists contents
```

Copy one off the server, from your PC:

```powershell
scp tesda-aws:~/backups/<file>.dump .
```

Keep the newest 7 dumps on the server:

```bash
ls -t ~/backups/*.dump | tail -n +8 | xargs -r rm
```

**Restore** (replaces the current database with the dump; everything written since the dump is lost). These are the
same steps `scripts/rehearse_migrations.py` tested: recreate the database owned by `tesda_track`, restore its search
path, and restore **with** the original owners (`--no-owner` would lock the app role out of its own tables).

```bash
cd ~/TESDA-TRACK
docker compose stop api
docker compose exec -T -u postgres db dropdb --force tesda_track
docker compose exec -T -u postgres db createdb -O tesda_track tesda_track
docker compose exec -T -u postgres db psql -v ON_ERROR_STOP=1 -d tesda_track \
  -c 'ALTER DATABASE tesda_track SET search_path = "$user", public, extensions'
docker compose exec -T -u postgres db pg_restore --exit-on-error -d tesda_track < ~/backups/<file>.dump
docker compose up -d                    # add --no-build when rolling back (Scenario E)
```

Then check health ([section 3](#3-check-that-the-server-is-healthy)).

### M. Create an admin account

The production seed creates no accounts. With the stack running:

```bash
cd ~/TESDA-TRACK
docker compose exec api python -m tesda_track.cli create-admin --email you@example.com --name "Your Name"
```

It prompts for the password twice (nothing is saved in shell history). Running it for an existing email promotes
that account. To load the real training-centre registry, see [registry-import.md](registry-import.md).

---

## 6. Monthly maintenance

- [ ] `df -h /` under about 80%; `docker system df` looks reasonable
- [ ] [Safe prune](#41-safe-routine-after-every-successful-update)
- [ ] OS updates and reboot if needed ([Scenario K](#k-os-updates-and-reboots))
- [ ] Refresh base images for security fixes (restarts the database briefly):
      `docker compose build --pull && docker compose pull caddy && docker compose up -d`
- [ ] A recent database dump exists and one copy is off the server
- [ ] The security group's SSH rule allows only the IPs that still need it

---

## 7. Cheat sheet

All from `~/TESDA-TRACK` on the server.

| Task                         | Command                                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Connect                      | `ssh tesda-aws` (or `ssh -i <key> ubuntu@54.251.42.9`)                                                           |
| Session that survives drops  | `tmux new -A -s deploy`                                                                                          |
| What's running               | `docker compose ps -a`                                                                                           |
| Follow API logs              | `docker compose logs -f --tail=100 api` (`Ctrl+C` to stop)                                                       |
| Restart one service          | `docker compose restart api`                                                                                     |
| Update to latest `main`      | [Section 2](#2-standard-update-deploy-the-latest-main) (backup, pull, `docker compose up -d --build`)            |
| Health                       | `curl -s https://54-251-42-9.sslip.io/api/v1/ready \| python3 -m json.tool`                                      |
| Disk use                     | `df -h / && docker system df`                                                                                    |
| Safe prune                   | `docker image prune -f && docker builder prune -f --filter until=168h`                                           |
| Database shell               | `docker compose exec -u postgres db psql -d tesda_track`                                                         |
| Backup                       | `docker compose exec -T -u postgres db pg_dump -Fc -d tesda_track > ~/backups/tesda_track-$(date +%F-%H%M).dump` |
| Stop everything (keeps data) | `docker compose stop`                                                                                            |
| Start everything             | `docker compose up -d`                                                                                           |
