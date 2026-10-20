# Deployment Baseline (2026-10-20)

## GitHub

- Repository: `g-dxw/VoyageTrack` (public, admin access), default `main`.
- `main`: `628f6ae8dddc1261995990f33543ad1500b71c43`.
- `dev`: absent on the remote; the local stale `dev` pointer is at the same
  commit as `main`.
- `dev_0.0.1`: remote `4a4d8f49711868d7b96917322cb05bdd6333428c`;
  approved local tip `c726d851c5bee4c7b0cf6f8d88c1a5a8bfeccef7`.
- `main` is unprotected. Actions are enabled; no repository Actions secrets or
  variables exist.
- Existing workflows `guard_main.yaml`, `release.yaml`, `release_dev.yaml`, and
  `release_request.yaml` implement an upstream `release/v*` model and publish to
  upstream-owned registry namespaces.

## cqaiclubOnline

- SSH alias works non-interactively as Ubuntu user `ubuntu`; passwordless sudo
  is available.
- Ubuntu 22.04.5, x86_64, Docker 29.1.3, Compose 2.40.3.
- Root disk: 40 GiB total, about 22 GiB available at inspection.
- Memory: 3.6 GiB total, about 2.1 GiB available; no swap.
- Existing listeners include loopback `3001`, `8089`, and `18080`; ports
  `13000` and `18090` were free.
- Existing containers are the five `xianyu-online-*` services. Nginx also
  proxies `sam.cqaiclub.online` to loopback `3001`.
- Existing application roots: `/srv/apps/sam-group-buy` and
  `/srv/apps/xianyu-auto-reply`; no VoyageTrack directory exists.
- Docker images use about 10.68 GiB, with 7.16 GiB reported reclaimable. Do not
  perform broad pruning because existing projects may rely on stopped images.

## Public origin

- Repository configuration identifies `https://gdxw.dpdns.org` as `ORIGIN`.
- The hostname resolves to Cloudflare proxy IPs and returned HTTP 530 at
  inspection time.
- No local Cloudflare/DPDNS API credential or `cloudflared` configuration was
  discovered. Public DNS repair may require user-provided domain access.
