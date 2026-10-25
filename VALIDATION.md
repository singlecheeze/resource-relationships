# Validation — v0.2.0

Target: OpenShift console 4.22, React 18, PatternFly 6. This package has not been deployed to a live OpenShift cluster in this session.

## Completed locally

- TypeScript strict type checking.
- Production Webpack dynamic-plugin build and generated plugin-manifest.json.
- Eight logic tests: ownership UID matching (including recreated-owner avoidance), namespace-scoped Service selectors, selector-less Service behavior, Pod/PVC/PV references, unresolved Secret references, forward/reverse ownership traversal, cycle/depth/budget limits, YAML parsing, immutable identity/resourceVersion guards, and preservation of excluded server-managed fields.
- Two expanded DOM interaction scenarios using the actual React/PatternFly components and mocked console API requests: right-click → Open YAML; edit → dry-run → save; conflict preserves draft; read-only editor on denied update; forbidden list notice; independent drafts and saves across tabs; duplicate-open selection; graph refresh retention; dirty inactive-tab close cancellation/confirmation; closing the last tab.
- YAML parsing and deployment cross-reference checks (labels, ports, Service and ConsolePlugin).
- Shell syntax checks for deployment/removal/local-console scripts.
- Enable/disable helper checks verify that unrelated plugins are retained and enable is idempotent.

## Not validated here

- Real-browser Playwright execution / visual rendering: tests are provided, but Chromium download failed in this environment. The Playwright attempt stopped at browser launch, before test bodies ran. DOM tests passed separately; they do not establish pixel layout or browser-specific behavior.
- Container build/run: Podman/Docker unavailable in this environment.
- OpenShift service CA issuance, image pulls, restricted SCC admission, console activation/module federation, and Kubernetes admission/update behavior on a real cluster.
- Performance on a large cluster, complete accessibility audit, upgrade compatibility, or arbitrary CRD relationship inference.

## Cluster acceptance procedure

1. Deploy using README.md and confirm the plugin Deployment becomes Ready.
2. Refresh the console and open Home → Resource Relationships; check the browser console for plugin loading errors.
3. Load a disposable namespace containing a Deployment, Service, ConfigMap, and PVC; enable cluster-scoped types if testing PVs/Nodes.
4. Focus the Deployment and inspect Deployment → ReplicaSet → Pod. Focus the Service and verify selector matches. Select a Pod to inspect uses/mounts references.
5. Right-click a ConfigMap, open YAML, change a harmless data value, validate, save, and verify with `oc get configmap NAME -n NAMESPACE -o yaml`.
6. Open the same object again, change it with `oc` in another terminal, then attempt a save from stale YAML. Confirm the conflict preserves the unsaved text.
7. Test with a user with get/list but no update permission: inspect YAML but confirm Save is disabled. Test forbidden resource types and confirm other types still load.
8. Open two resources, change both, switch tabs, save only one, and verify the other draft remains. Reopen a resource and check no duplicate tab appears. Refresh the graph and verify drafts persist. Test closing/reloading a dirty editor, narrow windows, keyboard actions (⋮ or Shift+F10, arrow keys, Escape), and console light/dark themes.
9. Disable the plugin using scripts/plugin-state.py and confirm existing console plugins remain enabled.

Run only disposable-object editing tests until satisfied with the behavior. Save or copy drafts before navigating to other console pages: global SPA navigation is not intercepted.
