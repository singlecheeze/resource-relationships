# Resource Relationships — OpenShift console plugin

A React 18 / TypeScript / PatternFly 6 console plugin for **OpenShift 4.22**. Browse resources, inspect ownership and references, then right-click an object and choose **Open YAML** to view/edit it in a right-hand pane.

This is custom demo software, not a Red Hat supported product. The source, dependency lockfile, compiled plugin assets, deployment template, optional in-cluster build configuration, tests, and removal scripts are included. Cluster installation and real API behavior still require verification on your cluster; see `VALIDATION.md`.

## What it does

- Adds **Home → Resource Relationships** to the Administrator navigation, at `/resource-relationships`.
- Loads one namespace at a time. Enter `ai-test`, `nemo`, or another namespace explicitly; this is independent of the console's global project selector.
- Discovers API types and allows choosing additional custom resource types.
- Groups inventory by kind. Expand a kind, then use a resource's right-click or ⋮ menu.
- **Focus relationships** builds a tree from that object. Switch between outgoing and incoming relationships, and choose depth 1–4. Hover a relationship to see the field that establishes it.
- **Tabbed editors:** each resource opens in its own PatternFly tab, labeled by kind/namespace/name. Reopening the same UID selects the existing tab. A `*` marks unsaved changes. Each tab retains its YAML, validation result, permissions, and save/conflict state while inactive. The tab strip scrolls when it overflows. Tabs remain open even when the tree is refreshed or another namespace is loaded. Tabs are in-memory only; browser refresh closes them.
- **Open YAML** fetches the current object and opens a plain-text YAML editor tab on the right. Use the same menu with a keyboard, or Shift+F10 while focused on a resource label.
- Checks update permission with `SelfSubjectAccessReview`. Users without permission get a read-only editor.
- Requires a successful server dry-run validation of the exact text before enabling Save. Save also requires an in-app confirmation.
- Retains resource UID and resourceVersion; stale updates return conflicts and preserve your text.
- Saves through the console's Kubernetes API proxy, with your logged-in permissions. There is no privileged backend or etcd connection.

## Relationship coverage

| Source | Target | Evidence / relationship |
|---|---|---|
| Any loaded object | Dependent object | `metadata.ownerReferences.uid`: owns |
| Service | Pods in its namespace | Nonempty `spec.selector`: selects (label match, not readiness) |
| Pod | Node | `spec.nodeName`: runs on |
| Pod | ServiceAccount | `spec.serviceAccountName`: uses |
| Pod | PVC | `spec.volumes[].persistentVolumeClaim.claimName`: mounts |
| Pod | ConfigMap / Secret name | Volumes, projected sources, env, envFrom; includes init and ephemeral containers |
| Pod | Image pull Secret name | `spec.imagePullSecrets` |
| PVC | PV / StorageClass | `spec.volumeName` / `spec.storageClassName` |
| PV | Claim | `spec.claimRef.uid` |
| Route | Service | Primary and alternate backend references |
| Ingress | Service | Default backend and HTTP path backends |
| EndpointSlice | Service / endpoint object | Service-name label and endpoint target references |

Owner references work for loaded AI and virtualization CRs without custom rules. The defaults include InferenceService, LLMInferenceService, LeaderWorkerSet, VirtualMachine, VirtualMachineInstance, and DataVolume when discovered. **Their non-owner relationships are not inferred automatically**. For example, VM disk references and arbitrary CRD fields need explicit resolvers in `src/lib/graph.ts`.

Secrets are never listed or opened by this version. Their names appear under **References outside the loaded graph** when you select a referring object. A missing target may be outside the selected scope, forbidden, excluded, deleted, or not loaded; it is not proof of a broken reference.

## Quick deployment: build inside OpenShift using included assets

Prerequisites: OpenShift 4.22, `oc`, Python 3, cluster-admin access for installing/enabling the plugin, a working internal image registry, and build-node access to the UBI nginx image. The build tools need no access to etcd. No Helm installation is required.

Extract this archive and enter its directory:

```bash
unzip resource-relationships-v0.2.0.zip
cd resource-relationships
oc login https://api.YOUR-CLUSTER:6443

oc create namespace resource-relationships --dry-run=client -o yaml | oc apply -f -
oc apply -n resource-relationships -f deploy/build.yaml

# Only submit the runtime Dockerfile and compiled assets, not node_modules.
build_context=$(mktemp -d)
cp Dockerfile.prebuilt "$build_context/"
cp -R dist "$build_context/"
oc start-build resource-relationships -n resource-relationships \
  --from-dir="$build_context" --follow --wait
rm -rf "$build_context"

export IMAGE=image-registry.openshift-image-registry.svc:5000/resource-relationships/resource-relationships:v0.2.0
bash scripts/deploy.sh
```

The Deployment and ImageStream use the same namespace, allowing the service account's normal same-project image pull authorization. If your cluster disables that default, grant only the needed image-pull access.

The script verifies the OpenShift minor version, creates/applies the objects, waits for the plugin rollout, and appends its name to the console configuration. It preserves other enabled plugins and guards concurrent edits with a resourceVersion test. It never enables a plugin whose Deployment has failed to become ready.

After the console reconciles, refresh the browser and open **Administrator → Home → Resource Relationships**. You may need a full browser refresh to load a newly enabled plugin. A direct URL is:

```text
https://YOUR-CONSOLE-HOST/resource-relationships
```

If the build fails, inspect `oc logs -n resource-relationships build/BUILD-NAME`. The built-in registry must be available for the BuildConfig's ImageStream output. Use the external registry workflow below if it is disabled.

## Alternative: build and push with Podman

This performs the full source build in a container. It needs network access to npm and the UBI registries.

```bash
export IMAGE=quay.io/YOUR-ORGANIZATION/resource-relationships:v0.2.0
podman build --platform linux/amd64 -t "$IMAGE" .
podman push "$IMAGE"
bash scripts/deploy.sh
```

Use a CPU architecture matching your cluster. For a private registry, create an image pull secret **before** the Deployment needs to pull the image:

```bash
oc create namespace resource-relationships --dry-run=client -o yaml | oc apply -f -
# Create/import your registry credentials through your normal process.
# Then add imagePullSecrets to spec.template.spec in deploy/plugin-template.yaml:
# imagePullSecrets:
#   - name: your-pull-secret
```

`PLUGIN_NAMESPACE` optionally changes the installation namespace. The plugin name and route remain `resource-relationships`. If using the internal registry in a different namespace, change the IMAGE path and apply `deploy/build.yaml` there as well.

For disconnected builds, mirror the UBI base images and change both Dockerfiles. `Dockerfile.prebuilt` uses the included `dist/` and needs no npm access; it still needs its runtime base image. No CDN, external JavaScript, or external fonts are fetched at runtime.

## Use the explorer and editor

1. Enter a namespace and choose types under **Resource types**.
2. Enable **Include selected cluster-scoped types** to load Nodes, PVs, and StorageClasses if permitted. This lists those selected types cluster-wide, not just objects related to your namespace.
3. Click **Load / refresh**. API failures appear explicitly; accessible kinds still load.
4. Expand a kind. Right-click a resource and choose **Focus relationships**.
5. Choose outgoing or incoming relationships. Objects can appear multiple times because the underlying relationships form a graph. Cycles stop at a repeated object.
6. Right-click any loaded object and choose **Open YAML**. It is fetched again to avoid editing the inventory snapshot.
7. Edit YAML, click **Validate on server**, review it, then **Save changes**.

Example demo: Deployment → owns ReplicaSet → owns Pod → mounts PVC → bound to PV. Start at a Pod and choose incoming to see its ReplicaSet and matching Services. Use an OpenShift Route as the root to follow Route → Service → Pods.

### Save semantics and conflicts

The editor uses HTTP PUT (replace), not server-side apply. Removing fields from YAML can clear them; Kubernetes defaulting/admission still applies. It does not create objects. It does not allow changing kind, apiVersion, name, namespace, UID, or resourceVersion. `status` and `metadata.managedFields` are hidden and retained from the fetched baseline, and no status-subresource writes occur.

Dry-run is sent with `dryRun=All` and `fieldValidation=Strict`. Validation may fail for immutable fields, unavailable admission webhooks, unknown fields, or missing permission. A successful dry-run does not guarantee a later save: permissions or server state can change between the requests.

A 409 conflict leaves your edits in the textarea. Copy them somewhere safe, click **Reload YAML**, and reapply to the new version. There is deliberately no force-save or automatic merge. Successful saves update that object in the local graph; refresh to reload all other objects changed by controllers.

Switching tabs and refreshing the graph preserve all editor drafts. Closing a dirty tab or reloading its YAML prompts before discarding that draft. Tabs with requests in progress cannot be closed. Browser unload protection is also installed. **Other console SPA navigation is not intercepted**; save or copy your edits before changing console pages. Drafts are not persisted to browser storage.

## Architecture and permissions

- `src/components/RelationshipsPage.tsx`: inventory, PatternFly tree, context menu, right-hand pane.
- `src/components/YamlPane.tsx`: fetch, permission check, edit, dry-run, save.
- `src/lib/graph.ts`: explicit relationship rules, UID ownership, cycle/depth limits.
- `src/lib/api.ts`: preferred-version discovery, scoped list requests, console fetch wrapper.
- `src/lib/editor.ts`: YAML parser and identity/version guards.
- `deploy/plugin-template.yaml`: service account, HTTPS nginx, Deployment, Service, ConsolePlugin.
- `deploy/build.yaml`: optional binary BuildConfig and ImageStream.
- `scripts/plugin-state.py`: concurrency-safe console enable/disable.

The plugin pod only serves static files. Its service account has no resource-reading or writing role and no mounted token. API calls happen in the user's console session. Installation requires administrator rights; use afterward requires normal `get/list` access and `update` for edits, plus permission to create self-subject access reviews (normally available to authenticated users). Discovery visibility does not imply list access. A failed permission review makes the editor read-only; the API server remains authoritative.

HTTPS uses OpenShift service-serving certificates. No Route is needed for plugin assets; the console connects to the Service. If namespace NetworkPolicies restrict ingress, permit traffic from `openshift-console` to TCP 9443. Redeploy/restart the plugin when its serving certificate rotates so nginx loads the new certificate; this simple package does not include a certificate-reload controller.

## Source development

Use Node.js 22+ and npm. Dependencies are pinned in `package.json` and `package-lock.json` to the versions used for this build.

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Local console development, in two terminals:

```bash
# Terminal 1
npm start

# Terminal 2: use the exact console image from your 4.22 cluster.
oc login https://api.YOUR-CLUSTER:6443
export CONSOLE_IMAGE=$(oc -n openshift-console get deployment console \
  -o jsonpath='{.spec.template.spec.containers[0].image}')
npm run start-console
```

Then open `http://localhost:9000/resource-relationships`. The template's local-console script disables authentication and uses your oc token; run it only on a trusted development host. The in-cluster deployment uses normal console authentication.

DOM interaction tests (no browser download or cluster required):

```bash
npm run test:dom
```

For mocked browser tests (no cluster needed):

```bash
npx playwright install chromium
npx webpack --config webpack.preview.cjs
npm run test:ui
```

`preview/` is only a test harness. It is not packaged into the production plugin. Tests mock the API; they do not substitute for real cluster acceptance.

## Limits and scope

- Snapshot loading, not live watch; click refresh to see controller updates.
- One namespace at a time, with optional selected cluster-scoped resources.
- Maximum 2,000 objects per type with a warning when truncated; lists are paginated in 500-item chunks. API discovery/list concurrency is limited to five requests.
- Inventory renders at most 150 filtered objects; search narrows it. A focused tree is capped at 200 nodes and 1–4 levels. These limits are displayed in the UI.
- No inference from similarly named resources or arbitrary labels. Shared application labels alone are not proof of a dependency.
- Only discovered preferred API versions are offered. Custom APIs that cannot be discovered/listed are reported or absent.
- Plain-text YAML editor, without syntax highlighting or a diff viewer.
- UI strings are English. Theme colors follow PatternFly tokens.
- OpenShift 4.22 compatibility is declared as `>=4.22.0-0 <4.23.0-0`. Rebuild and test against the matching console template/SDK before widening it. Installing a plugin is not a guarantee of compatibility after a console upgrade.

## Troubleshooting and removal

```bash
oc get consoleplugin resource-relationships -o yaml
oc get console.operator.openshift.io cluster -o jsonpath='{.spec.plugins}'
oc -n resource-relationships get pods,svc,secrets
oc -n resource-relationships logs deployment/resource-relationships
oc -n openshift-console get pods
```

- Missing menu: verify enabled plugins, wait for console reconciliation, refresh the browser.
- Asset errors: inspect plugin logs, service certificate, port 9443, NetworkPolicies, browser console and network requests.
- Permission notices: run `oc auth can-i list pods -n YOUR-NAMESPACE` as the affected user; do not grant cluster-admin merely to make the tree complete.
- Disabled Save: update access is denied, YAML has not changed, a request is busy, or the exact edited text has not passed server validation.
- Broken console after enabling: disable this plugin using the CLI, or temporarily load the console with `?disable-plugins=resource-relationships`.

Disable only, retaining the deployment:

```bash
python3 scripts/plugin-state.py disable
```

Remove the runtime plugin objects:

```bash
bash scripts/undeploy.sh
```

The script retains the namespace and optional BuildConfig/ImageStream. To remove the optional build resources, explicitly run:

```bash
oc delete -n resource-relationships -f deploy/build.yaml
```

Use unique image tags for updates, rebuild, and run the deploy script with the new IMAGE. Existing revisions can be inspected with `oc rollout history deployment/resource-relationships -n resource-relationships`. The deploy script restarts the workload even when the image reference is unchanged, but prefer unique tags/digests for reproducibility.

## References

- https://github.com/openshift/console-plugin-template/tree/release-4.22
- https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/web_console/dynamic-plugins
- https://www.patternfly.org/components/tree-view/
- https://kubernetes.io/docs/concepts/overview/working-with-objects/owners-dependents/
- https://kubernetes.io/docs/reference/using-api/api-concepts/

Based on the Apache-2.0 OpenShift console plugin template; its LICENSE is retained.

## Upgrade from v0.1.0

Rebuild the image from this package and deploy it with the new `v0.2.0` tag. For the in-cluster workflow, reapply `deploy/build.yaml` (its output tag is now v0.2.0), submit the new `dist/` and `Dockerfile.prebuilt`, and run `scripts/deploy.sh` with IMAGE ending in `:v0.2.0`. The ConsolePlugin name and route are unchanged. Save any open drafts before refreshing the console to load the new plugin.
