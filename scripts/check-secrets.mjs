#!/usr/bin/env node
/**
 * check-secrets.mjs — secret-hygiene guard (runs in CI).
 *
 * The Base44 scanner flags functions that READ credentials from env vars — which
 * is the correct, secure pattern. This guard protects against the things that
 * would be ACTUAL leaks:
 *   1. A private key / certificate committed into a tracked file.
 *   2. A real .env file (with values) committed (only .env.example is allowed).
 *   3. A secret exposed to the browser via a VITE_-prefixed name (VITE_ vars are
 *      bundled into the public client) — e.g. VITE_..._SECRET / _KEY / _PASSWORD.
 *   4. A hardcoded credential literal assigned in source.
 *
 * Secrets must live ONLY in the Base44 function environment. See
 * docs/SECURITY-secrets.md.
 *
 * Run: node scripts/check-secrets.mjs   (also: npm run check:secrets)
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const errors = [];

function tracked() {
  try {
    return execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

const SKIP_EXT = /\.(png|jpe?g|gif|webp|ico|svg|woff2?|ttf|eot|pdf|lock)$/i;
const SKIP_FILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/;

// A real env file (has values), as opposed to the allowed template.
const REAL_ENV = /(^|\/)\.env(\.(local|development|production|test))?$/;

const PRIVATE_KEY = /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/;
const SA_PRIVATE = /"private_key"\s*:\s*"-----BEGIN/;
// VITE_<NAME> where NAME looks like a secret. VITE_BASE44_APP_ID/URL are fine.
const VITE_SECRET = /\bVITE_[A-Z0-9_]*(SECRET|PASSWORD|PRIVATE|CERT|TOKEN|_KEY|APIKEY|CREDENTIAL)[A-Z0-9_]*\b/;
// Hardcoded credential literal (not reading from env, not a placeholder).
const HARDCODED = /\b(api[_-]?key|secret|password|passwd|private[_-]?key|access[_-]?token|client[_-]?secret)\b\s*[:=]\s*["'`]([^"'`]{12,})["'`]/i;
const PLACEHOLDER = /(example|your[_-]?|xxxx|<[^>]+>|changeme|placeholder|\.\.\.|todo|dummy|sample)/i;
const READS_ENV = /(Deno\.env\.get|import\.meta\.env|process\.env)/;

function isBinary(text) {
  return text.indexOf(String.fromCharCode(0)) !== -1;
}

for (const file of tracked()) {
  if (REAL_ENV.test(file) && !file.endsWith('.env.example')) {
    errors.push(`${file}: a real .env file is committed — secrets must not be in the repo (only .env.example).`);
    continue;
  }
  if (SKIP_EXT.test(file) || SKIP_FILE.test(file) || !existsSync(file)) continue;

  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  if (isBinary(text)) continue;

  text.split('\n').forEach((line, i) => {
    const ln = `${file}:${i + 1}`;
    if (PRIVATE_KEY.test(line)) errors.push(`${ln}: committed PRIVATE KEY block.`);
    if (SA_PRIVATE.test(line)) errors.push(`${ln}: committed service-account private_key.`);
    if (VITE_SECRET.test(line)) errors.push(`${ln}: secret exposed via a VITE_-prefixed var (bundled into the public client). Use a non-VITE server env var.`);
    if (HARDCODED.test(line) && !READS_ENV.test(line) && !PLACEHOLDER.test(line) && !file.endsWith('.env.example')) {
      errors.push(`${ln}: looks like a hardcoded credential literal. Read it from the function environment instead.`);
    }
  });
}

if (errors.length) {
  console.error(`\n❌ check:secrets failed with ${errors.length} finding(s):`);
  for (const e of errors) console.error(`   • ${e}`);
  console.error('\nSee docs/SECURITY-secrets.md.');
  process.exit(1);
}
console.log('✅ check:secrets — no committed secrets, no client-exposed secret vars.');
