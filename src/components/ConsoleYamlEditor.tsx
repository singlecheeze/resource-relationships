import * as React from 'react';
import { CodeEditor } from '@openshift-console/dynamic-plugin-sdk';
import { SchemaBundle, schemaSuggestions } from '../lib/schema';

type Props = { value: string; readOnly: boolean; schema?: SchemaBundle; onChange: (value: string) => void; onSave: () => void };
/** Use the host console editor and its Monaco instance. Never bundle a second editor or reset global YAML configuration. */
export function ConsoleYamlEditor({ value, readOnly, schema, onChange, onSave }: Props) {
  const [instance, setInstance] = React.useState<{ editor: any; monaco: any }>();
  const capture = React.useCallback((handle: { editor: any; monaco: any } | null) => {
    if (handle?.editor && handle.monaco) setInstance(old => old?.editor === handle.editor && old?.monaco === handle.monaco ? old : handle);
  }, []);
  React.useEffect(() => {
    if (!instance || !schema || readOnly) return;
    const { editor, monaco } = instance;
    const model = editor.getModel();
    if (!model) return;
    const provider = monaco.languages.registerCompletionItemProvider('yaml', {
      triggerCharacters: [' ', ':'],
      provideCompletionItems: (candidate: any, position: any) => {
        if (candidate !== model) return { suggestions: [] };
        const result = schemaSuggestions(schema, candidate.getValue(), position.lineNumber, position.column);
        if (!result) return { suggestions: [] };
        return { suggestions: result.items.map(item => ({
          label: item.label, detail: item.detail, documentation: { value: item.documentation, isTrusted: false },
          insertText: item.insertText, kind: result.context.value ? monaco.languages.CompletionItemKind.Value : monaco.languages.CompletionItemKind.Property,
          insertTextRules: item.snippet ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
          range: { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: result.context.startColumn, endColumn: position.column },
          sortText: `0-${item.label}`,
        })) };
      },
    });
    return () => provider.dispose();
  }, [instance, schema, readOnly]);
  return <CodeEditor ref={capture} value={value} language="yaml" minHeight="52vh" showShortcuts
    options={{ readOnly, automaticLayout: true, ariaLabel: 'Resource YAML', tabSize: 2, insertSpaces: true,
      quickSuggestions: { other: true, comments: false, strings: false }, suggest: { preview: true }, wordBasedSuggestions: 'off' }}
    onEditorDidMount={(editor: any, monaco: any) => capture({ editor, monaco })}
    onChange={(next: string) => onChange(next)} onSave={onSave} />;
}
