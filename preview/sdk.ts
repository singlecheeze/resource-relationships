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
    onChange: (event: any) => props.onChange(event.target.value) });
});
