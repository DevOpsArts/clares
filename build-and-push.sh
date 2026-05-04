#!/bin/bash
set -e

IMAGE="devopsart1/clares-engine"
TAG="${1:-latest}"

echo "==> Building multi-platform image and pushing: ${IMAGE}:${TAG}"
docker --context=desktop-linux buildx build \
  --platform linux/amd64,linux/arm64 \
  -t "${IMAGE}:${TAG}" \
  -t "${IMAGE}:latest" \
  --push .

echo "==> Done! Image pushed: ${IMAGE}:${TAG} (amd64 + arm64)"
echo ""
echo "To deploy with Helm:"
echo "  helm upgrade --install clares ./helm/clares-engine -f helm/clares-engine/values-prod.yaml --set image.tag=${TAG}"
