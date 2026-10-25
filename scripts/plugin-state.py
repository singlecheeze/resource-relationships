#!/usr/bin/env python3
"""Enable/disable only this plugin, guarding concurrent console configuration changes."""
import json
import subprocess
import sys

NAME = 'resource-relationships'

def updated_plugins(existing, enable):
    if enable:
        return existing if NAME in existing else existing + [NAME]
    return [name for name in existing if name != NAME]

def main():
    if len(sys.argv) != 2 or sys.argv[1] not in ('enable', 'disable'):
        raise SystemExit('Usage: plugin-state.py enable|disable')
    for _ in range(5):
        config = json.loads(subprocess.check_output(['oc', 'get', 'console.operator.openshift.io', 'cluster', '-o', 'json']))
        old = config.get('spec', {}).get('plugins', [])
        new = updated_plugins(old, sys.argv[1] == 'enable')
        if old == new:
            print('Plugin configuration already correct.')
            return
        patch = [
            {'op': 'test', 'path': '/metadata/resourceVersion', 'value': config['metadata']['resourceVersion']},
            {'op': 'add', 'path': '/spec/plugins', 'value': new},
        ]
        result = subprocess.run(['oc', 'patch', 'console.operator.openshift.io', 'cluster', '--type=json', '-p', json.dumps(patch)], capture_output=True, text=True)
        if result.returncode == 0:
            print(result.stdout.strip())
            return
        if not any(s in result.stderr.lower() for s in ['conflict', 'test failed', 'test operation', 'object has been modified']):
            raise SystemExit(result.stderr)
    raise SystemExit('Console config kept changing. Retry after other console updates finish.')

if __name__ == '__main__':
    main()
