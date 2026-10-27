import { CubeIcon, NetworkWiredIcon, DatabaseIcon, ServerIcon, ShieldAltIcon, CogIcon, ProjectDiagramIcon, FolderIcon, ClockIcon, RobotIcon, LayerGroupIcon } from '@patternfly/react-icons';

export function treeIcon(label: string) {
  const Icon = /policy|firewall|grant|secret|account/i.test(label) ? ShieldAltIcon
    : /volume|storage|claim|data/i.test(label) ? DatabaseIcon
    : /inference|workerSet|ai.serv/i.test(label) ? RobotIcon
    : /cron|job/i.test(label) ? ClockIcon
    : /node|infrastructure|virtualmachine/i.test(label) ? ServerIcon
    : /network|route|gateway|ingress|egress|service|endpoint|dns/i.test(label) ? NetworkWiredIcon
    : /config/i.test(label) ? CogIcon
    : /project|namespace|cluster/i.test(label) ? FolderIcon
    : /deployment|replicaset|statefulset|daemonset/i.test(label) ? LayerGroupIcon
    : /owns|uses|selects|related|runs|mounts|bound/i.test(label) ? ProjectDiagramIcon
    : CubeIcon;
  return <Icon aria-hidden="true" />;
}
