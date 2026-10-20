#!/usr/bin/env bash

set -euo pipefail

REPOSITORY_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
readonly REPOSITORY_ROOT
readonly COMPOSE_FILE="$REPOSITORY_ROOT/deploy/compose.yml"
readonly TEST_TAG=sha-0000000000000000000000000000000000000000
readonly TEST_MEILI_KEY=ci-only-meili-key-0123456789abcdef0123456789abcdef
readonly TEST_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
readonly TEST_PROXY_KEY=ci-only-proxy-key-0123456789abcdef0123456789abcdef

if docker compose version >/dev/null 2>&1; then
  compose=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  compose=(docker-compose)
else
  echo "Docker Compose is required." >&2
  exit 1
fi

if env -u POCKETBASE_PROXY_SECRET \
  ORIGIN=https://example.test \
  MEILI_MASTER_KEY="$TEST_MEILI_KEY" \
  POCKETBASE_ENCRYPTION_KEY="$TEST_ENCRYPTION_KEY" \
  IMAGE_TAG="$TEST_TAG" \
  "${compose[@]}" --env-file /dev/null -f "$COMPOSE_FILE" config --quiet \
  >/dev/null 2>&1; then
  echo "Compose unexpectedly accepted a missing POCKETBASE_PROXY_SECRET." >&2
  exit 1
fi

env \
  ORIGIN=https://example.test \
  MEILI_MASTER_KEY="$TEST_MEILI_KEY" \
  POCKETBASE_ENCRYPTION_KEY="$TEST_ENCRYPTION_KEY" \
  POCKETBASE_PROXY_SECRET="$TEST_PROXY_KEY" \
  IMAGE_TAG="$TEST_TAG" \
  "${compose[@]}" --env-file /dev/null -f "$COMPOSE_FILE" config --quiet

env \
  ORIGIN=https://example.test \
  MEILI_MASTER_KEY="$TEST_MEILI_KEY" \
  POCKETBASE_ENCRYPTION_KEY="$TEST_ENCRYPTION_KEY" \
  POCKETBASE_PROXY_SECRET="$TEST_PROXY_KEY" \
  IMAGE_TAG="$TEST_TAG" \
  "${compose[@]}" --env-file /dev/null -f "$COMPOSE_FILE" config --format json |
  jq -e --arg expected_tag "$TEST_TAG" '
    .services.db.environment.POCKETBASE_PROXY_SECRET == .services.web.environment.POCKETBASE_PROXY_SECRET and
    .services.db.image == ("ghcr.io/g-dxw/voyagetrack-db:" + $expected_tag) and
    .services.web.image == ("ghcr.io/g-dxw/voyagetrack-web:" + $expected_tag) and
    .services.search.ports == null and
    (.services.db.ports[0].host_ip == "127.0.0.1") and
    (.services.web.ports[0].host_ip == "127.0.0.1")
  ' >/dev/null

printf 'production Compose contracts: ok\n'
