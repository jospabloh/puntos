#!/usr/bin/env node
// Drift guard between src/lib/rbac.js's PERMISSIONS matrix and the hand-kept
// mirrors inside the Deno functions that re-check those capabilities
// server-side (STANDARD.md Module 3).
//
// base44/functions/guardedEntityWrite and base44/functions/adjustCustomerPoints
// cannot import from src/, so each carries its own copy of the subset of
// PERMISSIONS it enforces. A copy nobody checks is a copy that silently
// drifts, and the failure mode is the worst kind: the client hides a button
// the server still allows, or the server denies something the UI offers.
//
// This fails on any difference in the role list for a mirrored key, on a
// mirrored key that no longer exists in rbac.js, and on any ENTITY_CONFIG
// capability that is not a real key. It does NOT require the mirrors to list
// every key — they deliberately only carry the ones they gate.
//
// Run: node scripts/validate-permissions.mjs   (wired into `npm run lint`)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const RBAC = path.join(ROOT, 'src', 'lib', 'rbac.js');
const MIRRORS = [
  path.join(ROOT, 'base44', 'functions', 'guardedEntityWrite', 'entry.ts'),
  path.join(ROOT, 'base44', 'functions', 'adjustCustomerPoints', 'entry.ts'),
  path.join(ROOT, 'base44', 'functions', 'createStore', 'entry.ts'),
];

function blockAfter(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`No se encontró "${marker}"`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(braceStart, i + 1);
    }
  }
  throw new Error(`Bloque sin cerrar tras "${marker}"`);
}

// Both sides use: 'module:action': ['role', 'role'],
function parseMatrix(block) {
  const out = {};
  for (const m of block.matchAll(/'([a-z_]+:[a-z_]+)':\s*\[([^\]]*)\]/g)) {
    out[m[1]] = m[2]
      .split(',')
      .map((r) => r.trim().replace(/^'|'$/g, ''))
      .filter(Boolean);
  }
  return out;
}

const client = parseMatrix(blockAfter(readFileSync(RBAC, 'utf8'), 'export const PERMISSIONS'));
if (Object.keys(client).length === 0) {
  console.error('✗ PERMISSIONS de rbac.js se parseó vacío — revisa el parser.');
  process.exit(1);
}

const errors = [];
let mirroredKeys = 0;

for (const file of MIRRORS) {
  const rel = path.relative(ROOT, file);
  const source = readFileSync(file, 'utf8');
  const mirror = parseMatrix(blockAfter(source, 'const PERMISSIONS'));

  if (Object.keys(mirror).length === 0) errors.push(`${rel}: el mirror se parseó vacío.`);

  for (const [key, roles] of Object.entries(mirror)) {
    mirroredKeys++;
    if (!(key in client)) {
      errors.push(`${rel}: "${key}" no existe en rbac.js.`);
      continue;
    }
    const a = [...roles].sort().join(',');
    const b = [...client[key]].sort().join(',');
    if (a !== b) errors.push(`${rel}: roles distintos para "${key}" — servidor=[${a}] cliente=[${b}]`);
  }

  // Every capability ENTITY_CONFIG points at must be mirrored, or the server
  // would deny a write on a key it never resolves.
  if (source.includes('const ENTITY_CONFIG')) {
    const config = blockAfter(source, 'const ENTITY_CONFIG');
    for (const m of config.matchAll(/(?:create|update|delete):\s*'([a-z_]+:[a-z_]+)'/g)) {
      if (!(m[1] in mirror)) errors.push(`${rel}: ENTITY_CONFIG usa "${m[1]}" pero no está en el mirror PERMISSIONS.`);
      if (!(m[1] in client)) errors.push(`${rel}: ENTITY_CONFIG usa "${m[1]}" pero no existe en rbac.js.`);
    }
  }
}

if (errors.length) {
  console.error('✗ Permisos desincronizados entre cliente y servidor:\n');
  for (const e of errors) console.error(`  - ${e}`);
  console.error('\nCorrige src/lib/rbac.js o el mirror de la función correspondiente.');
  process.exit(1);
}

console.log(
  `✓ Permission mirrors validation passed (${mirroredKeys} claves espejadas contra ${Object.keys(client).length} en rbac.js).`,
);
