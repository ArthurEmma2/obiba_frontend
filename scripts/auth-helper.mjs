import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'out', '__', 'auth');
const envFile = join(root, '.env.production');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
if (!project) throw new Error('Missing configuration: NEXT_PUBLIC_FIREBASE_PROJECT_ID');
const source = `https://${project}.firebaseapp.com/__/auth`;
const helper = [
  ['handler', 'handler.html'],
  ['handler.js', 'handler.js'],
  ['experiments.js', 'experiments.js'],
  ['iframe', 'iframe.html'],
  ['iframe.js', 'iframe.js'],
];

mkdirSync(target, { recursive: true });
for (const [remote, local] of helper) {
  const res = await fetch(`${source}/${remote}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Sign-in helper ${remote} returned ${res.status}`);
  writeFileSync(join(target, local), Buffer.from(await res.arrayBuffer()));
}

process.stdout.write(`Copied the sign-in helper from ${source}\n`);
