#!/usr/bin/env node
/**
 * validate-rls.mjs — static guard for Base44 Row-Level Security correctness.
 *
 * Multi-tenant isolation in Base44 has TWO halves and getting either wrong fails
 * SILENTLY (see StockFlow's CLAUDE.md post-mortems):
 *
 *   - Entity side (left of a rule): a custom field MUST be addressed as `data.<f>`
 *     or be a built-in (id, created_by_id, created_date, updated_date). A bare
 *     `business_id` points at nothing → the clause matches EVERY row → RLS OFF
 *     (cross-tenant leak).
 *   - User side (the template, right of a rule): custom user fields resolve as
 *     `{{user.data.<f>}}`. The only bare built-ins are {{user.id}}, {{user.email}},
 *     {{user.role}}. `{{user.business_id}}` resolves to nothing → matches ZERO
 *     rows → every tenant sees an empty app.
 *
 * This script parses every base44/entities/*.jsonc and fails CI on either class
 * of error. It also flags business-scoped entities whose write ops lack the
 * service-role (`role: admin`) $or branch that the backend "Safe" functions need.
 *
 * Run: node scripts/validate-rls.mjs   (also: npm run validate:rls)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENTITIES_DIR = join(__dirname, '..', 'base44', 'entities');

const BUILTIN_ENTITY_FIELDS = new Set(['id', 'created_by_id', 'created_date', 'updated_date']);
const BUILTIN_USER_TEMPLATES = new Set(['{{user.id}}', '{{user.email}}', '{{user.role}}']);
const OPS = ['create', 'read', 'update', 'delete'];

/** Strip // and /* *\/ comments so JSONC parses as JSON. */
function parseJsonc(text) {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const noLine = noBlock.replace(/(^|[^:])\/\/.*$/gm, '$1');
  return JSON.parse(noLine);
}

const errors = [];
const warnings = [];

function checkUserTemplate(value, ctx) {
  if (typeof value !== 'string') return;
  const matches = value.match(/\{\{\s*user[^}]*\}\}/g) || [];
  for (const tpl of matches) {
    const normalized = tpl.replace(/\s+/g, '');
    if (BUILTIN_USER_TEMPLATES.has(normalized)) continue;
    if (/^\{\{user\.data\.[\w.]+\}\}$/.test(normalized)) continue;
    errors.push(`${ctx}: invalid user template "${tpl}" — custom user fields must be {{user.data.<field>}}; only {{user.id}}, {{user.email}}, {{user.role}} are bare built-ins.`);
  }
}

function checkEntityKey(key, ctx) {
  if (key.startsWith('$') || key === 'user_condition') return;
  if (BUILTIN_ENTITY_FIELDS.has(key)) return;
  if (key.startsWith('data.')) return;
  errors.push(`${ctx}: invalid entity field path "${key}" — custom fields must be "data.${key}" (a bare key matches every row and disables RLS).`);
}

function walkRule(node, ctx, seen) {
  if (Array.isArray(node)) {
    node.forEach((n, i) => walkRule(n, `${ctx}[${i}]`, seen));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'user_condition') {
        if (value && typeof value === 'object' && value.role) seen.roles.add(value.role);
        continue;
      }
      if (key === '$or' || key === '$and' || key === '$in' || key === '$nin') {
        walkRule(value, `${ctx}.${key}`, seen);
        continue;
      }
      checkEntityKey(key, ctx);
      checkUserTemplate(value, `${ctx}.${key}`);
    }
  }
}

const files = readdirSync(ENTITIES_DIR).filter((f) => f.endsWith('.jsonc'));
if (files.length === 0) {
  console.error('validate:rls — no entity files found in base44/entities');
  process.exit(1);
}

for (const file of files) {
  let schema;
  try {
    schema = parseJsonc(readFileSync(join(ENTITIES_DIR, file), 'utf8'));
  } catch (e) {
    errors.push(`${file}: not valid JSONC — ${e.message}`);
    continue;
  }
  const rls = schema.rls || {};
  // Entity-level RLS
  for (const op of OPS) {
    if (!rls[op]) continue;
    const seen = { roles: new Set() };
    walkRule(rls[op], `${file}:rls.${op}`, seen);
  }
  // Field-level write RLS
  for (const [fname, fdef] of Object.entries(schema.properties || {})) {
    if (fdef && fdef.rls) {
      for (const op of Object.keys(fdef.rls)) {
        const seen = { roles: new Set() };
        walkRule(fdef.rls[op], `${file}:${fname}.rls.${op}`, seen);
      }
    }
  }
  // Heuristic: tenant-scoped entities should keep the admin (service-role) branch
  const usesBusinessScope = JSON.stringify(rls).includes('{{user.data.business_id}}');
  if (usesBusinessScope) {
    for (const op of OPS) {
      if (!rls[op]) continue;
      if (!JSON.stringify(rls[op]).includes('"admin"')) {
        warnings.push(`${file}:rls.${op} — business-scoped but missing the {"user_condition":{"role":"admin"}} branch the service-role "Safe" functions need.`);
      }
    }
  }
}

for (const w of warnings) console.warn(`⚠️  ${w}`);
if (errors.length) {
  console.error(`\n❌ validate:rls failed with ${errors.length} error(s):`);
  for (const e of errors) console.error(`   • ${e}`);
  process.exit(1);
}
console.log(`✅ validate:rls — ${files.length} entities OK (${warnings.length} warning(s)).`);
