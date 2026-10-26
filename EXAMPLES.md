# Configuration example inventory

Examples are reference material. Most are partial configurations; the UI labels fragments and manifests explicitly. Check installed API versions and prerequisites before using them. Observed-state kinds show their corresponding configuration kind with an explanation.

| API group / kind | Use cases |
|---|---|
| /ConfigMap | Store application settings; Store a configuration file; Make configuration immutable |
| /Namespace | Label a namespace for policy selection; Audit Pod security against restricted rules; Record ownership information |
| /Node | Label a node for workload placement; Reserve a node with a NoSchedule taint; Prevent new Pod scheduling |
| /PersistentVolume | Define static NFS storage; Retain storage after releasing a claim; Use NFS v4.1 mount options |
| /PersistentVolumeClaim | Request dynamically provisioned storage; Request shared filesystem storage; Expand an existing claim |
| /Pod | Set CPU and memory budgets; Mount configuration from a ConfigMap; Attach a secondary network |
| /Secret | Store a credential using stringData; Reference a TLS key pair; Make a Secret immutable |
| /Service | Expose Pods inside the cluster; Create a headless discovery Service; Request an external load balancer; Alias an external DNS name |
| /ServiceAccount | Disable automatic token mounting; Use an image pull secret; Grant namespace read access with a RoleBinding |
| apps/DaemonSet | Target a labeled node pool; Limit disruption during updates; Tolerate a dedicated node taint |
| apps/Deployment | Scale to three replicas; Roll out without reducing available replicas; Add HTTP readiness and liveness checks; Set container resource requests and limits |
| apps/ReplicaSet | Set the replica count; Match Pods with a template label; Set resources on a new Pod template |
| apps/StatefulSet | Give each replica its own persistent volume; Stage a rolling update with a partition; Create Pods in parallel |
| batch/CronJob | Schedule a daily run in UTC; Prevent overlapping executions; Pause scheduling and limit retained history |
| batch/Job | Retry a finite batch task; Run multiple work items; Set a deadline and clean up completed Jobs |
| cdi.kubevirt.io/DataVolume | Import a disk image over HTTPS; Clone a disk from an existing PVC; Prepare a volume for upload |
| gateway.networking.k8s.io/Gateway | Listen for HTTP on port 80; Terminate HTTPS with a certificate; Accept routes from selected namespaces |
| gateway.networking.k8s.io/GatewayClass | Associate a class with its controller; Reference controller-specific parameters; Document class ownership |
| gateway.networking.k8s.io/GRPCRoute | Send gRPC traffic to a backend; Match one gRPC method; Canary a gRPC backend |
| gateway.networking.k8s.io/HTTPRoute | Route a hostname to a Service; Split traffic between two versions; Redirect HTTP requests to HTTPS |
| gateway.networking.k8s.io/ReferenceGrant | Allow an HTTPRoute to reference Services; Restrict permission to a named Service; Allow a Gateway to reference a TLS Secret |
| gateway.networking.k8s.io/TCPRoute | Forward to a single backend; Weight two backends; Reference a backend in another namespace |
| gateway.networking.k8s.io/TLSRoute | Forward to a single backend; Weight two backends; Reference a backend in another namespace |
| gateway.networking.k8s.io/UDPRoute | Forward to a single backend; Weight two backends; Reference a backend in another namespace |
| k8s.cni.cncf.io/NetworkAttachmentDefinition | Attach Pods to an existing Linux bridge; Create a macvlan secondary attachment; Use a VLAN-tagged bridge attachment |
| k8s.ovn.org/AdminPolicyBasedExternalRoute | Route selected namespaces through a static gateway; Monitor a static next hop with BFD; Select dynamic gateway Pods |
| k8s.ovn.org/ClusterUserDefinedNetwork | Create a primary Layer 2 tenant network; Create a primary Layer 3 tenant network; Use a dual-stack Layer 2 network |
| k8s.ovn.org/EgressFirewall | Allow an external subnet, then deny other IPv4 destinations; Allow HTTPS to an external DNS name; Block a destination while allowing other IPv4 traffic |
| k8s.ovn.org/EgressIP | Assign a source IP to a selected namespace; Limit an egress IP to selected Pods; Request multiple egress addresses |
| k8s.ovn.org/EgressQoS | Mark all namespace egress with a DSCP value; Mark selected application traffic; Mark traffic to a destination subnet |
| k8s.ovn.org/EgressService | Use the LoadBalancer IP as the egress source; Restrict egress handling to labeled nodes; Use a secondary routing table |
| k8s.ovn.org/UserDefinedNetwork | Create a primary Layer 2 tenant network; Create a primary Layer 3 tenant network; Use a dual-stack Layer 2 network |
| kubevirt.io/VirtualMachine | Choose manual start and stop behavior; Configure guest CPU and memory; Attach an existing disk PVC; Attach a secondary bridge network |
| leaderworkerset.x-k8s.io/LeaderWorkerSet | Choose group count and group size; Target a GPU node pool; Request a GPU in each worker |
| networking.k8s.io/Ingress | Route a hostname and path to a Service; Use a TLS certificate Secret; Set a default backend |
| networking.k8s.io/IngressClass | Select the ingress controller implementation; Mark a class as the default; Keep a class opt-in |
| networking.k8s.io/NetworkPolicy | Default-deny inbound traffic; Allow a frontend to reach an API; Allow traffic from a labeled namespace; Allow DNS to the OpenShift DNS namespace |
| nmstate.io/NodeNetworkConfigurationPolicy | Add VLAN 100 on a secondary NIC; Set a secondary NIC MTU to 9000; Create an active-backup bond; Create an L2 Linux bridge for VMs; Add a static secondary-network route |
| operator.openshift.io/DNS | Forward an internal DNS zone; Choose explicit default upstream resolvers; Enable operator diagnostic logging |
| operator.openshift.io/IngressController | Scale the ingress router; Place routers on labeled nodes; Shard routes by label; Use a custom default certificate |
| operator.openshift.io/Network | Enable network operand debug logging; Enable Cluster Network Operator debug logging; Manage a secondary macvlan attachment with the CNO |
| policy.networking.k8s.io/AdminNetworkPolicy | Select a tenant namespace group; Deny selected namespaces as inbound peers; Allow outbound HTTPS to a destination network |
| policy.networking.k8s.io/BaselineAdminNetworkPolicy | Select a tenant namespace group; Deny selected namespaces as inbound peers; Allow outbound HTTPS to a destination network |
| route.openshift.io/Route | Expose an HTTP Service; Terminate TLS at the router; Pass TLS through to the application |
| serving.kserve.io/InferenceService | Serve a model from a persistent volume; Set predictor resource budgets; Keep a predictor warm and bound scaling |
| serving.kserve.io/LLMInferenceService | Load a model from a PVC; Use a fixed replica count; Request one GPU for the leader template |
| sriovnetwork.openshift.io/SriovNetwork | Publish an SR-IOV attachment to a workload namespace; Assign a VLAN to an SR-IOV attachment; Enable spoof checking for VFs |
| sriovnetwork.openshift.io/SriovNetworkNodePolicy | Create VFs on a secondary physical function; Use VFIO devices for userspace networking; Set the SR-IOV interface MTU |
| storage.k8s.io/StorageClass | Allow supported volume expansion; Delay binding until a consumer is scheduled; Retain newly provisioned volumes |
