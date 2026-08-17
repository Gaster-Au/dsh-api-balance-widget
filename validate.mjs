import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const repo = process.argv[2];
for (const f of ['host.js', 'client.js']) {
  const file = join(repo, 'plugin', f);
  const code = readFileSync(file, 'utf8');
  try {
    new Function('return (async () => {\n' + code + '\n})()');
    console.log(f + ': parse OK');
  } catch (e) {
    console.log(f + ': PARSE ERROR: ' + e.message);
  }
}
