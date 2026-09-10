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
// Skip lockfiles and THIS file (it contains the detection patterns by design).
const SKIP_FILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|check-secrets\.mjs)$/;

// A real env file (has values), as opposed to the allowed template.
const REAL_ENV = /(^|\/)\.env(\.(local|development|production|test))?$/;

const PRIVATE_KEY = /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/;
const SA_PRIVATE = /"private_key"\s*:\s*"-----BEGIN/;
// VITE_<NAME> where NAME looks like a secret. VITE_BASE44_APP_ID/URL are fine.
const VITE_SECRET = /\bVITE_[A-Z0-9_]*(SECRET|PASSWORD|PRIVATE|CERT|TOKEN|_KEY|APIKEY|CREDENTIAL)[A-Z0-9_]*\b/;

/**
 * A hardcoded credential literal.
 *
 * Two things about the shape of this regex are load-bearing, and both come from
 * a real miss (2026-09-10): the four `base44/workflows/*.jsonc` exports carried
 * `"scheduled_token": "<the live SCHEDULED_TASK_SECRET>"` in clear for four
 * days and this guard passed green the whole time.
 *
 *  1. **The optional closing quote before the separator.** The old rule was
 *     `\b(secret|…)\b\s*[:=]`. In JSON the key is quoted, so the character
 *     before the colon is `"` — and `\s*` cannot cross it. Measured:
 *
 *         JS    secret: "…"      -> matched
 *         JSON "secret": "…"     -> NOT matched
 *
 *     So the rule had never been able to flag anything in a `.json` or
 *     `.jsonc` file: the format of every entity schema and every workflow
 *     export in this repo. It was not that `scheduled_token` was missing from
 *     the word list — `"secret"` itself did not match either.
 *
 *  2. **The keyword is a substring, not a whole word.** `\btoken\b` does not
 *     match inside `scheduled_token` (`d` and `t` are both word characters),
 *     which is why an exact list of `access_token`/`client_secret` kept
 *     missing whatever the next field happened to be called. Any identifier
 *     *containing* one of these stems counts.
 *
 * NOT_A_SECRET is what keeps that broader match from becoming noise, and it is
 * the one deliberate blind spot here: a credential containing whitespace, or
 * one that is itself a URL, is not flagged. Real tokens are neither, and a
 * guard that cries wolf gets ignored — which is how this one went unread. The
 * three lines it suppresses in this repo are an npm script, a prose line in
 * CLAUDE.md, and Google's `oauth2.googleapis.com/token` URL constant.
 */
const HARDCODED = /(?:^|[^A-Za-z0-9_$])["']?([A-Za-z0-9_$.-]*(?:api[_-]?key|secret|passwd|password|private[_-]?key|token|credential|bearer)[A-Za-z0-9_$.-]*)["']?\s*[:=]\s*["'`]([^"'`\n]{12,})["'`]/i;
const NOT_A_SECRET = /\s|^https?:\/\//i;
const PLACEHOLDER = /(example|your[_-]?|xxxx|<[^>]+>|changeme|placeholder|\.\.\.|todo|dummy|sample)/i;
const READS_ENV = /(Deno\.env\.get|import\.meta\.env|process\.env)/;

/** The value assigned on this line, if it looks like a real credential. */
function hardcodedSecret(line) {
  const m = HARDCODED.exec(line);
  if (!m) return null;
  const value = m[2];
  if (NOT_A_SECRET.test(value)) return null;   // a command, a sentence, a URL
  if (PLACEHOLDER.test(value)) return null;    // <SCHEDULED_TASK_SECRET>, your-key-here…
  if (READS_ENV.test(line)) return null;       // reading it from the environment
  return m[1];
}

/**
 * The guard proves itself on every run.
 *
 * This exists because the bug above was not a missing rule — it was a rule
 * everyone believed was working. Nothing in CI could tell the difference
 * between "scanned the workflows and found nothing" and "structurally unable
 * to read them". These fixtures can: the JSON cases fail on the old regex and
 * pass on this one, so a future simplification that re-breaks it stops the
 * build instead of going quietly blind again.
 */
const FIXTURES = {
  flagged: [
    '  "scheduled_token": "re_AAAABBBBCCCCDDDDEEEE",',   // the real 2026-09-10 miss
    '  "api_key": "sk-livekey1234567890abcd",',           // quoted JSON key
    "const clientSecret = 'abcdefghijklmnopqrstuvwx';",   // unquoted JS key
    '  "password": "hunter2hunter2hunter2",',
  ],
  clean: [
    '    "check:secrets": "node scripts/check-secrets.mjs"',        // an npm script
    "const GOOGLE_TOKEN_URI = 'https://oauth2.googleapis.com/token';",
    "const secret = Deno.env.get('SCHEDULED_TASK_SECRET');",        // read from env
    '  "scheduled_token": "<SCHEDULED_TASK_SECRET>",',              // redacted
    '  "api_key": "your-api-key-here",',                            // placeholder
    '  "token": "short",',                                          // too short to be one
  ],
};

for (const line of FIXTURES.flagged) {
  if (!hardcodedSecret(line)) {
    console.error(`\n❌ check:secrets is broken — it no longer detects:\n   ${line.trim()}`);
    process.exit(2);
  }
}
for (const line of FIXTURES.clean) {
  const hit = hardcodedSecret(line);
  if (hit) {
    console.error(`\n❌ check:secrets is too noisy — it now flags (as "${hit}"):\n   ${line.trim()}`);
    process.exit(2);
  }
}

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
    if (!file.endsWith('.env.example')) {
      const key = hardcodedSecret(line);
      if (key) {
        errors.push(`${ln}: \`${key}\` looks like a hardcoded credential literal. Read it from the function environment instead.`);
      }
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
