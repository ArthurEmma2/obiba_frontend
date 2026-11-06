import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const operations = JSON.parse(readFileSync(join(root, 'src/lib/graphql/operations.json'), 'utf8'));

const manifest = {};
for (const [name, document] of Object.entries(operations)) {
  if (typeof document !== 'string' || !new RegExp(`^(query|mutation|subscription) ${name}\\b`).test(document)) {
    throw new Error(`Operation ${name} must be a string named ${name}`);
  }
  manifest[createHash('sha256').update(document, 'utf8').digest('hex')] = document;
}

const out = join(root, 'persisted-operations.json');
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Wrote ${Object.keys(manifest).length} persisted operations to ${out}\n`);
