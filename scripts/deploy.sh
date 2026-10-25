#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${IMAGE:?Set IMAGE to your pushed plugin container image reference}"
PLUGIN_NAMESPACE="${PLUGIN_NAMESPACE:-resource-relationships}"
command -v oc >/dev/null
command -v python3 >/dev/null
version=$(oc get clusterversion version -o jsonpath='{.status.desired.version}')
case "$version" in
  4.22.*) ;;
  *) echo "This build targets OpenShift 4.22. Detected $version. Align dependencies before deploying." >&2; exit 1 ;;
esac
oc create namespace "$PLUGIN_NAMESPACE" --dry-run=client -o yaml | oc apply -f -
oc process --local -f deploy/plugin-template.yaml -p "IMAGE=$IMAGE" -p "NAMESPACE=$PLUGIN_NAMESPACE" | oc apply -f -
# Restart picks up changed nginx config and refreshed serving certificates on redeploy.
oc -n "$PLUGIN_NAMESPACE" rollout restart deployment/resource-relationships
oc -n "$PLUGIN_NAMESPACE" rollout status deployment/resource-relationships --timeout=180s
python3 scripts/plugin-state.py enable
echo "Enabled. Wait for the console rollout, refresh your browser, then open Home > Resource Relationships."
