// Layout scan: overlapping interactive elements, horizontal overflow, clipped
// button text and controls covered by fixed bars / the theme switcher, per role
// and width (phone, tablet portrait/landscape, desktop), measured in Chromium.
//
// Usage: node scripts/layout-overlap-scan.mjs [--width 320x700,768x1024] [--only ROLE] [--shots dir] [--rebuild]
//   Builds the app (once, into dist/) and serves it, then fulfils EVERY /api/ request locally with mock
//   data: nothing reaches Base44. Exits 1 when anything is found.
//   Needs a Playwright Chromium (PW_CHROMIUM=/path to override the binary).
import { build } from 'vite';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const args = process.argv.slice(2);
const argOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const SIZES = (argOf('--width') || '320x700,390x844,768x1024,834x1194,1024x768,1024x1366,1440x900')
  .split(',').map((s) => { const [w, h] = s.split('x').map(Number); return { w, h: h || 800 }; });
const SHOTS = argOf('--shots');
const ONLY = argOf('--only');

const C = '2026-09-20T12:00:00.000Z';
const B = 'biz1';
const USERS = {
  CUSTOMER: { id: 'u1', email: 'cliente@example.invalid', full_name: 'Cliente Prueba', role: 'user', data: { business_id: B, storeId: 's1' } },
  STAFF: { id: 'u2', email: 'cajero@example.invalid', full_name: 'Cajero Prueba', role: 'merchant', data: { business_id: B, storeId: 's1' } },
  ADMIN: { id: 'u3', email: 'dueno@example.invalid', full_name: 'Dueña del Negocio', role: 'business_admin', data: { business_id: B } },
  OWNER: { id: 'u4', email: 'owner@example.invalid', full_name: 'Plataforma ACACIA', role: 'admin', data: {} },
  NEW: { id: 'u5', email: 'nuevo@example.invalid', full_name: 'Usuario Nuevo', role: 'user', data: {} },
};
const business = { id: B, name: 'Café Aurora con un nombre largo S.A. de C.V.', legal_name: 'Café Aurora', billing_status: 'trial', trial_end_at: '2026-10-20T00:00:00Z', license_plan: 'growth', status: 'active', invite_code: 'ABC123', invite_code_active: true, owner_email: 'dueno@example.invalid', contact_email: 'dueno@example.invalid', created_date: C, tenant_id: B, licensed_store_limit: 5, licensed_user_limit: 10 };
const store = (i) => ({ id: `s${i}`, name: `Sucursal Centro ${i}`, code: `CEN${i}`, business_id: B, business_name: business.name, merchant_id: 'u2', merchant_name: 'Cajero Prueba', merchant_email: 'cajero@example.invalid', address: 'Av. Siempre Viva 742', city: 'Aguascalientes', state: 'AGS', phone: '4491234567', status: 'active', points_rate: 1, min_purchase: 50, daily_earn_limit: 500, created_date: C });
const account = { id: 'a1', user_id: 'u1', user_email: 'cliente@example.invalid', user_name: 'Cliente Prueba', business_id: B, business_name: business.name, store_id: 's1', store_name: 'Sucursal Centro 1', store_code: 'CEN1', current_balance: 1250, lifetime_earned: 3000, lifetime_redeemed: 1750, tier: 'silver', status: 'active', qr_token: 'QR123456789', qr_token_expires: '2099-01-01T00:00:00Z', onboarding_completed: true, welcome_message_shown: true, created_date: C };
const offer = (i) => ({ id: `o${i}`, title: `Café gratis de cortesía número ${i}`, description: 'Disfruta de una bebida de especialidad.', short_description: 'Una bebida', business_id: B, business_name: business.name, type: 'product', points_cost: 500 * i, value_mxn: 60, status: 'active', stock: 20, category: 'food', created_date: C });
const ledger = (i) => ({ id: `l${i}`, account_id: 'a1', user_id: 'u1', business_id: B, store_id: 's1', store_name: 'Sucursal Centro 1', type: i % 2 ? 'EARN' : 'BURN', points: 100 * i, balance_after: 1000 + i, amount: 100 * i, description: 'Compra en caja', status: 'completed', created_date: C });
function fixtures() {
  return {
    Business: [business], Store: [1, 2, 3].map(store), LoyaltyAccount: [account], Offer: [1, 2, 3].map(offer),
    PointsLedger: [1, 2, 3, 4, 5].map(ledger), Redemption: [],
    Campaign: [{ id: 'c1', name: 'Doble puntos en fin de semana', business_id: B, type: 'multiplier', status: 'active', multiplier: 2, start_date: '2026-09-01', end_date: '2026-12-01', created_date: C }],
    Invitation: [{ id: 'i1', business_id: B, email: 'invitado@example.invalid', role: 'staff', status: 'pending', created_date: C }],
    JoinRequest: [{ id: 'j1', business_id: B, user_id: 'u9', user_email: 'solicita@example.invalid', user_name: 'Solicitante', status: 'pending', created_date: C }],
    SupportTicket: [{ id: 't1', business_id: B, business_name: business.name, subject: 'No puedo acumular puntos', description: 'Detalle', category: 'pos', priority: 'high', status: 'open', created_by_email: 'dueno@example.invalid', last_message_at: C, last_message_by_role: 'tenant', created_date: C }],
    SupportTicketMessage: [], AuditLog: [{ id: 'au1', action: 'earn', actor_email: 'cajero@example.invalid', actor_role: 'merchant', business_id: B, entity_type: 'PointsLedger', status: 'success', payload_summary: 'Acumulación de 100 puntos', created_date: C }],
    LicenseEvent: [{ id: 'le1', business_id: B, event_type: 'trial_started', to_plan: 'growth', effective_at: C, created_date: C }],
    PermissionProfile: [], NotificationPreference: [{ id: 'np1', user_id: 'u1', created_date: C }], AppSession: [],
    User: Object.values(USERS).filter((u) => u.data.business_id).map((u) => ({ ...u, ...u.data })),
  };
}
const match = (row, f) => !f || Object.entries(f).every(([k, v]) => {
  if (k.startsWith('$')) return true;
  if (v && typeof v === 'object') return true;
  return row[k] === undefined || String(row[k]) === String(v);
});

async function mock(ctx, who) {
  const db = fixtures();
  const me = USERS[who];
  // Nothing leaves the machine (fonts, analytics): abort anything non-local.
  await ctx.route((u) => !/^(localhost|127\.0\.0\.1)$/.test(u.hostname), (r) => r.abort());
  await ctx.route((u) => u.pathname.startsWith('/api/') || /socket\.io/.test(u.href), async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
    const json = (x, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(x) });
    if (/socket\.io/.test(url.href)) return route.abort();
    if (p.includes('public-settings')) return json({ id: 'mockapp', public_settings: {} });
    if (p.endsWith('/entities/User/me')) return json(me);
    let m = p.match(/\/entities\/(\w+)(?:\/(\w+))?$/);
    if (m) {
      const rows = db[m[1]] || [];
      if (req.method() !== 'GET') return json({ id: `mock_${Date.now()}`, ...JSON.parse(req.postData() || '{}') });
      if (m[2]) return json(rows.find((r) => r.id === m[2]) || {});
      let q = {}; try { q = JSON.parse(url.searchParams.get('q') || '{}'); } catch { /* */ }
      return json(rows.filter((r) => match(r, q)));
    }
    m = p.match(/\/functions\/(\w+)/);
    if (m) {
      if (m[1] === 'getAppContext') return json({ isOwner: who === 'OWNER', role: me.role, supportEmail: 'soporte@example.invalid' });
      if (m[1] === 'manageTeamMember') return json({ ok: true, users: Object.values(USERS).filter((u) => u.data.business_id).map((u) => ({ id: u.id, email: u.email, full_name: u.full_name, role: u.role, store_name: 'Sucursal Centro 1', business_id: B })) });
      return json({ ok: true });
    }
    if (/\/agents\/conversations/.test(p)) return json([]);
    return json({ ok: true });
  });
}

const SCREENS = {
  CUSTOMER: ['Home', 'Wallet', 'Offers', 'History', 'Chat', 'Profile', 'About', 'Permissions'],
  STAFF: ['Home', 'MerchantPOS', 'Offers', 'Profile'],
  ADMIN: ['AdminDashboard', 'AdminStores', 'AdminCampaigns', 'AdminCustomers', 'BusinessUsers', 'BusinessBilling', 'BusinessSettings', 'BusinessSupport', 'AdminAudit', 'Permissions', 'MerchantPOS', 'About', 'Home'],
  OWNER: ['PlatformDashboard', 'PlatformTenants', 'PlatformLicenses', 'PlatformSupport', 'AdminDashboard'],
  NEW: ['Onboarding'],
};

// Runs in the page, at the current scroll position.
function inspect({ mode, overlay }) {
  // mode: 'top' | 'mid' | 'bottom'. Content scrolling under a fixed/sticky bar is
  // normal, so flow-vs-fixed pairs only count at the two rest positions (the very
  // top and the very bottom, where the last control must clear any fixed bar).
  const SEL = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=switch], [role=checkbox], [role=menuitem], [role=combobox]';
  const name = (el) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || el.placeholder || el.name || '').replace(/\s+/g, ' ').trim().slice(0, 32)}"`;
  const vw = innerWidth, vh = innerHeight;
  const modal = document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"]') || (overlay ? document.querySelector('div.fixed.inset-0') : null);
  const items = [];
  for (const el of document.querySelectorAll(SEL)) {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    if (el.closest('[aria-hidden="true"], [inert]')) continue;
    if (el.type === 'checkbox' && el.closest('label')) continue;
    if (modal && !modal.contains(el) && !el.closest('[data-theme-switcher]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
    // Clip by scrollable/overflow-hidden ancestors.
    let clipped = false; let vis = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const o = getComputedStyle(a);
      if (/(hidden|auto|scroll|clip)/.test(o.overflowX + o.overflowY)) {
        const ar = a.getBoundingClientRect();
        vis = { l: Math.max(vis.l, ar.left), t: Math.max(vis.t, ar.top), r: Math.min(vis.r, ar.right), b: Math.min(vis.b, ar.bottom) };
      }
    }
    if (vis.r - vis.l < 2 || vis.b - vis.t < 2) clipped = true;
    if (clipped) continue;
    let fx = false;
    for (let a = el; a && a !== document.body; a = a.parentElement) { const pos = getComputedStyle(a).position; if (pos === 'fixed' || pos === 'sticky') { fx = true; break; } }
    items.push({ el, fx, r: { l: Math.max(vis.l, 0), t: Math.max(vis.t, 0), r: Math.min(vis.r, vw), b: Math.min(vis.b, vh) } });
  }
  const out = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (a.fx !== b.fx && overlay) continue; // an open menu is meant to sit over the page
      if (a.fx !== b.fx) {
        // A bar on the lower half of the screen only matters once scrolled to the end;
        // one on the upper half only at the very top.
        const f = a.fx ? a : b; const lower = (f.r.t + f.r.b) / 2 > vh / 2;
        if (mode === 'mid' || (lower && mode === 'top') || (!lower && mode === 'bottom')) continue;
      }
      const ox = Math.min(a.r.r, b.r.r) - Math.max(a.r.l, b.r.l);
      const oy = Math.min(a.r.b, b.r.b) - Math.max(a.r.t, b.r.t);
      if (ox > 3 && oy > 3) out.push(`OVERLAP ${name(a.el)} x ${name(b.el)} (${Math.round(ox)}x${Math.round(oy)})`);
    }
  }
  // Covered: centre of the visible box is hit by something unrelated.
  for (const { el, r, fx: elFx } of items) {
    const x = (r.l + r.r) / 2, y = (r.t + r.b) / 2;
    const at = document.elementFromPoint(x, y);
    if (!at || el.contains(at) || at.contains(el)) continue;
    if (at.closest('label') && at.closest('label').contains(el)) continue;
    if (at.closest('[data-sonner-toaster]')) continue;
    // Only report when the cover is a fixed/sticky layer (bar, switcher, header).
    let f = at; let fixed = false;
    for (; f && f !== document.body; f = f.parentElement) { const pos = getComputedStyle(f).position; if (pos === 'fixed' || pos === 'sticky') { fixed = true; break; } }
    if (fixed && !elFx && overlay) continue;
    if (fixed && !elFx) {
      const fr = f.getBoundingClientRect(); const lower = (fr.top + fr.bottom) / 2 > vh / 2;
      if (mode === 'mid' || (lower && mode === 'top') || (!lower && mode === 'bottom')) continue;
    }
    if (fixed) out.push(`COVERED ${name(el)} by ${name(at)}`);
  }
  // Clipped button / link text.
  for (const { el } of items) {
    if (!['BUTTON', 'A'].includes(el.tagName)) continue;
    const t = (el.textContent || '').trim();
    if (!t || t.length > 24) continue; // long text is a card row that truncates on purpose
    const cs = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 2 && /(hidden|clip)/.test(cs.overflowX)) out.push(`CLIPPED-X ${name(el)}`);
    for (const c of el.querySelectorAll('span, div')) {
      const cc = getComputedStyle(c);
      if (c.scrollWidth > c.clientWidth + 2 && /(hidden|clip)/.test(cc.overflowX) && c.children.length === 0 && cc.textOverflow === 'ellipsis') out.push(`TRUNCATED ${name(el)}`);
    }
    if (el.scrollHeight > el.clientHeight + 3 && /(hidden|clip)/.test(cs.overflowY)) out.push(`CLIPPED-Y ${name(el)}`);
  }
  // Non-interactive collisions: text, icons and images that paint on top of each
  // other (a stat card whose icon chip sits on its label, a title under a badge).
  if (!overlay) {
    const leaves = [];
    const label = (el) => `${el.tagName.toLowerCase()} "${(el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 28)}"`;
    for (const el of document.querySelectorAll('body *')) {
      const isText = el.children.length === 0 && (el.textContent || '').trim().length > 0 && !['SCRIPT', 'STYLE', 'OPTION'].includes(el.tagName);
      const isIcon = el.tagName === 'svg' || el.tagName === 'IMG';
      if (!isText && !isIcon) continue;
      if (el.closest('[aria-hidden="true"], [inert], [data-theme-switcher], [data-sonner-toaster], svg:not(:scope)') && !isIcon) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      let r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      if (isText) {
        // Tight box of the actual text, not the (possibly stretched) element box.
        const range = document.createRange(); range.selectNodeContents(el);
        const rects = [...range.getClientRects()].filter((q) => q.width > 1);
        if (!rects.length) continue;
        r = { left: Math.min(...rects.map((q) => q.left)), top: Math.min(...rects.map((q) => q.top)), right: Math.max(...rects.map((q) => q.right)), bottom: Math.max(...rects.map((q) => q.bottom)) };
        el.__lines = rects; // wrapped text is several boxes, not one big one
      }
      if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
      if (cs.position === 'absolute' && isIcon && el.closest('button, a, input, label')) continue; // icon inside a field
      let fx = false;
      for (let a = el; a && a !== document.body; a = a.parentElement) { const pos = getComputedStyle(a).position; if (pos === 'fixed' || pos === 'sticky') { fx = true; break; } }
      // Clip to overflow:hidden/auto/scroll ancestors (truncated text, scrolled lists).
      for (let a = isText ? el : el.parentElement; a && a !== document.body; a = a.parentElement) {
        const o = getComputedStyle(a);
        if (/(hidden|auto|scroll|clip)/.test(o.overflowX + o.overflowY)) {
          const ar = a.getBoundingClientRect();
          r = { left: Math.max(r.left, ar.left), top: Math.max(r.top, ar.top), right: Math.min(r.right, ar.right), bottom: Math.min(r.bottom, ar.bottom) };
        }
      }
      if (r.right - r.left < 4 || r.bottom - r.top < 4) continue;
      leaves.push({ el, r, fx, icon: isIcon, lines: isText ? [...el.__lines].map((q) => ({ left: Math.max(q.left, r.left), top: Math.max(q.top, r.top), right: Math.min(q.right, r.right), bottom: Math.min(q.bottom, r.bottom) })) : [r] });
    }
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i], b = leaves[j];
        if (a.fx !== b.fx) continue;
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        if (a.icon && b.icon) continue;
        let hit = null;
        for (const qa of a.lines) for (const qb of b.lines) {
          const ox = Math.min(qa.right, qb.right) - Math.max(qa.left, qb.left);
          const oy = Math.min(qa.bottom, qb.bottom) - Math.max(qa.top, qb.top);
          if (ox > 4 && oy > 4) hit = [ox, oy];
        }
        if (hit) out.push(`VISUAL ${label(a.el)} x ${label(b.el)} (${Math.round(hit[0])}x${Math.round(hit[1])})`);
      }
    }
  }
  return out;
}

async function pass(page, label, found, overlay = false) {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = page.viewportSize().height;
  const ys = [0]; for (let y = vh - 100; y < h; y += vh - 100) ys.push(Math.min(y, h - vh));
  const seen = new Set();
  for (const y of ys) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(80);
    for (const f of await page.evaluate(inspect, { mode: y === 0 ? 'top' : (y >= h - vh - 2 ? 'bottom' : 'mid'), overlay })) if (!seen.has(f)) { seen.add(f); found.push(`${label}: ${f}`); }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  const ov = await page.evaluate(() => {
    const vw = innerWidth; const bad = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect(); if (r.width === 0) continue;
      if (r.right > vw + 2 && !el.closest('[data-radix-popper-content-wrapper], [role=dialog], [data-sonner-toaster], .overflow-x-auto, .overflow-auto, table, [data-theme-switcher]')) { bad.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`); if (bad.length > 2) break; }
    }
    return { sw: document.documentElement.scrollWidth - vw, bad };
  });
  if (ov.sw > 2) found.push(`${label}: H-OVERFLOW ${ov.sw}px  ${ov.bad.join(' | ')}`);
}

async function main() {
  if (!existsSync('dist/index.html') || args.includes('--rebuild')) {
    for (let i = 1; ; i++) { try { await build({ logLevel: 'error' }); break; } catch (e) { if (i >= 5) throw e; console.log(`build failed (${e.message.slice(0, 60)}), retry ${i}`); } }
  }
  const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' };
  const server = http.createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    let file = join('dist', path);
    let body;
    try { body = await readFile(file); } catch { file = 'dist/index.html'; body = await readFile(file); } // SPA fallback
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
  await new Promise((r) => server.listen(5333, '127.0.0.1', r));
  const base = 'http://127.0.0.1:5333';
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined) });
  if (SHOTS) await mkdir(SHOTS, { recursive: true });
  let total = 0;
  try {
    for (const { w, h } of SIZES) {
      const phone = w < 600;
      for (const who of [null, ...Object.keys(USERS)]) {
        if (ONLY && who !== ONLY && !(ONLY === 'ANON' && !who)) continue;
        for (const theme of ['light']) {
          const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: phone, deviceScaleFactor: 1, locale: 'es-MX' });
          await ctx.addInitScript((t) => { localStorage.setItem('pp-theme', t); }, theme);
          if (who) await ctx.addInitScript(() => localStorage.setItem('base44_access_token', 'mock'));
          await mock(ctx, who || 'NEW');
          const page = await ctx.newPage();
          const screens = who ? SCREENS[who] : ['Login', 'Register', 'ForgotPassword'];
          for (const s of screens) {
            const found = [];
            await page.goto(`${base}/${s}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
            await pass(page, `${s}`, found);
            if (SHOTS && found.length) await page.screenshot({ path: `${SHOTS}/${w}x${h}-${who || 'ANON'}-${s}.png` });
            console.log(`${found.length ? 'FAIL' : 'ok  '} ${w}x${h} ${(who || 'ANON').padEnd(8)} ${s.padEnd(18)} ${found.join(' || ')}`);
            total += found.length;
          }
          if (who) {
            // Interactions: theme switcher open, menus.
            await page.goto(`${base}/${SCREENS[who][0]}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500);
            const states = [];
            const sw = page.locator('[data-theme-switcher] button[aria-expanded]');
            if (await sw.count()) states.push(['switcher open', async () => { await sw.first().click(); }]);
            const menuBtn = page.getByRole('button', { name: /Abrir menú/ });
            if (await menuBtn.count()) states.push(['menu open', async () => { await menuBtn.first().click(); }]);
            for (const [lab, act] of states) {
              await page.goto(`${base}/${SCREENS[who][0]}`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500);
              await act(); await page.waitForTimeout(400);
              const found = []; await pass(page, lab, found, lab === 'menu open');
              if (SHOTS && found.length) await page.screenshot({ path: `${SHOTS}/${w}x${h}-${who}-${lab.replace(/ /g, '_')}.png` });
              console.log(`${found.length ? 'FAIL' : 'ok  '} ${w}x${h} ${who.padEnd(8)} ${lab.padEnd(18)} ${found.join(' || ')}`);
              total += found.length;
            }
          }
          await ctx.close();
        }
      }
    }
  } finally { await browser.close(); server.close(); }
  console.log(`\n${total} finding(s)`);
  process.exit(total ? 1 : 0);
}
main();
