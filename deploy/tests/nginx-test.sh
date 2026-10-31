#!/usr/bin/env bash

set -euo pipefail

REPOSITORY_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
readonly REPOSITORY_ROOT
readonly NGINX_IMAGE=nginx:1.28-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236

CERTIFICATE_DIR=$(mktemp -d "$REPOSITORY_ROOT/deploy/.nginx-test.XXXXXX")
readonly CERTIFICATE_DIR

cleanup() {
  case "$CERTIFICATE_DIR" in
    "$REPOSITORY_ROOT"/deploy/.nginx-test.*)
      rm -rf -- "$CERTIFICATE_DIR"
      ;;
    *)
      echo "Refusing to clean unexpected certificate directory: $CERTIFICATE_DIR" >&2
      return 1
      ;;
  esac
}
trap cleanup EXIT

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$CERTIFICATE_DIR/privkey.pem" \
  -out "$CERTIFICATE_DIR/fullchain.pem" \
  -subj /CN=gdxw.dpdns.org -days 1 >/dev/null 2>&1

docker run --rm \
  --volume "$REPOSITORY_ROOT/deploy/nginx/gdxw.dpdns.org-http-bootstrap.conf:/etc/nginx/conf.d/default.conf:ro" \
  "$NGINX_IMAGE" \
  nginx -t

docker run --rm \
  --volume "$REPOSITORY_ROOT/deploy/nginx/gdxw.dpdns.org.conf:/etc/nginx/conf.d/default.conf:ro" \
  --volume "$CERTIFICATE_DIR:/etc/letsencrypt/live/gdxw.dpdns.org:ro" \
  "$NGINX_IMAGE" \
  nginx -t

docker run --rm \
  --volume "$REPOSITORY_ROOT/deploy/nginx/track.cqaiclub.online-http-bootstrap.conf:/etc/nginx/conf.d/default.conf:ro" \
  "$NGINX_IMAGE" \
  nginx -t

docker run --rm \
  --volume "$REPOSITORY_ROOT/deploy/nginx/track.cqaiclub.online.conf:/etc/nginx/conf.d/default.conf:ro" \
  --volume "$CERTIFICATE_DIR:/etc/letsencrypt/live/track.cqaiclub.online:ro" \
  "$NGINX_IMAGE" \
  nginx -t

printf 'Nginx templates: ok\n'
