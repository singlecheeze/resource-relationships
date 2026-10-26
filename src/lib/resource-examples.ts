import { stringify } from 'yaml';
import { ResourceType } from './model';

export type ResourceExample = {
  id: string; title: string; note: string; source: string;
  kind: string; apiVersion: string; format: 'fragment' | 'manifest'; yaml: string;
};
type Recipe = [title: string, fields: Record<string, unknown>, note: string];
export const exampleCatalog: Record<string, ResourceExample[]> = {};
const docs = {
  workloads: 'https://kubernetes.io/docs/concepts/workloads/controllers/',
  pod: 'https://kubernetes.io/docs/concepts/workloads/pods/',
  service: 'https://kubernetes.io/docs/concepts/services-networking/service/',
  storage: 'https://kubernetes.io/docs/concepts/storage/persistent-volumes/',
  config: 'https://kubernetes.io/docs/concepts/configuration/configmap/',
  networkPolicy: 'https://kubernetes.io/docs/concepts/services-networking/network-policies/',
  gateway: 'https://gateway-api.sigs.k8s.io/guides/',
  network: 'https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/network_apis/network-apis',
  nmstate: 'https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/kubernetes_nmstate/k8s-nmstate-updating-node-network-config',
  sriov: 'https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/hardware_networks/configuring-sriov-device',
  virt: 'https://kubevirt.io/user-guide/user_workloads/virtual_machine_instances/',
};
function add(apiVersion: string, kind: string, source: string, recipes: Recipe[], format: ResourceExample['format'] = 'fragment') {
  const group = apiVersion.includes('/') ? apiVersion.split('/')[0] : '';
  exampleCatalog[`${group}/${kind}`] = recipes.map(([title, fields, note], i) => ({
    id: `${group || 'core'}-${kind}-${i}`, title, note, source, kind: typeof fields.kind === 'string' ? fields.kind : kind, apiVersion: typeof fields.apiVersion === 'string' ? fields.apiVersion : apiVersion,
    format: fields.kind && fields.apiVersion ? 'manifest' : format,
    yaml: `# ${title}\n# ${format === 'fragment' && !fields.kind ? `Configuration fragment for ${kind}; not a complete manifest.` : 'Example manifest; replace example names, interfaces, and addresses.'}\n` + stringify(fields, { lineWidth: 0 }),
  }));
}
const container = { name: 'web', image: 'registry.access.redhat.com/ubi9/nginx-124:latest', ports: [{ containerPort: 8080 }] };
const podTemplate = { metadata: { labels: { app: 'example-web' } }, spec: { containers: [container] } };
const resourceLimits = { requests: { cpu: '250m', memory: '256Mi' }, limits: { cpu: '1', memory: '512Mi' } };
add('v1', 'Pod', docs.pod, [
  ['Set CPU and memory budgets', { spec: { containers: [{ ...container, resources: resourceLimits }] } }, 'Adjust budgets to your workload. Preserve other container fields when merging; image tags are illustrative.'],
  ['Mount configuration from a ConfigMap', { spec: { containers: [{ ...container, volumeMounts: [{ name: 'settings', mountPath: '/etc/example', readOnly: true }] }], volumes: [{ name: 'settings', configMap: { name: 'example-settings' } }] } }, 'Create example-settings in the same namespace. For controller-managed Pods, change the controller template instead.'],
  ['Attach a secondary network', { metadata: { annotations: { 'k8s.v1.cni.cncf.io/networks': 'example-secondary' } } }, 'Requires Multus and an existing NetworkAttachmentDefinition in the Pod namespace. Set this on the owning workload template for managed Pods.'],
]);
add('apps/v1', 'Deployment', docs.workloads, [
  ['Scale to three replicas', { spec: { replicas: 3 } }, 'Use on an existing Deployment. An autoscaler may manage or overwrite this value.'],
  ['Roll out without reducing available replicas', { spec: { strategy: { type: 'RollingUpdate', rollingUpdate: { maxSurge: 1, maxUnavailable: 0 } } } }, 'Requires enough capacity for a surge Pod and working readiness checks.'],
  ['Add HTTP readiness and liveness checks', { spec: { template: { spec: { containers: [{ ...container, readinessProbe: { httpGet: { path: '/ready', port: 8080 }, initialDelaySeconds: 5 }, livenessProbe: { httpGet: { path: '/health', port: 8080 }, initialDelaySeconds: 30 } }] } } } }, 'Replace paths with endpoints your application implements. Preserve the existing container name, image, and other fields.'],
  ['Set container resource requests and limits', { spec: { template: { spec: { containers: [{ ...container, resources: resourceLimits }] } } } }, 'Merge into the existing container; do not replace other containers or fields.'],
]);
add('apps/v1', 'ReplicaSet', docs.workloads, [
  ['Set the replica count', { spec: { replicas: 3 } }, 'If a Deployment owns this ReplicaSet, edit the Deployment instead.'],
  ['Match Pods with a template label', { spec: { selector: { matchLabels: { app: 'example-web' } }, template: podTemplate } }, 'Creation example. Selectors must match template labels; do not change the selector of a managed ReplicaSet.'],
  ['Set resources on a new Pod template', { spec: { template: { spec: { containers: [{ ...container, resources: resourceLimits }] } } } }, 'For a directly managed ReplicaSet. Existing Pods are not automatically rolled out like Deployment Pods.'],
]);
add('apps/v1', 'StatefulSet', docs.workloads, [
  ['Give each replica its own persistent volume', { spec: { serviceName: 'example-headless', replicas: 3, selector: { matchLabels: { app: 'example-web' } }, template: { ...podTemplate, spec: { containers: [{ ...container, volumeMounts: [{ name: 'data', mountPath: '/data' }] }] } }, volumeClaimTemplates: [{ metadata: { name: 'data' }, spec: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '10Gi' } } } }] } }, 'Creation fragment. Requires a headless Service and a default StorageClass. Existing claim templates have update restrictions.'],
  ['Stage a rolling update with a partition', { spec: { updateStrategy: { type: 'RollingUpdate', rollingUpdate: { partition: 2 } } } }, 'For a set with at least three replicas, only ordinals 2 and above update to a changed template.'],
  ['Create Pods in parallel', { spec: { podManagementPolicy: 'Parallel' } }, 'Creation-time choice for applications that do not require ordered startup; not a general in-place update.'],
]);
add('apps/v1', 'DaemonSet', docs.workloads, [
  ['Target a labeled node pool', { spec: { template: { spec: { nodeSelector: { 'example.com/agent-pool': 'enabled' } } } } }, 'Label only the intended nodes. Preserve the rest of the Pod template.'],
  ['Limit disruption during updates', { spec: { updateStrategy: { type: 'RollingUpdate', rollingUpdate: { maxUnavailable: 1 } } } }, 'Allows one unavailable DaemonSet Pod during its rolling update.'],
  ['Tolerate a dedicated node taint', { spec: { template: { spec: { tolerations: [{ key: 'example.com/dedicated', operator: 'Equal', value: 'infra', effect: 'NoSchedule' }] } } } }, 'This toleration permits placement; it does not select nodes. Combine with the appropriate node selector.'],
]);
add('batch/v1', 'Job', docs.workloads, [
  ['Retry a finite batch task', { spec: { backoffLimit: 3, template: { spec: { restartPolicy: 'Never', containers: [{ name: 'task', image: 'registry.access.redhat.com/ubi9/ubi-minimal:latest', command: ['/bin/sh', '-c', 'echo example-task'] }] } } } }, 'Creation fragment. Replace the demonstration command and use an approved image.'],
  ['Run multiple work items', { spec: { completions: 10, parallelism: 2 } }, 'Use a queue or another coordination strategy so Pods do not accidentally repeat the same work.'],
  ['Set a deadline and clean up completed Jobs', { spec: { activeDeadlineSeconds: 1800, ttlSecondsAfterFinished: 3600 } }, 'Stops execution after 30 minutes and allows cleanup an hour after completion.'],
]);
add('batch/v1', 'CronJob', docs.workloads, [
  ['Schedule a daily run in UTC', { spec: { schedule: '0 2 * * *', timeZone: 'Etc/UTC' } }, 'Merge into a CronJob with a valid jobTemplate.'],
  ['Prevent overlapping executions', { spec: { concurrencyPolicy: 'Forbid', startingDeadlineSeconds: 300 } }, 'Forbid skips overlapping runs; this does not provide application-level exactly-once execution.'],
  ['Pause scheduling and limit retained history', { spec: { suspend: true, successfulJobsHistoryLimit: 2, failedJobsHistoryLimit: 3 } }, 'Suspending prevents new scheduled Jobs; it does not stop already running Jobs.'],
]);
add('v1', 'ConfigMap', docs.config, [
  ['Store application settings', { data: { LOG_LEVEL: 'info', FEATURE_ENABLED: 'true' } }, 'ConfigMap data values are strings. Restart or reload consumers as needed.'],
  ['Store a configuration file', { data: { 'application.yaml': 'server:\n  port: 8080\nlogging:\n  level: info\n' } }, 'Mount this key as a file; configure the application to read it.'],
  ['Make configuration immutable', { immutable: true, data: { RELEASE_CHANNEL: 'stable' } }, 'Immutability cannot be reversed on the same ConfigMap. Create a replacement to change data.'],
]);
add('v1', 'Secret', 'https://kubernetes.io/docs/concepts/configuration/secret/', [
  ['Store a credential using stringData', { type: 'Opaque', stringData: { username: 'REPLACE_ME', password: 'REPLACE_ME' } }, 'Example placeholders only. Avoid storing real credentials in shared examples.'],
  ['Reference a TLS key pair', { type: 'kubernetes.io/tls', stringData: { 'tls.crt': 'REPLACE_WITH_PEM_CERTIFICATE', 'tls.key': 'REPLACE_WITH_PEM_PRIVATE_KEY' } }, 'Values must be a valid certificate and matching private key, not these placeholders.'],
  ['Make a Secret immutable', { immutable: true }, 'Existing data is preserved when deliberately merging this field. Recreate the Secret to change immutable data.'],
]);
add('v1', 'ServiceAccount', 'https://kubernetes.io/docs/concepts/security/service-accounts/', [
  ['Disable automatic token mounting', { automountServiceAccountToken: false }, 'Pod-level settings can override this default. Use for workloads that do not need Kubernetes API credentials.'],
  ['Use an image pull secret', { imagePullSecrets: [{ name: 'example-registry-credentials' }] }, 'Create the registry credential Secret in the same namespace first.'],
  ['Grant namespace read access with a RoleBinding', { apiVersion: 'rbac.authorization.k8s.io/v1', kind: 'RoleBinding', metadata: { name: 'example-viewer', namespace: 'example-project' }, subjects: [{ kind: 'ServiceAccount', name: 'example-app', namespace: 'example-project' }], roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: 'view' } }, 'Related RoleBinding manifest. Permissions belong in bindings, not in ServiceAccount fields.'],
]);
add('v1', 'Namespace', 'https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/', [
  ['Label a namespace for policy selection', { metadata: { labels: { 'example.com/team': 'analytics' } } }, 'Network policies and other selectors can match this label. Check existing selectors before adding it.'],
  ['Audit Pod security against restricted rules', { metadata: { labels: { 'pod-security.kubernetes.io/audit': 'restricted', 'pod-security.kubernetes.io/audit-version': 'latest' } } }, 'Audit does not block admission. OpenShift SCC and managed Pod Security labels also influence behavior.'],
  ['Record ownership information', { metadata: { annotations: { 'example.com/owner': 'platform-team', 'example.com/purpose': 'development' } } }, 'Organizational metadata only; this does not grant permissions.'],
]);
add('v1', 'Node', 'https://kubernetes.io/docs/concepts/architecture/nodes/', [
  ['Label a node for workload placement', { metadata: { labels: { 'example.com/workload': 'inference' } } }, 'Existing Node fragment. Workload nodeSelectors can match this label.'],
  ['Reserve a node with a NoSchedule taint', { spec: { taints: [{ key: 'example.com/dedicated', value: 'inference', effect: 'NoSchedule' }] } }, 'Preserve existing taints when merging. Tolerations permit scheduling; this does not evict existing Pods.'],
  ['Prevent new Pod scheduling', { spec: { unschedulable: true } }, 'Equivalent intent to cordoning an existing node. This does not drain its current workloads.'],
]);
add('v1', 'Service', docs.service, [
  ['Expose Pods inside the cluster', { spec: { type: 'ClusterIP', selector: { app: 'example-web' }, ports: [{ name: 'http', port: 80, targetPort: 8080 }] } }, 'The selector must match Pod labels; targetPort must match the listening application port.'],
  ['Create a headless discovery Service', { spec: { clusterIP: 'None', selector: { app: 'example-web' }, ports: [{ name: 'http', port: 8080, targetPort: 8080 }] } }, 'Creation fragment, often paired with StatefulSets. clusterIP is generally not editable on an existing Service.'],
  ['Request an external load balancer', { spec: { type: 'LoadBalancer', selector: { app: 'example-web' }, ports: [{ name: 'http', port: 80, targetPort: 8080 }] } }, 'Requires an installed load-balancer implementation, such as a cloud integration or MetalLB.'],
  ['Alias an external DNS name', { spec: { type: 'ExternalName', externalName: 'database.example.com' } }, 'DNS alias only; no Pod selector, proxying, or endpoint health checks.'],
]);
add('v1', 'PersistentVolumeClaim', docs.storage, [
  ['Request dynamically provisioned storage', { spec: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '20Gi' } } } }, 'Uses the default StorageClass; add a supported storageClassName if needed.'],
  ['Request shared filesystem storage', { spec: { accessModes: ['ReadWriteMany'], volumeMode: 'Filesystem', storageClassName: 'example-rwx-class', resources: { requests: { storage: '50Gi' } } } }, 'Requires a StorageClass and driver that support ReadWriteMany.'],
  ['Expand an existing claim', { spec: { resources: { requests: { storage: '100Gi' } } } }, 'Requires allowVolumeExpansion and driver support. Expansion is not shrinking; retain the rest of the claim.'],
]);
add('v1', 'PersistentVolume', docs.storage, [
  ['Define static NFS storage', { spec: { capacity: { storage: '100Gi' }, accessModes: ['ReadWriteMany'], volumeMode: 'Filesystem', storageClassName: '', persistentVolumeReclaimPolicy: 'Retain', nfs: { server: '192.0.2.20', path: '/exports/example' } } }, 'Creation fragment. Replace the NFS endpoint/export and arrange server-side permissions.'],
  ['Retain storage after releasing a claim', { spec: { persistentVolumeReclaimPolicy: 'Retain' } }, 'An existing-volume change; storage cleanup then requires deliberate administrator action.'],
  ['Use NFS v4.1 mount options', { spec: { mountOptions: ['vers=4.1', 'hard'] } }, 'For an NFS-backed volume whose server supports v4.1; these are not generic CSI options.'],
]);
add('storage.k8s.io/v1', 'StorageClass', 'https://kubernetes.io/docs/concepts/storage/storage-classes/', [
  ['Allow supported volume expansion', { allowVolumeExpansion: true }, 'The CSI driver must also support expansion. This alone does not resize existing claims.'],
  ['Delay binding until a consumer is scheduled', { volumeBindingMode: 'WaitForFirstConsumer' }, 'Creation-time choice, useful for topology-aware storage. Do not assume this field can change in place.'],
  ['Retain newly provisioned volumes', { reclaimPolicy: 'Retain' }, 'Creation-time StorageClass policy for newly provisioned PVs; existing PVs retain their own reclaim policy.'],
]);
add('route.openshift.io/v1', 'Route', docs.network, [
  ['Expose an HTTP Service', { spec: { host: 'app.example.com', to: { kind: 'Service', name: 'example-web' }, port: { targetPort: 'http' } } }, 'Use an existing Service port named http and a hostname admitted by your ingress controller.'],
  ['Terminate TLS at the router', { spec: { tls: { termination: 'edge', insecureEdgeTerminationPolicy: 'Redirect' } } }, 'Merge into an existing Route. Without a custom certificate, the router certificate must cover the hostname.'],
  ['Pass TLS through to the application', { spec: { to: { kind: 'Service', name: 'example-tls' }, port: { targetPort: 'https' }, tls: { termination: 'passthrough' } } }, 'The application terminates TLS and supplies its certificate. Remove incompatible edge TLS fields when changing modes.'],
]);
add('networking.k8s.io/v1', 'Ingress', 'https://kubernetes.io/docs/concepts/services-networking/ingress/', [
  ['Route a hostname and path to a Service', { spec: { rules: [{ host: 'app.example.com', http: { paths: [{ path: '/', pathType: 'Prefix', backend: { service: { name: 'example-web', port: { number: 80 } } } }] } }] } }, 'Requires an ingress controller; choose the appropriate ingressClassName for your installation.'],
  ['Use a TLS certificate Secret', { spec: { tls: [{ hosts: ['app.example.com'], secretName: 'example-tls' }] } }, 'The TLS Secret must exist in the Ingress namespace and cover the hostname.'],
  ['Set a default backend', { spec: { defaultBackend: { service: { name: 'example-fallback', port: { number: 80 } } } } }, 'Handles requests that do not match other rules, subject to the controller implementation.'],
]);
add('networking.k8s.io/v1', 'IngressClass', 'https://kubernetes.io/docs/concepts/services-networking/ingress/', [
  ['Select the ingress controller implementation', { spec: { controller: 'openshift.io/ingress-to-route' } }, 'OpenShift-specific example. Confirm the controller identifier supported by your installation.'],
  ['Mark a class as the default', { metadata: { annotations: { 'ingressclass.kubernetes.io/is-default-class': 'true' } } }, 'Avoid multiple default classes. This affects Ingresses created without an explicit class.'],
  ['Keep a class opt-in', { metadata: { annotations: { 'ingressclass.kubernetes.io/is-default-class': 'false' } } }, 'Workloads must select it explicitly with spec.ingressClassName.'],
]);
add('networking.k8s.io/v1', 'NetworkPolicy', docs.networkPolicy, [
  ['Default-deny inbound traffic', { spec: { podSelector: {}, policyTypes: ['Ingress'], ingress: [] } }, 'Applies to every Pod in the namespace. Add explicit allow policies for required incoming traffic.'],
  ['Allow a frontend to reach an API', { spec: { podSelector: { matchLabels: { app: 'example-api' } }, policyTypes: ['Ingress'], ingress: [{ from: [{ podSelector: { matchLabels: { app: 'example-frontend' } } }], ports: [{ protocol: 'TCP', port: 8080 }] }] } }, 'The peer Pod selector matches Pods in this same namespace. Other applicable policies can also allow traffic.'],
  ['Allow traffic from a labeled namespace', { spec: { podSelector: { matchLabels: { app: 'example-api' } }, policyTypes: ['Ingress'], ingress: [{ from: [{ namespaceSelector: { matchLabels: { 'example.com/team': 'trusted' } } }], ports: [{ protocol: 'TCP', port: 8080 }] }] } }, 'Label the intended namespaces. Namespace selectors match namespace labels, not Pod labels.'],
  ['Allow DNS to the OpenShift DNS namespace', { spec: { podSelector: {}, policyTypes: ['Egress'], egress: [{ to: [{ namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'openshift-dns' } } }], ports: [{ protocol: 'UDP', port: 53 }, { protocol: 'TCP', port: 53 }] }] } }, 'Verify DNS networking and host-network behavior in your cluster. This policy only adds this allow rule; it does not revoke allowances from other policies.'],
]);
add('gateway.networking.k8s.io/v1', 'Gateway', docs.gateway, [
  ['Listen for HTTP on port 80', { spec: { gatewayClassName: 'example-gateway-class', listeners: [{ name: 'http', protocol: 'HTTP', port: 80, allowedRoutes: { namespaces: { from: 'Same' } } }] } }, 'Replace the GatewayClass with one installed in your cluster.'],
  ['Terminate HTTPS with a certificate', { spec: { gatewayClassName: 'example-gateway-class', listeners: [{ name: 'https', hostname: 'app.example.com', protocol: 'HTTPS', port: 443, tls: { mode: 'Terminate', certificateRefs: [{ kind: 'Secret', name: 'example-tls' }] } }] } }, 'Certificate Secret must exist in the Gateway namespace unless cross-namespace references are explicitly authorized.'],
  ['Accept routes from selected namespaces', { spec: { listeners: [{ name: 'http', protocol: 'HTTP', port: 80, allowedRoutes: { namespaces: { from: 'Selector', selector: { matchLabels: { 'example.com/gateway-access': 'enabled' } } } } }] } }, 'Label approved namespaces and preserve the rest of the listener configuration.'],
]);
add('gateway.networking.k8s.io/v1', 'GatewayClass', docs.gateway, [
  ['Associate a class with its controller', { spec: { controllerName: 'example.net/gateway-controller' } }, 'Placeholder: use the exact controllerName advertised by your installed Gateway implementation.'],
  ['Reference controller-specific parameters', { spec: { parametersRef: { group: 'example.net', kind: 'GatewayParameters', name: 'example-parameters' } } }, 'API-shape example only. Group/kind and fields are controller-specific; this example CRD is not built into Kubernetes.'],
  ['Document class ownership', { metadata: { labels: { 'example.com/tier': 'internal' }, annotations: { 'example.com/owner': 'network-team' } } }, 'Organizational metadata; use policies and controller settings for actual access restrictions.'],
]);
add('gateway.networking.k8s.io/v1', 'HTTPRoute', docs.gateway, [
  ['Route a hostname to a Service', { spec: { parentRefs: [{ name: 'example-gateway' }], hostnames: ['app.example.com'], rules: [{ matches: [{ path: { type: 'PathPrefix', value: '/' } }], backendRefs: [{ name: 'example-web', port: 80 }] }] } }, 'Gateway listener and route attachment must be accepted. Check status.parents.'],
  ['Split traffic between two versions', { spec: { rules: [{ backendRefs: [{ name: 'example-stable', port: 80, weight: 90 }, { name: 'example-canary', port: 80, weight: 10 }] }] } }, 'Relative weights, not a guaranteed ratio over a small number of requests. Preserve existing route matches where needed.'],
  ['Redirect HTTP requests to HTTPS', { spec: { parentRefs: [{ name: 'example-gateway', sectionName: 'http' }], rules: [{ filters: [{ type: 'RequestRedirect', requestRedirect: { scheme: 'https', statusCode: 301 } }] }] } }, 'Requires a working HTTPS listener and certificate. This redirect rule has no backend.'],
]);
add('gateway.networking.k8s.io/v1', 'GRPCRoute', docs.gateway, [
  ['Send gRPC traffic to a backend', { spec: { parentRefs: [{ name: 'example-gateway' }], rules: [{ backendRefs: [{ name: 'example-grpc', port: 50051 }] }] } }, 'Requires controller support for GRPCRoute and appropriate upstream protocol configuration.'],
  ['Match one gRPC method', { spec: { rules: [{ matches: [{ method: { type: 'Exact', service: 'example.Inventory', method: 'ListItems' } }], backendRefs: [{ name: 'example-grpc', port: 50051 }] }] } }, 'Use the service and method names from your protobuf API.'],
  ['Canary a gRPC backend', { spec: { rules: [{ backendRefs: [{ name: 'example-grpc-stable', port: 50051, weight: 95 }, { name: 'example-grpc-canary', port: 50051, weight: 5 }] }] } }, 'Check controller conformance and retain required parent references.'],
]);
for (const [kind, port] of [['TCPRoute', 5432], ['TLSRoute', 443], ['UDPRoute', 5353]] as const) {
  add('gateway.networking.k8s.io/v1alpha2', kind, docs.gateway, [
    ['Forward to a single backend', { spec: { parentRefs: [{ name: 'example-gateway', sectionName: 'example-listener' }], ...(kind === 'TLSRoute' ? { hostnames: ['app.example.com'] } : {}), rules: [{ backendRefs: [{ name: 'example-backend', port }] }] } }, 'Version/feature availability varies by installed Gateway API bundle and controller. Check the listener protocol and accepted status.'],
    ['Weight two backends', { spec: { rules: [{ backendRefs: [{ name: 'example-primary', port, weight: 90 }, { name: 'example-canary', port, weight: 10 }] }] } }, 'Requires support for weighted backends for this route type; retain parentRefs and other matching fields.'],
    ['Reference a backend in another namespace', { spec: { rules: [{ backendRefs: [{ name: 'example-backend', namespace: 'example-backends', port }] }] } }, 'Requires a ReferenceGrant in the backend namespace and controller support. A reference alone is not permission.'],
  ]);
}
add('gateway.networking.k8s.io/v1beta1', 'ReferenceGrant', docs.gateway, [
  ['Allow an HTTPRoute to reference Services', { spec: { from: [{ group: 'gateway.networking.k8s.io', kind: 'HTTPRoute', namespace: 'example-frontend' }], to: [{ group: '', kind: 'Service' }] } }, 'Create the grant in the backend namespace. This permits references to all its Services from the specified route kind/namespace.'],
  ['Restrict permission to a named Service', { spec: { from: [{ group: 'gateway.networking.k8s.io', kind: 'HTTPRoute', namespace: 'example-frontend' }], to: [{ group: '', kind: 'Service', name: 'example-api' }] } }, 'Use the narrowest required permission for a cross-namespace backend.'],
  ['Allow a Gateway to reference a TLS Secret', { spec: { from: [{ group: 'gateway.networking.k8s.io', kind: 'Gateway', namespace: 'example-gateways' }], to: [{ group: '', kind: 'Secret', name: 'example-tls' }] } }, 'Create in the certificate namespace. Requires cross-namespace certificate support in the controller.'],
]);
const anpSubject = { namespaces: { matchLabels: { 'example.com/tenant': 'demo' } } };
for (const kind of ['AdminNetworkPolicy', 'BaselineAdminNetworkPolicy']) {
  const priority = kind === 'AdminNetworkPolicy' ? { priority: 50 } : {};
  add('policy.networking.k8s.io/v1alpha1', kind, docs.network, [
    ['Select a tenant namespace group', { spec: { ...priority, subject: anpSubject, ingress: [{ name: 'allow-same-tenant', action: 'Allow', from: [{ namespaces: { matchLabels: { 'example.com/tenant': 'demo' } } }] }] } }, 'Review all policy priorities and rule order. BaselineAdminNetworkPolicy uses the singleton name default.'],
    ['Deny selected namespaces as inbound peers', { spec: { ...priority, subject: anpSubject, ingress: [{ name: 'deny-untrusted', action: 'Deny', from: [{ namespaces: { matchLabels: { 'example.com/trust': 'untrusted' } } }] }] } }, 'Merge with the complete policy and inspect interaction with other administrative and namespace policies.'],
    ['Allow outbound HTTPS to a destination network', { spec: { ...priority, subject: anpSubject, egress: [{ name: 'allow-https', action: 'Allow', to: [{ networks: ['198.51.100.0/24'] }], ports: [{ portNumber: { protocol: 'TCP', port: 443 } }] }] } }, 'Replace the documentation-only destination. This rule alone is not a complete egress isolation design.'],
  ]);
}
const nncp = (name: string, desiredState: unknown) => ({ apiVersion: 'nmstate.io/v1', kind: 'NodeNetworkConfigurationPolicy', metadata: { name }, spec: { nodeSelector: { 'kubernetes.io/hostname': 'example-worker' }, desiredState } });
add('nmstate.io/v1', 'NodeNetworkConfigurationPolicy', docs.nmstate, [
  ['Add VLAN 100 on a secondary NIC', nncp('example-vlan100', { interfaces: [{ name: 'eth1.100', type: 'vlan', state: 'up', vlan: { 'base-iface': 'eth1', id: 100 }, ipv4: { enabled: true, dhcp: false, address: [{ ip: '192.0.2.10', 'prefix-length': 24 }] } }] }), 'Replace example-worker, eth1, VLAN ID, and address. The switch must carry this VLAN. Use a secondary NIC, not an OpenShift-managed primary interface.'],
  ['Set a secondary NIC MTU to 9000', nncp('example-jumbo-mtu', { interfaces: [{ name: 'eth1', type: 'ethernet', state: 'up', mtu: 9000 }] }), 'Confirm end-to-end MTU support on NICs, bonds, VLANs, and switches. This is a secondary host-interface change, not a cluster overlay MTU migration.'],
  ['Create an active-backup bond', nncp('example-backup-bond', { interfaces: [{ name: 'bond1', type: 'bond', state: 'up', 'link-aggregation': { mode: 'active-backup', options: { miimon: '100' }, port: ['eth1', 'eth2'] }, ipv4: { enabled: false }, ipv6: { enabled: false } }] }), 'Use two available secondary NICs. Review existing addressing and switch connections before applying a bond policy.'],
  ['Create an L2 Linux bridge for VMs', nncp('example-vm-bridge', { interfaces: [{ name: 'br1', type: 'linux-bridge', state: 'up', ipv4: { enabled: false }, ipv6: { enabled: false }, bridge: { options: { stp: { enabled: false } }, port: [{ name: 'eth1' }] } }] }), 'Requires an available secondary NIC and a separate network attachment for workloads. Do not introduce a switching loop with STP disabled.'],
  ['Add a static secondary-network route', nncp('example-static-route', { interfaces: [{ name: 'eth1', type: 'ethernet', state: 'up', ipv4: { enabled: true, dhcp: false, address: [{ ip: '192.0.2.10', 'prefix-length': 24 }] } }], routes: { config: [{ destination: '198.51.100.0/24', 'next-hop-address': '192.0.2.1', 'next-hop-interface': 'eth1', 'table-id': 254 }] } }), 'Use a gateway reachable on this secondary interface. Avoid changing the default route or overlapping cluster address ranges.'],
], 'manifest');
add('k8s.cni.cncf.io/v1', 'NetworkAttachmentDefinition', 'https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/multiple_networks/index', [
  ['Attach Pods to an existing Linux bridge', { spec: { config: JSON.stringify({ cniVersion: '0.3.1', name: 'example-bridge', type: 'bridge', bridge: 'br1', ipam: { type: 'whereabouts', range: '192.0.2.0/24' } }, null, 2) } }, 'Requires br1 on every eligible node and the bridge and Whereabouts CNI plugins. Use a non-conflicting real subnet.'],
  ['Create a macvlan secondary attachment', { spec: { config: JSON.stringify({ cniVersion: '0.3.1', name: 'example-macvlan', type: 'macvlan', master: 'eth1', mode: 'bridge', ipam: { type: 'whereabouts', range: '192.0.2.0/24' } }, null, 2) } }, 'Replace the secondary host interface and subnet; verify switch port/MAC limits and installed CNI plugins.'],
  ['Use a VLAN-tagged bridge attachment', { spec: { config: JSON.stringify({ cniVersion: '0.3.1', name: 'example-vlan', type: 'bridge', bridge: 'br1', vlan: 100, ipam: { type: 'whereabouts', range: '192.0.2.0/24' } }, null, 2) } }, 'Requires appropriate VLAN filtering/trunk configuration on the host bridge and upstream network. The NAD alone does not configure physical switching.'],
]);
for (const kind of ['UserDefinedNetwork', 'ClusterUserDefinedNetwork']) {
  const wrap = (network: unknown) => ({ spec: kind === 'ClusterUserDefinedNetwork' ? { namespaceSelector: { matchLabels: { 'example.com/network': 'tenant-a' } }, network } : network });
  const note = 'Creation fragment. Verify support in the installed OVN-Kubernetes version, use non-overlapping subnets, and prepare namespaces for a primary UDN before creating workload Pods.';
  add('k8s.ovn.org/v1', kind, 'https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/multiple_networks/primary-networks', [
    ['Create a primary Layer 2 tenant network', wrap({ topology: 'Layer2', layer2: { role: 'Primary', subnets: ['10.200.0.0/16'] } }), note],
    ['Create a primary Layer 3 tenant network', wrap({ topology: 'Layer3', layer3: { role: 'Primary', subnets: [{ cidr: '10.201.0.0/16', hostSubnet: 24 }] } }), note + ' Each node receives a subnet.'],
    ['Use a dual-stack Layer 2 network', wrap({ topology: 'Layer2', layer2: { role: 'Primary', subnets: ['10.202.0.0/16', 'fd00:202::/60'] } }), note + ' Requires a dual-stack cluster and suitable address planning.'],
  ]);
}
add('k8s.ovn.org/v1', 'EgressIP', docs.network, [
  ['Assign a source IP to a selected namespace', { spec: { namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'example-project' } }, egressIPs: ['192.0.2.50'] } }, 'Replace with an available address on your egress network; eligible nodes need the egress-assignable label. Check status assignments.'],
  ['Limit an egress IP to selected Pods', { spec: { namespaceSelector: { matchLabels: { 'example.com/team': 'analytics' } }, podSelector: { matchLabels: { app: 'example-client' } }, egressIPs: ['192.0.2.51'] } }, 'Namespace and Pod selectors are combined. Avoid overlapping EgressIP selections.'],
  ['Request multiple egress addresses', { spec: { namespaceSelector: { matchLabels: { 'example.com/egress-pool': 'demo' } }, egressIPs: ['192.0.2.52', '192.0.2.53'] } }, 'Requires enough eligible nodes and addresses. Do not assume a particular Pod always uses the same address.'],
]);
const denyAll = { type: 'Deny', to: { cidrSelector: '0.0.0.0/0' } };
add('k8s.ovn.org/v1', 'EgressFirewall', docs.network, [
  ['Allow an external subnet, then deny other IPv4 destinations', { spec: { egress: [{ type: 'Allow', to: { cidrSelector: '198.51.100.0/24' } }, denyAll] } }, 'Use metadata.name: default in the namespace. Order matters. Plan required DNS/API destinations and IPv6 rules separately.'],
  ['Allow HTTPS to an external DNS name', { spec: { egress: [{ type: 'Allow', to: { dnsName: 'api.example.com' }, ports: [{ protocol: 'TCP', port: 443 }] }, denyAll] } }, 'Use metadata.name: default. DNS-name handling depends on OVN-Kubernetes; ensure DNS and other required flows remain usable.'],
  ['Block a destination while allowing other IPv4 traffic', { spec: { egress: [{ type: 'Deny', to: { cidrSelector: '203.0.113.0/24' } }, { type: 'Allow', to: { cidrSelector: '0.0.0.0/0' } }] } }, 'Illustrative destination block. Replace the documentation-only subnet and consider IPv6 separately.'],
]);
add('k8s.ovn.org/v1', 'EgressQoS', docs.network, [
  ['Mark all namespace egress with a DSCP value', { spec: { egress: [{ dscp: 10 }] } }, 'Use metadata.name: default. Marking does not reserve bandwidth; network devices must implement the intended QoS policy.'],
  ['Mark selected application traffic', { spec: { egress: [{ dscp: 26, podSelector: { matchLabels: { app: 'example-video' } } }] } }, 'Choose DSCP values coordinated with your network team.'],
  ['Mark traffic to a destination subnet', { spec: { egress: [{ dscp: 18, dstCIDR: '198.51.100.0/24', podSelector: { matchLabels: { app: 'example-client' } } }] } }, 'Applies the marking only to matching Pods and destination range.'],
]);
add('k8s.ovn.org/v1', 'EgressService', 'https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/network_apis/egressservice-k8s-ovn-org-v1', [
  ['Use the LoadBalancer IP as the egress source', { spec: { sourceIPBy: 'LoadBalancerIP' } }, 'Create with the same name and namespace as an existing LoadBalancer Service. Requires the appropriate network implementation.'],
  ['Restrict egress handling to labeled nodes', { spec: { sourceIPBy: 'LoadBalancerIP', nodeSelector: { matchLabels: { 'example.com/egress-node': 'true' } } } }, 'Select nodes that can reach the destination network and host the service traffic.'],
  ['Use a secondary routing table', { spec: { sourceIPBy: 'Network', network: '100' } }, 'Requires routing table 100 and routes configured on eligible nodes. The network value identifies a routing table, not a NAD name.'],
]);
add('k8s.ovn.org/v1', 'AdminPolicyBasedExternalRoute', docs.network, [
  ['Route selected namespaces through a static gateway', { spec: { from: { namespaceSelector: { matchLabels: { 'example.com/external-route': 'enabled' } } }, nextHops: { static: [{ ip: '192.0.2.1' }] } } }, 'Gateway must be reachable through the appropriate external network. Verify routing and return paths.'],
  ['Monitor a static next hop with BFD', { spec: { nextHops: { static: [{ ip: '192.0.2.1', bfdEnabled: true }] } } }, 'Requires BFD support and configuration on the gateway; preserve the namespace selection.'],
  ['Select dynamic gateway Pods', { spec: { from: { namespaceSelector: { matchLabels: { 'example.com/external-route': 'enabled' } } }, nextHops: { dynamic: [{ namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'example-gateways' } }, podSelector: { matchLabels: { app: 'example-gateway' } }, networkAttachmentName: 'example-external' }] } } }, 'Requires functioning gateway Pods with the specified secondary attachment and routing setup.'],
]);
add('operator.openshift.io/v1', 'IngressController', docs.network, [
  ['Scale the ingress router', { spec: { replicas: 3 } }, 'For an existing IngressController in openshift-ingress-operator; ensure node capacity and publishing configuration support the replicas.'],
  ['Place routers on labeled nodes', { spec: { nodePlacement: { nodeSelector: { matchLabels: { 'example.com/router-node': 'true' } } } } }, 'Label the intended nodes; add suitable tolerations if those nodes are tainted.'],
  ['Shard routes by label', { spec: { routeSelector: { matchLabels: { 'example.com/route-shard': 'internal' } } } }, 'Coordinate selectors across ingress controllers and use suitable domain/DNS configuration. This does not alone make traffic private.'],
  ['Use a custom default certificate', { spec: { defaultCertificate: { name: 'example-wildcard-tls' } } }, 'Certificate Secret must be in openshift-ingress and cover the router domain.'],
]);
add('sriovnetwork.openshift.io/v1', 'SriovNetworkNodePolicy', docs.sriov, [
  ['Create VFs on a secondary physical function', { spec: { resourceName: 'example_sriov', nodeSelector: { 'example.com/sriov-node': 'true' }, priority: 99, numVfs: 4, nicSelector: { pfNames: ['ens2f0'] }, deviceType: 'netdevice' } }, 'Create in the SR-IOV operator namespace. Replace PF name and verify hardware VF capacity; policy rollout may disrupt node networking.'],
  ['Use VFIO devices for userspace networking', { spec: { resourceName: 'example_dpdk', nodeSelector: { 'example.com/sriov-node': 'true' }, priority: 90, numVfs: 4, nicSelector: { pfNames: ['ens2f1'] }, deviceType: 'vfio-pci' } }, 'Requires IOMMU and supported hardware/driver configuration. Use a separate eligible PF.'],
  ['Set the SR-IOV interface MTU', { spec: { mtu: 9000 } }, 'Merge with a complete policy. Physical links and downstream devices must support the chosen MTU.'],
]);
add('sriovnetwork.openshift.io/v1', 'SriovNetwork', docs.sriov, [
  ['Publish an SR-IOV attachment to a workload namespace', { spec: { resourceName: 'example_sriov', networkNamespace: 'example-project', ipam: JSON.stringify({ type: 'whereabouts', range: '192.0.2.0/24' }, null, 2) } }, 'Create in the operator namespace. The resourceName must match a node policy and Whereabouts must be available.'],
  ['Assign a VLAN to an SR-IOV attachment', { spec: { resourceName: 'example_sriov', networkNamespace: 'example-project', vlan: 100 } }, 'Coordinate VLAN settings with the upstream switch; retain appropriate IPAM configuration.'],
  ['Enable spoof checking for VFs', { spec: { spoofChk: 'on', trust: 'off' } }, 'Merge with the existing network. Confirm driver support and workload requirements before changing VF security settings.'],
]);
add('operator.openshift.io/v1', 'DNS', 'https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/networking_operators/dns-operator', [
  ['Forward an internal DNS zone', { spec: { servers: [{ name: 'example-internal', zones: ['corp.example.com'], forwardPlugin: { policy: 'Sequential', upstreams: ['192.0.2.53'] } }] } }, 'Use the operator DNS resource named default. Replace the resolver address and preserve other forwarding rules.'],
  ['Choose explicit default upstream resolvers', { spec: { upstreamResolvers: { policy: 'Sequential', upstreams: [{ type: 'Network', address: '192.0.2.53', port: 53 }, { type: 'Network', address: '192.0.2.54', port: 53 }] } } }, 'Resolvers must be reachable and capable of resolving all required non-cluster names.'],
  ['Enable operator diagnostic logging', { spec: { operatorLogLevel: 'Debug' } }, 'Temporarily increases operator logging; restore the desired normal level after troubleshooting.'],
]);
add('operator.openshift.io/v1', 'Network', 'https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html/networking_operators/cluster-network-operator', [
  ['Enable network operand debug logging', { spec: { logLevel: 'Debug' } }, 'Use the operator Network resource named cluster. Restore Normal after troubleshooting.'],
  ['Enable Cluster Network Operator debug logging', { spec: { operatorLogLevel: 'Debug' } }, 'Controls the operator logs rather than the managed networking components.'],
  ['Manage a secondary macvlan attachment with the CNO', { spec: { additionalNetworks: [{ name: 'example-secondary', namespace: 'example-project', type: 'Raw', rawCNIConfig: JSON.stringify({ cniVersion: '0.3.1', name: 'example-secondary', type: 'macvlan', master: 'eth1', mode: 'bridge', ipam: { type: 'whereabouts', range: '192.0.2.0/24' } }, null, 2) }] } }, 'Requires a suitable secondary interface and CNI plugins. Preserve existing additionalNetworks; choose either operator management or direct NAD management for an attachment.'],
]);
add('kubevirt.io/v1', 'VirtualMachine', 'https://kubevirt.io/user-guide/', [
  ['Choose manual start and stop behavior', { spec: { runStrategy: 'Manual' } }, 'Use runStrategy instead of the mutually exclusive legacy running field. The remainder of the VM template is required.'],
  ['Configure guest CPU and memory', { spec: { template: { spec: { domain: { cpu: { cores: 2 }, resources: { requests: { memory: '4Gi' } } } } } } }, 'Merge into the existing template. Instance types/preferences may manage these values; some changes require restart.'],
  ['Attach an existing disk PVC', { spec: { template: { spec: { domain: { devices: { disks: [{ name: 'rootdisk', disk: { bus: 'virtio' } }] } }, volumes: [{ name: 'rootdisk', persistentVolumeClaim: { claimName: 'example-vm-disk' } }] } } } }, 'The PVC must contain a suitable VM disk. Preserve other disks and volumes when merging.'],
  ['Attach a secondary bridge network', { spec: { template: { spec: { domain: { devices: { interfaces: [{ name: 'secondary', bridge: {} }] } }, networks: [{ name: 'secondary', multus: { networkName: 'example-project/example-bridge' } }] } } } }, 'Requires the NAD and host network. Preserve the VM’s primary interface/network and check migration requirements.'],
]);
add('cdi.kubevirt.io/v1beta1', 'DataVolume', 'https://github.com/kubevirt/containerized-data-importer/blob/main/doc/datavolumes.md', [
  ['Import a disk image over HTTPS', { spec: { source: { http: { url: 'https://images.example.com/example.qcow2' } }, storage: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '30Gi' } } } } }, 'Replace the illustrative URL with a trusted reachable image; requires a default or selected StorageClass.'],
  ['Clone a disk from an existing PVC', { spec: { source: { pvc: { namespace: 'example-project', name: 'example-source-disk' } }, storage: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '30Gi' } } } } }, 'Requires clone permissions and compatible storage; requested capacity must accommodate the source.'],
  ['Prepare a volume for upload', { spec: { source: { upload: {} }, storage: { accessModes: ['ReadWriteOnce'], resources: { requests: { storage: '30Gi' } } } } }, 'Upload disk data through the console or virtctl after the DataVolume/PVC is ready for upload.'],
]);
add('serving.kserve.io/v1beta1', 'InferenceService', 'https://kserve.github.io/website/docs/model-serving/predictive-inference/', [
  ['Serve a model from a persistent volume', { spec: { predictor: { model: { modelFormat: { name: 'sklearn' }, storageUri: 'pvc://example-models/model' } } } }, 'Requires the model files and a compatible installed ServingRuntime. Replace the model format to match the artifact.'],
  ['Set predictor resource budgets', { spec: { predictor: { model: { resources: { requests: { cpu: '1', memory: '2Gi' }, limits: { cpu: '2', memory: '4Gi' } } } } } }, 'Merge with the existing model configuration. Runtime requirements can exceed these example values.'],
  ['Keep a predictor warm and bound scaling', { spec: { predictor: { minReplicas: 1, maxReplicas: 3 } } }, 'Scaling behavior depends on the deployment mode and configured autoscaling components.'],
]);
add('serving.kserve.io/v1alpha1', 'LLMInferenceService', 'https://kserve.github.io/website/docs/model-serving/generative-inference/llmisvc/llmisvc-configuration', [
  ['Load a model from a PVC', { spec: { model: { uri: 'pvc://example-models/model', name: 'example-model' } } }, 'Requires valid cached model files and a compatible installed serving configuration. Verify fields against your installed RHOAI/KServe version.'],
  ['Use a fixed replica count', { spec: { replicas: 2 } }, 'Model replicas are not GPU pipeline stages. Ensure enough capacity and do not combine with a mutually exclusive scaling configuration.'],
  ['Request one GPU for the leader template', { spec: { template: { containers: [{ name: 'main', resources: { limits: { 'nvidia.com/gpu': '1' } } }] } } }, 'Preserve the installed template/container name and runtime settings. Multi-node services need matching worker configuration; this is not a full distributed deployment recipe.'],
]);
add('leaderworkerset.x-k8s.io/v1', 'LeaderWorkerSet', 'https://lws.sigs.k8s.io/docs/concepts/', [
  ['Choose group count and group size', { spec: { replicas: 2, leaderWorkerTemplate: { size: 3 } } }, 'Creates two groups of three Pods each (one leader and two workers). Complete leader/worker templates are required.'],
  ['Target a GPU node pool', { spec: { leaderWorkerTemplate: { leaderTemplate: { spec: { nodeSelector: { 'example.com/accelerator': 'gpu' } } }, workerTemplate: { spec: { nodeSelector: { 'example.com/accelerator': 'gpu' } } } } } }, 'Merge node selectors into both templates and retain container/resource settings.'],
  ['Request a GPU in each worker', { spec: { leaderWorkerTemplate: { workerTemplate: { spec: { containers: [{ name: 'main', image: 'example.invalid/model-server:replace-me', resources: { limits: { 'nvidia.com/gpu': '1' } } }] } } } } }, 'Replace the placeholder image and preserve actual container names/commands. If an LLMInferenceService owns this object, edit the parent instead.'],
]);

// Controller-produced state is not a configuration API. Show the owning configuration explicitly.
const related: Record<string, { key: string; explanation: string }> = {
  'nmstate.io/NodeNetworkState': { key: 'nmstate.io/NodeNetworkConfigurationPolicy', explanation: 'NodeNetworkState reports observed state. Request VLAN/MTU/interface changes through a NodeNetworkConfigurationPolicy.' },
  'nmstate.io/NodeNetworkConfigurationEnactment': { key: 'nmstate.io/NodeNetworkConfigurationPolicy', explanation: 'Enactments report policy application. Configure the NodeNetworkConfigurationPolicy rather than editing enactment status.' },
  'sriovnetwork.openshift.io/SriovNetworkNodeState': { key: 'sriovnetwork.openshift.io/SriovNetworkNodePolicy', explanation: 'Node state is reported by the operator. Use a SriovNetworkNodePolicy to request device configuration.' },
  'kubevirt.io/VirtualMachineInstance': { key: 'kubevirt.io/VirtualMachine', explanation: 'For a managed running instance, change its owning VirtualMachine template. These examples target VirtualMachine, not instance status.' },
  'discovery.k8s.io/EndpointSlice': { key: '/Service', explanation: 'Selector-based Service endpoints are controller-managed. These examples configure their Service rather than editing generated endpoints.' },
  '/Endpoints': { key: '/Service', explanation: 'Legacy endpoints are normally controller-managed. These examples configure the associated Service.' },
  'config.openshift.io/DNS': { key: 'operator.openshift.io/DNS', explanation: 'For DNS forwarding and diagnostics, configure DNS.operator.openshift.io/default. These examples do not change cluster base-domain configuration.' },
  'config.openshift.io/Network': { key: 'operator.openshift.io/Network', explanation: 'These day-two examples target Network.operator.openshift.io/cluster, not installation-time cluster/service network ranges.' },
};
export function resourceExamples(type: Pick<ResourceType, 'group' | 'kind'>): { examples: ResourceExample[]; explanation?: string } {
  const key = `${type.group}/${type.kind}`, alias = related[key];
  return { examples: exampleCatalog[alias?.key || key] || [], explanation: alias?.explanation };
}
