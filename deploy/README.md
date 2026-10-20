# VoyageTrack production deployment

Production runs prebuilt `linux/amd64` images from GHCR. The server never
checks out source code and never runs Go, Node, TinyGo, or `docker build`.
GitHub Actions also mirrors the pinned Meilisearch runtime into the already
public database package as `voyagetrack-db:meilisearch-v1.36.0`, so production
does not depend on direct Docker Hub access.
Merging the repository's `dev` branch into `main` starts
`.github/workflows/deploy-production.yml`, which publishes immutable
`sha-<40-character-git-sha>` images and calls the restricted deploy command.

Protect `main` with strict required checks named `check-source`, `db-test`,
`deployment-contracts`, and `test`. Require pull requests and conversation
resolution, enforce the rule for administrators, and disable force pushes and
branch deletion. The `check-source` job accepts only the repository's own
`dev` branch as the pull-request head.

## Files installed on the server

Install the reviewed files with root ownership:

```text
/srv/apps/voyagetrack/compose.yml
/usr/local/sbin/voyagetrack-deploy
/usr/local/sbin/voyagetrack-deploy-key
/usr/local/sbin/voyagetrack-rollback
/etc/sudoers.d/voyagetrack-deploy
```

Runtime state stays outside the repository:

```text
/srv/apps/voyagetrack/.env       mode 0600
/srv/apps/voyagetrack/.release
/srv/apps/voyagetrack/data/
/srv/apps/voyagetrack/backups/
```

Create the directories and install the files:

```bash
sudo install -d -m 0750 /srv/apps/voyagetrack
sudo install -m 0644 deploy/compose.yml /srv/apps/voyagetrack/compose.yml
sudo install -m 0755 deploy/voyagetrack-deploy /usr/local/sbin/voyagetrack-deploy
sudo install -m 0755 deploy/voyagetrack-deploy-key /usr/local/sbin/voyagetrack-deploy-key
sudo install -m 0755 deploy/voyagetrack-rollback /usr/local/sbin/voyagetrack-rollback
sudo install -m 0440 deploy/sudoers/voyagetrack-deploy /etc/sudoers.d/voyagetrack-deploy
sudo visudo -cf /etc/sudoers.d/voyagetrack-deploy
```

## Create production secrets

Generate secrets on the server. The PocketBase encryption key must be exactly
32 characters; the other two secrets below are 64 characters. Do not copy
their values into GitHub or command output.

```bash
sudo bash -c '
set -euo pipefail
umask 077
meili_key=$(openssl rand -hex 32)
pocketbase_key=$(openssl rand -hex 16)
proxy_secret=$(openssl rand -hex 32)
{
  printf "ORIGIN=https://gdxw.dpdns.org\n"
  printf "MEILI_MASTER_KEY=%s\n" "$meili_key"
  printf "POCKETBASE_ENCRYPTION_KEY=%s\n" "$pocketbase_key"
  printf "POCKETBASE_PROXY_SECRET=%s\n" "$proxy_secret"
  printf "PUBLIC_DISABLE_SIGNUP=false\n"
} > /srv/apps/voyagetrack/.env
chown root:root /srv/apps/voyagetrack/.env
chmod 0600 /srv/apps/voyagetrack/.env
'
```

Optional runtime settings such as `PUBLIC_TIANDITU_KEY`, `UPLOAD_USER`, and
`UPLOAD_PASSWORD` can be added directly to the root-readable `.env`. Never
store that file in Git.

Validate without printing the resolved configuration, which contains secrets:

```bash
sudo env IMAGE_TAG=sha-0000000000000000000000000000000000000000 \
  docker compose \
  --project-name voyagetrack \
  --env-file /srv/apps/voyagetrack/.env \
  --file /srv/apps/voyagetrack/compose.yml \
  config --quiet
```

## Restricted deployment account

Create a non-login automation account and one-purpose Ed25519 key. Generate
the key outside the server; GitHub receives its private half and the server
receives only its public half.

```bash
sudo useradd --create-home --shell /bin/bash voyagetrack-deploy
sudo install -d -m 0700 -o voyagetrack-deploy -g voyagetrack-deploy \
  /home/voyagetrack-deploy/.ssh
sudo install -m 0600 -o voyagetrack-deploy -g voyagetrack-deploy \
  /dev/null /home/voyagetrack-deploy/.ssh/authorized_keys
```

Add exactly one line to `authorized_keys`, replacing only the public-key
placeholder:

```text
restrict,command="/usr/local/sbin/voyagetrack-deploy-key" ssh-ed25519 <PUBLIC_KEY> voyage-track-github-actions
```

The forced-command wrapper rejects everything except
`deploy <40-character-lowercase-git-sha>`. The sudo rule grants access only to
the root-owned deployment program, which independently validates its argument.

Configure these GitHub Actions secrets:

- `DEPLOY_HOST`: SSH hostname or IPv4 address.
- `DEPLOY_PORT`: numeric SSH port.
- `DEPLOY_USER`: `voyagetrack-deploy`.
- `DEPLOY_SSH_KEY`: private half of the dedicated key.
- `DEPLOY_KNOWN_HOSTS`: a separately verified pinned SSH host-key line.

Do not generate `DEPLOY_KNOWN_HOSTS` inside the workflow. Verify the host key
through an existing trusted administrative connection before storing it.

Both GHCR packages and the mirrored Meilisearch tag must be publicly readable. New GHCR packages may initially
be private even when their source repository is public. The deployment job
performs an anonymous manifest check before opening SSH; if the first publish
stops there, change both package visibilities to public and rerun the workflow.
The server intentionally has no long-lived GitHub package credential.

## Nginx and TLS

Only the web service is published through Nginx at `127.0.0.1:13000`.
PocketBase diagnostics stay on `127.0.0.1:18090`; Meilisearch has no host port.

Use `nginx/gdxw.dpdns.org-http-bootstrap.conf` only while obtaining the first
certificate. After the certificate exists, install
`nginx/gdxw.dpdns.org.conf`. Every change must pass `sudo nginx -t` before
reload. Do not enable the TLS file before its referenced certificate exists.

The public DNS record must point to the production origin. A successful
host-local check does not resolve an upstream Cloudflare 530 response.

## Manual deployment and rollback

An administrator can deploy any immutable commit that has already been built:

```bash
sudo /usr/local/sbin/voyagetrack-deploy <FULL_GIT_SHA>
```

The script validates configuration, pulls all images before stopping the
application, stops writers, archives PocketBase data, starts the candidate,
checks both image revision labels and both loopback endpoints. On failure it
restores the previous image tag and PocketBase backup automatically.

To deliberately roll back to the immediately previous release:

```bash
sudo /usr/local/sbin/voyagetrack-rollback <PREVIOUS_FULL_GIT_SHA>
```

The rollback command requires the backup whose metadata maps the active release
back to the requested SHA. It stops writers, archives the current database, and
restores that pre-upgrade PocketBase snapshot before starting the older image.
If the older image fails verification, the deploy script restores the current
release and its database again. It refuses an arbitrary older SHA without a
matching backup instead of running old code against a newer migrated database.

After either operation, verify the immutable release identity and health:

```bash
sudo cat /srv/apps/voyagetrack/.release
sudo docker compose \
  --project-name voyagetrack \
  --env-file /srv/apps/voyagetrack/.env \
  --file /srv/apps/voyagetrack/compose.yml \
  ps
curl --fail http://127.0.0.1:13000/
curl --fail http://127.0.0.1:18090/health
```

Do not run `docker compose config` without `--quiet` in shared logs because its
resolved output contains production secrets.
