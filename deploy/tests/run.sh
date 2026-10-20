#!/usr/bin/env bash

set -euo pipefail

REPOSITORY_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
readonly REPOSITORY_ROOT
readonly INITIAL_SHA=1111111111111111111111111111111111111111
readonly FAILED_SHA=2222222222222222222222222222222222222222
readonly FIRST_FAILED_SHA=3333333333333333333333333333333333333333
readonly MISMATCH_SHA=4444444444444444444444444444444444444444
readonly STOP_FAILED_SHA=5555555555555555555555555555555555555555
readonly UPGRADED_SHA=6666666666666666666666666666666666666666

docker run --rm \
  --env "INITIAL_SHA=$INITIAL_SHA" \
  --env "FAILED_SHA=$FAILED_SHA" \
  --env "FIRST_FAILED_SHA=$FIRST_FAILED_SHA" \
  --env "MISMATCH_SHA=$MISMATCH_SHA" \
  --env "STOP_FAILED_SHA=$STOP_FAILED_SHA" \
  --env "UPGRADED_SHA=$UPGRADED_SHA" \
  --volume "$REPOSITORY_ROOT/deploy:/source:ro" \
  ubuntu:24.04@sha256:68ee22004a9109b44973313b02ff7b1de250f1de0f5ecb628d73f579aaff33ac \
  bash -euo pipefail -c '
    install -d -m 0755 /test-bin /srv/apps/voyagetrack
    install -m 0755 /source/tests/fake-docker /test-bin/docker
    install -m 0755 /source/tests/fake-curl /test-bin/curl
    install -m 0755 /source/tests/fake-sudo /usr/bin/sudo
    install -m 0755 /source/tests/fake-deploy /usr/local/sbin/voyagetrack-deploy
    install -m 0644 /source/compose.yml /srv/apps/voyagetrack/compose.yml

    umask 077
    {
      printf "ORIGIN=https://example.test\n"
      printf "MEILI_MASTER_KEY=ci-only-meili-key-0123456789abcdef0123456789abcdef\n"
      printf "POCKETBASE_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef\n"
      printf "POCKETBASE_PROXY_SECRET=ci-only-proxy-key-0123456789abcdef0123456789abcdef\n"
    } > /srv/apps/voyagetrack/.env

    install -d /tmp/voyagetrack-outside-backups
    ln -s /tmp/voyagetrack-outside-backups /srv/apps/voyagetrack/backups
    set +e
    PATH="/test-bin:$PATH" /source/voyagetrack-deploy "$INITIAL_SHA"
    result=$?
    set -e
    [[ $result -ne 0 ]]
    [[ -z "$(find /tmp/voyagetrack-outside-backups -mindepth 1 -print -quit)" ]]
    rm /srv/apps/voyagetrack/backups

    for rejected_command in \
      "" \
      "deploy" \
      "deploy not-a-sha" \
      "rollback $INITIAL_SHA" \
      "deploy $INITIAL_SHA extra"; do
      set +e
      SSH_ORIGINAL_COMMAND="$rejected_command" /source/voyagetrack-deploy-key >/dev/null 2>&1
      result=$?
      set -e
      [[ $result -eq 64 ]]
    done
    SSH_ORIGINAL_COMMAND="deploy $INITIAL_SHA" /source/voyagetrack-deploy-key
    mapfile -t sudo_arguments < /tmp/voyagetrack-fake-sudo-arguments
    [[ ${#sudo_arguments[@]} -eq 3 ]]
    [[ "${sudo_arguments[0]}" == "-n" ]]
    [[ "${sudo_arguments[1]}" == "/usr/local/sbin/voyagetrack-deploy" ]]
    [[ "${sudo_arguments[2]}" == "$INITIAL_SHA" ]]
    /source/voyagetrack-rollback "$INITIAL_SHA"
    mapfile -t deploy_arguments < /tmp/voyagetrack-fake-deploy-arguments
    [[ ${#deploy_arguments[@]} -eq 2 ]]
    [[ "${deploy_arguments[0]}" == "--restore" ]]
    [[ "${deploy_arguments[1]}" == "$INITIAL_SHA" ]]

    install -d /srv/apps/voyagetrack/data/pb_data
    printf "preexisting-data\n" > /srv/apps/voyagetrack/data/pb_data/state.txt
    set +e
    PATH="/test-bin:$PATH" \
      MISMATCH_IMAGE_TAG="sha-$MISMATCH_SHA" \
      /source/voyagetrack-deploy "$MISMATCH_SHA"
    result=$?
    set -e

    [[ $result -ne 0 ]]
    [[ ! -e /srv/apps/voyagetrack/.release ]]
    ! grep -q "^IMAGE_TAG=" /srv/apps/voyagetrack/.env
    grep -qx "preexisting-data" /srv/apps/voyagetrack/data/pb_data/state.txt
    [[ -z "$(find /srv/apps/voyagetrack/backups -type f -name "pb_data-*.tar.gz" -print -quit)" ]]

    set +e
    PATH="/test-bin:$PATH" \
      FAIL_IMAGE_TAG="sha-$FIRST_FAILED_SHA" \
      /source/voyagetrack-deploy "$FIRST_FAILED_SHA"
    result=$?
    set -e

    [[ $result -ne 0 ]]
    [[ ! -e /srv/apps/voyagetrack/.release ]]
    ! grep -q "^IMAGE_TAG=" /srv/apps/voyagetrack/.env
    grep -qx "preexisting-data" /srv/apps/voyagetrack/data/pb_data/state.txt

    PATH="/test-bin:$PATH" /source/voyagetrack-deploy "$INITIAL_SHA"
    [[ "$(tr -d "\r\n" < /srv/apps/voyagetrack/.release)" == "$INITIAL_SHA" ]]
    grep -qx "IMAGE_TAG=sha-$INITIAL_SHA" /srv/apps/voyagetrack/.env

    printf "known-good-data\n" > /srv/apps/voyagetrack/data/pb_data/state.txt
    set +e
    PATH="/test-bin:$PATH" \
      FAIL_IMAGE_TAG="sha-$FAILED_SHA" \
      /source/voyagetrack-deploy "$FAILED_SHA"
    result=$?
    set -e

    [[ $result -ne 0 ]]
    [[ "$(tr -d "\r\n" < /srv/apps/voyagetrack/.release)" == "$INITIAL_SHA" ]]
    grep -qx "IMAGE_TAG=sha-$INITIAL_SHA" /srv/apps/voyagetrack/.env
    grep -qx "known-good-data" /srv/apps/voyagetrack/data/pb_data/state.txt
    find /srv/apps/voyagetrack/backups -maxdepth 1 -type f -name "pb_data-*.tar.gz" | grep -q .

    PATH="/test-bin:$PATH" /source/voyagetrack-deploy "$UPGRADED_SHA"
    [[ "$(tr -d "\r\n" < /srv/apps/voyagetrack/.release)" == "$UPGRADED_SHA" ]]
    printf "post-upgrade-data\n" > /srv/apps/voyagetrack/data/pb_data/state.txt

    PATH="/test-bin:$PATH" /source/voyagetrack-deploy --restore "$INITIAL_SHA"
    [[ "$(tr -d "\r\n" < /srv/apps/voyagetrack/.release)" == "$INITIAL_SHA" ]]
    grep -qx "IMAGE_TAG=sha-$INITIAL_SHA" /srv/apps/voyagetrack/.env
    grep -qx "known-good-data" /srv/apps/voyagetrack/data/pb_data/state.txt

    set +e
    PATH="/test-bin:$PATH" \
      FAIL_IMAGE_TAG="sha-$STOP_FAILED_SHA" \
      FAIL_STOP_IMAGE_TAG="sha-$STOP_FAILED_SHA" \
      /source/voyagetrack-deploy "$STOP_FAILED_SHA"
    result=$?
    set -e

    [[ $result -eq 2 ]]
    [[ "$(tr -d "\r\n" < /srv/apps/voyagetrack/.release)" == "$INITIAL_SHA" ]]
    grep -qx "IMAGE_TAG=sha-$STOP_FAILED_SHA" /srv/apps/voyagetrack/.env
    grep -qx "candidate-mutated-data" /srv/apps/voyagetrack/data/pb_data/state.txt
  '

printf 'deploy success and automatic rollback tests: ok\n'
