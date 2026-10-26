import * as React from 'react';
import { Button, ExpandableSection, Popover, Tooltip } from '@patternfly/react-core';
import { QuestionCircleIcon } from '@patternfly/react-icons';
import { LoadedResource } from '../lib/model';
import { SchemaBundle } from '../lib/schema';
import { resourceHelp } from '../lib/resource-help';

export function ResourceAbout({ resource, schema }: { resource: LoadedResource; schema?: SchemaBundle }) {
  const [expanded, setExpanded] = React.useState(false);
  const id = React.useId();
  const help = resourceHelp(resource.type, schema);
  return <section className="resource-relationships__about" aria-label={`About ${resource.object.kind}`}>
    <ExpandableSection toggleText={`About ${resource.object.kind}`} toggleWrapper="h3"
      toggleId={`${id}-toggle`} contentId={`${id}-content`} isExpanded={expanded}
      onToggle={(_event, next) => setExpanded(next)}>
      <p>{help.text}</p>
      <dl className="resource-relationships__resource-meta">
        <dt>API version</dt><dd>{resource.object.apiVersion}</dd>
        <dt>Scope</dt><dd>{resource.type.namespaced ? `Namespace: ${resource.object.metadata.namespace}` : 'Cluster scoped'}</dd>
      </dl>
      <small className="resource-relationships__muted">{help.source}</small>
    </ExpandableSection>
  </section>;
}

export function EditorHelp() {
  return <Popover headerContent="YAML editor help" aria-label="YAML editor help" position="auto"
    maxWidth="36rem" closeBtnAriaLabel="Close YAML editor help"
    bodyContent={<div className="resource-relationships__editor-help">
      <h3>Edit and save</h3>
      <ol>
        <li>Edit the resource in its tab. Each tab keeps its own draft; <strong>*</strong> marks unsaved changes.</li>
        <li>Choose <strong>Validate on server</strong>. Validation checks the draft without saving it.</li>
        <li>Choose <strong>Save changes</strong> and confirm. Any further edit requires validation again.</li>
      </ol>
      <h3>Keyboard shortcuts</h3>
      <dl>
        <dt><kbd>Ctrl</kbd> + <kbd>Space</kbd></dt><dd>Show schema field and value suggestions when available.</dd>
        <dt><kbd>↑</kbd> / <kbd>↓</kbd></dt><dd>Move through the suggestion list while it is open.</dd>
        <dt><kbd>Tab</kbd> / <kbd>Enter</kbd></dt><dd>Accept a selected suggestion while the suggestion list is open.</dd>
        <dt><kbd>Esc</kbd></dt><dd>Dismiss suggestions without inserting preview text.</dd>
        <dt><kbd>Ctrl</kbd> / <kbd>Cmd</kbd> + <kbd>S</kbd></dt><dd>Request a save only after the exact draft has passed validation. Confirmation is still required.</dd>
      </dl>
      <h3>Suggestions and drafts</h3>
      <p>Faded suggestion previews are not saved until accepted. Fill accepted fields, remove them, or explicitly enter <code>null</code> where intended; empty values are blocked. Schema access may be unavailable. The editor’s <strong>View Shortcuts</strong> menu lists additional native editor commands.</p>
      <p><strong>Reload YAML</strong> replaces your draft after confirmation. Conflicts preserve your edits; copy them, reload the latest object, and reapply. Refreshing the tree preserves tabs, but leaving this page or refreshing the browser can lose drafts.</p>
      <p>Edits use your permissions. Read-only resources cannot be saved. Status and managed fields are excluded; saving replaces editable fields, so removing a field may clear it.</p>
    </div>}>
    <Tooltip content="YAML editor help and keyboard shortcuts">
      <Button variant="plain" aria-label="YAML editor help and keyboard shortcuts" className="resource-relationships__help-button"
        icon={<QuestionCircleIcon aria-hidden="true" />} />
    </Tooltip>
  </Popover>;
}
