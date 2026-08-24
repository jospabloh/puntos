// Single source of truth for the version/changelog surfaced in-app
// (src/pages/Profile.jsx footer). Mirrors CHANGELOG.md's own section
// titles — keep package.json's "version" and this file's APP_VERSION in
// sync by hand on release, same convention as stockflow/cateqhub's
// appConfig.js. This file is never touched by `npm run build` — only ever
// bumped by hand alongside a real CHANGELOG.md entry.
export const APP_VERSION = '2.0.15';
export const RELEASE_DATE = '2026-08-24';

// Condensed from CHANGELOG.md's own entry titles — full detail lives there.
export const CHANGELOG = [
  { version: '2.0.15', date: '2026-08-24', summary: 'Closed the three module-14 isolation findings: earnPoints/burnPoints now require the account\'s own tenant to match the store\'s, qr_token is locked from client writes, and LoyaltyAccount.business_id/store_id can no longer be written to a foreign tenant.' },
  { version: '2.0.14', date: '2026-08-18', summary: 'Added an in-app version/changelog display and a real health-check endpoint audit (acaciaControl\'s ping action already existed and works — no code change needed there).' },
  { version: '2.0.13', date: '2026-08-17', summary: 'Same-tenant RLS over-permission, notification-preference gap, wallet/email crash guards.' },
  { version: '2.0.12', date: '2026-08-10', summary: 'Points-dedup gap on earnPoints, dependency patches.' },
  { version: '2.0.11', date: '2026-07-28', summary: 'Cross-tenant invitation leak, scheduled-function auth, points dedup hardening.' },
  { version: '2.0.10', date: '2026-07-27', summary: 'Tenant-isolation and points-integrity hardening.' },
  { version: '2.0.9', date: '2026-07-20', summary: 'Release-hygiene audit: sync release metadata, verify prior fix is live.' },
];
