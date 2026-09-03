#!/bin/sh
set -eu

IMAGE=${1:?Usage: deploy.sh IMAGE [COMPOSE_FILE]}
SERVICE_VERSION=${SERVICE_VERSION:-${IMAGE##*:}}
COMPOSE_FILE=${2:-compose.yml}
SERVICE=finance-service
CONTAINER=chat-web-finance-service
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-180}
PULL_ATTEMPTS=${PULL_ATTEMPTS:-8}

test -f "$COMPOSE_FILE"
test -f .env

temporary_env=$(mktemp .env.XXXXXX)
if ! awk '
    /^OTEL_/ { next }
    /^NODE_OPTIONS=.*@opentelemetry\/auto-instrumentations-node\/register/ { next }
    { print }
' .env > "$temporary_env"; then
    rm -f "$temporary_env"
    exit 1
fi
chmod 600 "$temporary_env"
mv "$temporary_env" .env

old_image=$(docker inspect --format '{{.Config.Image}}' "$CONTAINER" 2>/dev/null || true)

compose() {
    IMAGE="$IMAGE" SERVICE_VERSION="$SERVICE_VERSION" docker compose -f "$COMPOSE_FILE" "$@"
}

rollback() {
    docker logs --tail 100 "$CONTAINER" 2>&1 || true
    if [ -n "$old_image" ] && [ "$old_image" != "$IMAGE" ]; then
        IMAGE="$old_image" SERVICE_VERSION="${old_image##*:}" docker compose -f "$COMPOSE_FILE" up -d --no-deps "$SERVICE"
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

# 先以临时的单库账号执行共享包提供的增量 SQL，避免 Nacos 中的管理员账号触发权限隔离检查。
docker run --rm --network "$network" --env-file .env --entrypoint node "$IMAGE" dist/cli/apply-schema-bootstrap.js

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
