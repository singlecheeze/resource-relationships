import * as React from 'react';
import { ExpandableSection } from '@patternfly/react-core';
import { CodeEditor } from '@openshift-console/dynamic-plugin-sdk';
import { ResourceType } from '../lib/model';
import { resourceExamples, ResourceExample } from '../lib/resource-examples';

function ExampleSection({ example }: { example: ResourceExample }) {
  const [expanded, setExpanded] = React.useState(false);
  const id = React.useId();
  return <div className="resource-relationships__example">
    <ExpandableSection toggleText={example.title} toggleWrapper="h4" isExpanded={expanded}
      toggleId={`${id}-toggle`} contentId={`${id}-content`} onToggle={(_event, next) => setExpanded(next)}>
      {expanded && <>
        <p className="resource-relationships__muted">{example.kind} · {example.apiVersion} · {example.format === 'manifest' ? 'Example manifest' : 'Configuration fragment'} · Read-only</p>
        <p>{example.note}</p>
        <CodeEditor value={example.yaml} language="yaml" minHeight="16rem" height="22rem" showShortcuts={false}
          options={{ readOnly: true, domReadOnly: true, automaticLayout: true, ariaLabel: `Example YAML: ${example.title}`,
            tabSize: 2, insertSpaces: true, minimap: { enabled: false }, wordWrap: 'on', scrollBeyondLastLine: false }}
          onSave={() => undefined} />
        <p><a href={example.source} target="_blank" rel="noopener noreferrer">Configuration reference (opens a new tab)</a></p>
      </>}
    </ExpandableSection>
  </div>;
}

export function ResourceExamples({ type }: { type: ResourceType }) {
  const { examples, explanation } = resourceExamples(type);
  return <section className="resource-relationships__examples" aria-label={`Configuration examples for ${type.kind}`}>
    <h3>Configuration examples</h3>
    <p className="resource-relationships__muted">{examples.length ? 'Expand a use case to view its YAML. Examples never change your draft or apply to the cluster.' : 'No curated examples are available for this API kind yet.'}</p>
    {explanation && <p>{explanation}</p>}
    {examples.length > 0 && <p className="resource-relationships__muted">Replace example values and check your installed API schema. Fragments omit required fields; merge only the intended fields into a complete configuration.</p>}
    {examples.map(example => <ExampleSection key={example.id} example={example} />)}
  </section>;
}
