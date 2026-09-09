// Single source of truth for the version/changelog surfaced in-app
// (src/pages/Profile.jsx footer). Mirrors CHANGELOG.md's own section
// titles — keep package.json's "version" and this file's APP_VERSION in
// sync by hand on release, same convention as stockflow/cateqhub's
// appConfig.js. This file is never touched by `npm run build` — only ever
// bumped by hand alongside a real CHANGELOG.md entry.
export const APP_VERSION = '2.0.17';
export const RELEASE_DATE = '2026-09-09';

// Condensed from CHANGELOG.md's own entry titles — full detail lives there.
export const CHANGELOG = [
  { version: '2.0.17', date: '2026-09-09', summary: 'Re-ran module 14 (tenant isolation) against module 18\'s Membership/switchBusiness surfaces. Its original "no isolation issues found" was wrong — a Codex review caught manageTeamMember never revoking a removed/demoted member\'s Membership row, fixed in 2.0.16 below. Renumbered from 2.0.16 while resolving that PR\'s merge conflict with this one.' },
  { version: '2.0.16', date: '2026-09-07', summary: 'Scheduled audit found production has not been serving the deployed code for at least 7 days (module 12\'s theme switcher is missing live — needs npm run deploy:site, not done here). Fixed a real access-control bug: manageTeamMember never revoked a removed/demoted team member\'s Membership row, letting them switchBusiness back into it. Patched 4 dependency advisories (fflate, postcss-selector-parser, @humanfs/node, browserslist); react-router\'s advisory stays deferred pending a manual v7 migration. Documented the theme switcher in the user manual.' },
  { version: '2.0.15', date: '2026-08-24', summary: 'Closed the three module-14 isolation findings: earnPoints/burnPoints now require the account\'s own tenant to match the store\'s, qr_token is locked from client writes (with a new refreshQrToken function backing Wallet.jsx\'s refresh), and LoyaltyAccount.business_id/store_id can no longer be written to a foreign tenant.' },
  { version: '2.0.14', date: '2026-08-18', summary: 'Added an in-app version/changelog display and a real health-check endpoint audit (acaciaControl\'s ping action already existed and works — no code change needed there).' },
  { version: '2.0.13', date: '2026-08-17', summary: 'Same-tenant RLS over-permission, notification-preference gap, wallet/email crash guards.' },
  { version: '2.0.12', date: '2026-08-10', summary: 'Points-dedup gap on earnPoints, dependency patches.' },
  { version: '2.0.11', date: '2026-07-28', summary: 'Cross-tenant invitation leak, scheduled-function auth, points dedup hardening.' },
  { version: '2.0.10', date: '2026-07-27', summary: 'Tenant-isolation and points-integrity hardening.' },
  { version: '2.0.9', date: '2026-07-20', summary: 'Release-hygiene audit: sync release metadata, verify prior fix is live.' },
];
