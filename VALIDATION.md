# Validation — v0.5.6

Target: OpenShift console 4.22, React 18, PatternFly 6. This package has not been deployed to a live OpenShift cluster in this session.

## Local checks

- Strict TypeScript checking and production Webpack dynamic-plugin compilation.
- 28 logic/static tests: previous ownership, traversal, YAML identity/concurrency safeguards; network selector semantics, namespace boundaries, Gateway references, EgressIP assignment, Multus annotations, NMState relationships, EndpointSlice UID reuse protection; schema context/local references/array items/enums; non-mutating suggestions; unfilled value rejection; semantic color/font token and production import audit; API-group-aware kind help and schema-description fallback; example coverage/counts, YAML parsing, manifest identity, NMState content, and observed-resource aliases.
- Two expanded DOM scenarios using React/PatternFly with mocked APIs and a **textarea substitute for the console CodeEditor**: right-click/open, independent drafts/saves, validation gate, conflicts, duplicate-open behavior, refresh retention, dirty close cancel/confirm, denied updates and list failures, plus networking scope/category/kind inventory rendering, expanding kind descriptions, retaining expansion across tabs, and opening/closing the keyboard-help popover, expanding/collapsing read-only examples, and preserving the editable draft and save/validation counters while interacting with examples. These tests do not execute Monaco, its completion popup, theme, workers, or host editor lifecycle.
- Shell syntax and deployment YAML/manifest version consistency checks.

## Example panel acceptance

- Open NNCP and NodeNetworkState tabs: verify five examples, correct target kind, VLAN and MTU values, and the observed-state explanation. Expand multiple examples; confirm native YAML syntax highlighting, selection/copy, and no editing or save from example shortcuts.
- Verify examples appear beside the editor at wide sizes and below it in narrow workspaces; check both themes, keyboard toggles, and screen-reader labels.
- Example YAML is syntax-checked locally, not admitted against installed operator schemas. Fragments require merging into a complete configuration.

## Not validated here

- Live-console native CodeEditor integration, module federation, schema access through the console proxy, Monaco provider callbacks, completion preview/acceptance, and light/dark appearance or live theme changes. These require cluster acceptance below.
- Real-browser rendering: no Chromium executable is available in this environment. Existing Playwright tests use the standalone mocked SDK harness; even running them would not validate the host's Monaco integration.
- Container runtime, service CA, registry pulls, restricted SCC, console activation, and Kubernetes admission/update behavior on a live cluster.
- Large-cluster performance, complete accessibility audit, cross-minor upgrades, or arbitrary CRD relationship inference.

## Cluster acceptance procedure

1. Build/deploy v0.5.6 using README.md, confirm rollout and refresh the console. Open Home → Resource Relationships; check for browser errors.
2. Select Networking, enter your application namespace, include cluster-scoped types and operator namespaces, and refresh. Verify purpose groups appear beneath project and cluster scopes. Missing optional operators/APIs should not stop loading. Forbidden APIs should produce notices.
3. Verify Route/Ingress → Service → EndpointSlice → Pod, Gateway route parent/backend references, NetworkPolicy selectors, and Multus requested/reported attachments against `oc get ... -o yaml`. Do not interpret edges as a connectivity verdict.
4. Verify EgressIP selected Pods and `status.items` node assignments; EgressFirewall destinations; NNCP selected nodes → NNCE labels/status; Node → NodeNetworkState; ingress controller admitted routes and SR-IOV objects where installed. For custom operator namespaces, enter the namespace explicitly.
5. Expand About KIND in two resource tabs and verify their descriptions/scopes match. Open the circled question-mark help by keyboard and mouse; verify tooltip, close/Escape behavior, focus return, scrolling, and light/dark appearance.
6. Open a disposable ConfigMap and an installed CRD-backed resource in two tabs. Confirm a real Monaco editor appears, with highlighting, line numbers, and the console's code typography.
7. In a suitable mapping under `spec`, invoke Ctrl+Space. Check fields/types/descriptions against that API version's schema, enum values after `key:`, array-item context, and required markers. Dismiss a preview with Escape and confirm no draft change. Accept a field and fill its value; leave a field blank and verify validation is blocked. Use explicit `null` only when intended and valid.
8. Verify two editors of different resource kinds do not receive one another's schema suggestions. Close/reopen tabs; then open the console's built-in YAML page and ensure plugin completion providers do not affect it. Test schema access denial: editing and server validation remain available with a schema notice.
9. Switch light/dark themes while the tree, context menu, tabs, completion popup, and alerts are visible. Check contrast and fonts; resize and switch inactive editor tabs to verify Monaco layout. Test keyboard menus, Tab/Enter completion acceptance, Escape dismissal, and Ctrl/Cmd+S (must still respect exact-text validation).
10. Edit a disposable ConfigMap, validate and save, then verify with `oc get`. Change it externally and verify a stale save preserves the draft with a conflict. Verify read-only behavior with get/list but no update permission.
11. Repeat independent-tab edits, save only one, refresh the tree and change scopes, reopen the same UID, and cancel/confirm a dirty close. Save/copy drafts before leaving the plugin: SPA navigation is not intercepted.
12. Disable with scripts/plugin-state.py and confirm unrelated plugins remain enabled.

No network infrastructure edits were sent to your cluster. Test saves on disposable resources first.

## v0.5.1 image correction

- Both image paths normalize static-file modes and parent directory traversal, and send nginx bootstrap errors to stderr. Deployment retains non-root execution, dropped capabilities, and a read-only root filesystem.
- Permission normalization was exercised locally against restrictive file/directory modes and the resulting 0644/0755 modes were checked. This environment does not permit switching to an arbitrary UID, so runtime UID access remains a cluster acceptance check.
- No Docker/Podman runtime is installed here. The UBI image build and live HTTPS probe must be verified on the cluster; local checks do not establish a successful container rollout.

## v0.5.2 editor sizing

Both editor variants supply explicit height and disable the console’s default full-height mode. Regression checks verify these props reach the host editor in the DOM harness. The harness substitutes a textarea and cannot establish Monaco geometry; live-console verification remains required, including tab switching, resize, and expanding/collapsing examples.

## v0.5.6 density, gutters, and shortcut tooltip

Compact mode is unconditional. Tests confirm the removed toggle stays absent and verify that hovering the help button shows actual shortcut descriptions; click-open instructions remain covered. TypeScript, unit/static tests, DOM scenarios and the production build are checked. The DOM harness substitutes a textarea, so actual tree geometry and Monaco gutters still require live-console visual verification.

## v0.5.6 tree controls

Two unit tests verify all-branch expansion, preservation of every open-resource occurrence and ancestor, inactive open tabs, unrelated descendant collapse, absent open resources, and input immutability. DOM checks verify bulk collapse retains an open ConfigMap path while collapsing Service, bulk expand reopens Service, and the YAML editor remains mounted. Live-console verification of icons, scroll behavior and arrow interaction remains required.

## v0.5.6 project selection and collapsed defaults

TypeScript validates the native NamespaceBar/useActiveNamespace/isAllNamespacesKey SDK integration. DOM scenarios assert initial collapsed kinds and the full discovered resource-type list, and continue testing expansion, open-tab preservation and editing. The preview project dropdown is a test substitute: native project search/favorites, host navigation behavior and real-browser widths require live-console acceptance. All-project loading uses the existing paginated all-namespace collection path and remains subject to RBAC.
