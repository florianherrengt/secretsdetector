#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${1:-secret-detector:local}"
CONTAINER_NAME="smoke-test-$$"

cleanup() {
    docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "=== Building image ==="
docker buildx build --load -t "${IMAGE_NAME}" .

echo ""
echo "=== Checking image size ==="
SIZE=$(docker images "${IMAGE_NAME}" --format "{{.Size}}")
echo "Image size: ${SIZE}"

echo ""
echo "=== Starting container ==="
docker run -d --name "${CONTAINER_NAME}" \
    -e PORT=3000 \
    -e DATABASE_URL="postgresql://test:test@localhost:5432/test" \
    -e REDIS_URL="redis://localhost:6379" \
    "${IMAGE_NAME}" >/dev/null

echo ""
echo "=== Waiting for HTTP server ==="
for i in $(seq 1 30); do
    HTTP_CODE=$(docker exec "${CONTAINER_NAME}" wget -qO /dev/null -S http://localhost:3000/healthz 2>&1 | grep -oE 'HTTP/[0-9.]+ [0-9]+' | tail -1 | grep -oE '[0-9]{3}' || true)
    if [ -n "${HTTP_CODE}" ]; then
        echo "HTTP server responding after ${i}s (status: ${HTTP_CODE})"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "FAIL: HTTP server did not respond within 30s"
        docker logs "${CONTAINER_NAME}" 2>&1 || true
        exit 1
    fi
    sleep 1
done

echo ""
echo "=== Verifying runtime user ==="
RUNTIME_USER=$(docker exec "${CONTAINER_NAME}" whoami)
if [ "${RUNTIME_USER}" = "root" ]; then
    echo "FAIL: Container running as root"
    exit 1
fi
echo "Runtime user: ${RUNTIME_USER} (OK)"

echo ""
echo "=== Verifying UID/GID ==="
RUNTIME_ID=$(docker exec "${CONTAINER_NAME}" id)
echo "Runtime ID: ${RUNTIME_ID}"

echo ""
echo "=== Verifying Node.js version ==="
NODE_VERSION=$(docker exec "${CONTAINER_NAME}" node -v)
echo "Node version: ${NODE_VERSION}"

echo ""
echo "=== Verifying app artifact exists ==="
docker exec "${CONTAINER_NAME}" ls /app/dist/server/app.js >/dev/null
echo "dist/server/app.js: present (OK)"

echo ""
echo "=== All smoke tests passed ==="
