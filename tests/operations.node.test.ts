import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSchema, parse, validate } from 'graphql';
import { describe, expect, it } from 'vitest';
import operations from '@/lib/graphql/operations.json';
import { operationHash } from '@/lib/graphql/client';
import type { OperationName } from '@/lib/graphql/types';

const schema = buildSchema(readFileSync(join(__dirname, 'fixtures/schema.graphql'), 'utf8'));

describe('GraphQL operations', () => {
  it.each(Object.entries(operations))('%s is valid against the locked API schema', (name, doc) => {
    const ast = parse(doc);
    expect(validate(schema, ast)).toEqual([]);
    const def = ast.definitions[0] as { name?: { value: string } };
    expect(def.name?.value).toBe(name);
    expect(ast.definitions).toHaveLength(1);
  });

  it('hashes each operation exactly like the persisted-operations manifest', async () => {
    execFileSync(process.execPath, [join(__dirname, '../scripts/persisted-operations.mjs')], { stdio: 'pipe' });
    const manifest = JSON.parse(readFileSync(join(__dirname, '../persisted-operations.json'), 'utf8')) as Record<string, string>;
    expect(Object.keys(manifest)).toHaveLength(Object.keys(operations).length);
    for (const [name, doc] of Object.entries(operations)) {
      const h = await operationHash(name as OperationName);
      expect(h).toBe(createHash('sha256').update(doc).digest('hex'));
      expect(manifest[h]).toBe(doc);
    }
  });
});
