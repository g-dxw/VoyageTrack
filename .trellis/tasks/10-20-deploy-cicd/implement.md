# Implementation Plan

## 1. Prepare the development branch

- Move local `dev` from stale `628f6ae8` to the approved current
  `dev_0.0.1` tip, then switch to `dev`.
- Keep `dev_0.0.1` and `codex/pre-merge-upstream-dev-2026-10-20` as recovery
  references during rollout.
- Set task metadata to branch `dev`, base branch `main`.

## 2. Implement repository CI/CD

- Read the Trellis before-development context and relevant security specs.
- Update the main-source guard to accept only `dev`.
- Make Go/plugin and Web checks unconditional for PRs targeting `dev`/`main`.
- Add the production Buildx/GHCR/deploy workflow with concurrency and immutable
  SHA tagging.
- Remove obsolete upstream release/dev workflows that contradict the branch
  model or publish to namespaces this fork does not own.
- Add production Compose, Nginx template, restricted-key wrapper, deploy/rollback
  script, and operator documentation under `deploy/`.
- Keep every secret value out of the repository and scan the diff before push.

## 3. Validate locally before publication

- Parse all workflow YAML and run `actionlint` if available.
- Run shell syntax checks and focused deploy-script tests using temporary fake
  commands/directories; assert SHA validation and rollback selection.
- Run `docker compose config` with placeholder environment values; verify both
  services resolve the same proxy secret and SHA tag.
- Run repository quality gates proportionate to the workflow edits:
  `gofmt`/vet/tests, plugin tests/build, Svelte check/tests/build, docs build,
  and diff/secret scans.
- Perform a full Trellis quality review and fix all actionable findings.

## 4. Prepare cqaiclubOnline safely

- Recheck disk, memory, containers, listeners, Nginx, and existing endpoint
  health immediately before changes.
- Create `/srv/apps/voyagetrack` data/backups layout and a root-readable `.env`
  with newly generated secrets; do not display values.
- Install reviewed Compose/deploy/Nginx files with root ownership.
- Create the restricted deployment account, wrapper, and sudo rule.
- Generate/upload a dedicated deploy key, set GitHub secrets, verify the forced
  command, then securely remove the local private key.
- Run `nginx -t` before enabling/reloading the site.

## 5. Publish `dev` and establish protection

- Commit task changes on `dev` and push `dev` to origin.
- Open `dev` → `main` PR and observe the actual check-run names/conclusions.
- Configure `main` branch protection with those exact required checks.
- Prove a non-`dev` head fails the source-policy check without merging it.
- Merge only the approved `dev` PR after all required checks are green.

## 6. Follow production release to completion

- Watch the main deployment workflow through image build, GHCR publication,
  restricted SSH deployment, and health verification.
- If GHCR defaults private, set the two linked packages public before the deploy
  job pulls them; do not add a long-lived package token to the server.
- Verify server `.release`, exact container image tags/digests, volumes,
  healthchecks, host-local web/DB endpoints, logs, and backup presence.
- Verify existing Xianyu containers and group-buy service remain healthy.
- Restore or verify `gdxw.dpdns.org` DNS/HTTPS; if credentials are unavailable,
  capture host-local/Host-header proof and request only the missing DNS action.

## 7. Rollback rehearsal and final governance proof

- Invoke the deploy wrapper with an invalid SHA/tag and confirm it fails safely
  or rolls back without corrupting the current release.
- Re-verify the live release after the rehearsal.
- Query GitHub branch protection and repository branches to prove main policy.
- Confirm the working tree is clean, Actions are complete, no secrets were
  printed/committed, and no production build toolchain was used.
- Update Trellis specs if new deployment contracts were learned, commit the
  work, archive the task, and record the session journal.

## Rollback Points

- Git: recovery branches retain the pre-CI/CD state; revert the PR if needed.
- GitHub: save the previous branch-protection JSON before applying the new rule.
- Server: keep the prior `.release`, Compose configuration backup, Nginx config
  backup, and timestamped PocketBase backup.
- Deployment: immutable image tags permit returning to the previous SHA without
  recompilation.
