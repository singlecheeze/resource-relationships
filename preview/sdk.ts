import * as React from 'react';
export async function consoleFetch(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.json();
    const error: any = new Error(body.message || response.statusText);
    error.status = response.status; throw error;
  }
  return response;
}

// DOM harness substitute only. Production imports CodeEditor from the host console.
export const CodeEditor = React.forwardRef(function CodeEditor(props: any, _ref: any) {
  return React.createElement('textarea', { 'aria-label': props.options?.ariaLabel || 'Resource YAML', value: props.value, readOnly: props.options?.readOnly,
    'data-editor-height': props.height, 'data-editor-full-height': String(props.isFullHeight),
    onChange: (event: any) => props.onChange(event.target.value) });
});

// Native project selector substitute for local tests only.
let activeNamespace = 'default';
const namespaceListeners = new Set<() => void>();
const setActiveNamespace = (value: string) => { activeNamespace = value; namespaceListeners.forEach(listener => listener()); };
export function useActiveNamespace(): [string, (value: string) => void] {
  return [React.useSyncExternalStore(listener => { namespaceListeners.add(listener); return () => { namespaceListeners.delete(listener); }; }, () => activeNamespace), setActiveNamespace];
}
export const isAllNamespacesKey = (value: string) => value === '#ALL_NS#';
export function NamespaceBar() {
  const [namespace, setNamespace] = useActiveNamespace();
  return React.createElement('select', { 'aria-label': 'Project', value: namespace, onChange: (event: any) => setNamespace(event.target.value) },
    ...['default', 'other', '#ALL_NS#'].map(value => React.createElement('option', { key: value, value }, value === '#ALL_NS#' ? 'All projects' : value)));
}
