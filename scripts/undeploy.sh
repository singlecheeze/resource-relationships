#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PLUGIN_NAMESPACE="${PLUGIN_NAMESPACE:-resource-relationships}"
python3 scripts/plugin-state.py disable
oc process --local -f deploy/plugin-template.yaml -p IMAGE=unused -p "NAMESPACE=$PLUGIN_NAMESPACE" | oc delete --ignore-not-found -f -
echo 'Plugin removed. Namespace, image pull secrets, and unrelated workloads were retained.'
