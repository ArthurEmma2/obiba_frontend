import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'out');
const envFile = join(root, '.env.production');
if (existsSync(envFile)) process.loadEnvFile(envFile);

function originOf(url) {
  if (!url) return '';
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

// A static host cannot send headers or per-request nonces, so each page carries a meta CSP that pins its own inline
// scripts by hash. Meta CSP ignores frame-ancestors; see README.md for the clickjacking header this leaves to the edge.
function contentSecurityPolicy(hashes) {
  const api = originOf(process.env.NEXT_PUBLIC_API_URL);
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? `https://${process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}` : '';
  const network = process.env.NEXT_PUBLIC_NEAR_NETWORK;
  const nearRpc = originOf(process.env.NEXT_PUBLIC_NEAR_RPC_URL) || (network === 'mainnet' ? 'https://free.rpc.fastnear.com' : network === 'testnet' ? 'https://test.rpc.fastnear.com' : '');
  const google = ['https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com', 'https://www.google.com/recaptcha/', 'https://recaptchaenterprise.googleapis.com'];
  const wallets = network === 'mainnet' || network === 'testnet';
  const walletConnect = wallets ? ['https://h4n.app', 'https://logout-bridge-service.intear.tech', 'wss://logout-bridge-service.intear.tech'] : [];
  const walletFrames = wallets ? ['https://my.herewallet.app', 'https://wallet.intear.tech'] : [];
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')} https://challenges.cloudflare.com https://apis.google.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${[api, ...google, nearRpc, ...walletConnect].filter(Boolean).join(' ')}`,
    `frame-src ${[authDomain, 'https://challenges.cloudflare.com', 'https://www.google.com/recaptcha/', 'https://recaptcha.google.com/recaptcha/', ...walletFrames].filter(Boolean).join(' ')}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const helper = join(out, '__');
const pages = files(out).filter((f) => f.endsWith('.html') && !f.startsWith(helper));
for (const page of pages) {
  const html = readFileSync(page, 'utf8');
  const hashes = new Set();
  for (const [, body] of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
  if (!html.includes('<head>')) throw new Error(`No <head> in ${page}`);
  const meta = `<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy([...hashes])}"/>`;
  writeFileSync(page, html.replace('<head>', `<head>${meta}`));
}

process.stdout.write(`Pinned inline scripts in ${pages.length} pages\n`);
