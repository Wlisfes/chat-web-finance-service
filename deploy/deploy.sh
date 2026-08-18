#!/bin/sh
set -eu

IMAGE=${1:?Usage: deploy.sh IMAGE [COMPOSE_FILE]}
COMPOSE_FILE=${2:-compose.yml}
SERVICE=finance-service
CONTAINER=chat-web-finance-service
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-180}
PULL_ATTEMPTS=${PULL_ATTEMPTS:-8}

test -f "$COMPOSE_FILE"
test -f .env
old_image=$(docker inspect --format '{{.Config.Image}}' "$CONTAINER" 2>/dev/null || true)

compose() {
    IMAGE="$IMAGE" docker compose -f "$COMPOSE_FILE" "$@"
}

rollback() {
    docker logs --tail 100 "$CONTAINER" 2>&1 || true
    if [ -n "$old_image" ] && [ "$old_image" != "$IMAGE" ]; then
        IMAGE="$old_image" docker compose -f "$COMPOSE_FILE" up -d --no-deps "$SERVICE"
    fi
}

attempt=1
until docker pull "$IMAGE"; do
    [ "$attempt" -lt "$PULL_ATTEMPTS" ] || exit 1
    sleep $((attempt * 5))
    attempt=$((attempt + 1))
done

network=$(sed -n 's/^DOCKER_NETWORK=//p' .env | tail -n 1)
network=${network:-chat-web-infrastructure}

docker run --rm --network "$network" --env-file .env --entrypoint node "$IMAGE" dist/cli/apply-schema.js

if ! compose up -d --no-deps "$SERVICE"; then
    rollback
    exit 1
fi

elapsed=0
while [ "$elapsed" -lt "$HEALTH_TIMEOUT" ]; do
    state=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$CONTAINER" 2>/dev/null || true)
    case "$state" in
        healthy)
            echo "Deployment succeeded: $IMAGE"
            exit 0
            ;;
        exited|dead|unhealthy)
            rollback
            exit 1
            ;;
    esac
    sleep 3
    elapsed=$((elapsed + 3))
done

rollback
exit 1
