import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
test('production styling uses known semantic tokens and has no global theme/font imports', () => {
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]);
  const source = files('src').map(p => readFileSync(p, 'utf8')).join('\n');
  const css = readFileSync('src/components/relationships.css', 'utf8');
  const pf = readFileSync('node_modules/@patternfly/react-core/dist/styles/base.css', 'utf8');
  assert.doesNotMatch(css, /#[a-f\d]{3,8}\b|\b(?:rgb|hsl)a?\(|@font-face|\.pf-|\.co-/i);
  assert.doesNotMatch(source, /import\s+['"]@patternfly\/.*\.css/);
  for (const [, token] of css.matchAll(/var\((--pf-[\w-]+)/g)) assert.ok(pf.includes(`${token}:`), `Unknown PatternFly token ${token}`);
  assert.match(source, /import \{ CodeEditor \} from '@openshift-console\/dynamic-plugin-sdk'/);
  assert.doesNotMatch(source, /<textarea|from ['"]monaco-editor['"]|setTheme\(/);
});
