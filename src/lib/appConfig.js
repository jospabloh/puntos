// Single source of truth for the version/changelog surfaced in-app
// (src/pages/Profile.jsx footer). Mirrors CHANGELOG.md's own section
// titles — keep package.json's "version" and this file's APP_VERSION in
// sync by hand on release, same convention as stockflow/cateqhub's
// appConfig.js. This file is never touched by `npm run build` — only ever
// bumped by hand alongside a real CHANGELOG.md entry.
export const APP_VERSION = '2.0.20';
export const RELEASE_DATE = '2026-09-21';

// Condensed from CHANGELOG.md's own entry titles — full detail lives there.
//
// Two summaries per entry, on purpose (módulo 21): `resumen` is what the
// About screen shows a user — plain Spanish, about what changed FOR THEM —
// while `summary` stays the faithful technical record mirroring CHANGELOG.md.
// A user reading "closed the three module-14 isolation findings" learns
// nothing; a developer reading "revisión de mantenimiento" loses the trail.
// New entries carry both; About falls back to `summary` if `resumen` is
// missing, so forgetting one degrades instead of rendering blank.
export const CHANGELOG = [
  { version: '2.0.20', date: '2026-09-21', resumen: 'Auditoría de rutina sin cambios visibles: se confirmó, por primera vez contra el sistema real (no sólo el archivo del repo), que los bloqueos de seguridad de roles y de licencia ya vigentes están funcionando en producción.', summary: 'Scheduled full audit. For the first time, live verification against the deployed Base44 schema (not just the repo .jsonc) confirmed the Module 1 (Business license fields) and Module 19 (User role/tenant fields) write locks are actually deployed and correct — previously only "not verified" from this environment. No code defects found: lint/build/RLS/permissions/functions/secrets guards all clean, no new dependency issues. Two pre-existing gaps documented with names for the first time: the retired Membership entity is still live in production (0 rows, awaiting a human-run destructive deploy:entities) and Module 9 (automated QA) was never actually built — only static config guards exist, no business-logic tests.' },
  { version: '2.0.19', date: '2026-09-10', resumen: 'Al entrar sin sesión, la app ya te lleva a su propia pantalla de inicio de sesión. Antes te sacaba a una página genérica de la plataforma, y por eso la app no llegaba a cargar para quien no había entrado todavía.', summary: 'Ten call sites still used base44.auth.redirectToLogin(), sending every anonymous visitor to Base44\'s platform-served /login so the Puntos+ SPA never mounted. This — not a deploy gap — is what kept the production smoke test red for nine days. New src/lib/goToLogin.js is the single owner of that navigation.' },
  { version: '2.0.18', date: '2026-09-09', resumen: 'Nueva pantalla "Acerca de": manual de usuario buscable, novedades de cada versión y a quién escribir. La sesión ahora avisa antes de cerrarse por inactividad, y en tu perfil puedes ver y cerrar las sesiones abiertas en otros dispositivos.', summary: 'Modules 19-23 of the ACACIA portfolio standard: lock rationale in every field description, session control (idle warning + device list + 48h stale-session reap), the About screen, no write decision taken from auth.me()\'s cached view (13 backend functions), and nav chrome surviving a reload.' },
  { version: '2.0.16', date: '2026-09-07', resumen: 'Revisión de mantenimiento: actualizaciones de seguridad de dependencias y correcciones internas. Sin cambios visibles en la app.', summary: 'Scheduled audit found production has not been serving the deployed code for at least 7 days (module 12\'s theme switcher is missing live — needs npm run deploy:site, not done here). Patched 4 dependency advisories (fflate, postcss-selector-parser, @humanfs/node, browserslist); react-router\'s advisory stays deferred pending a manual v7 migration. Documented the theme switcher in the user manual.' },
  { version: '2.0.15', date: '2026-08-24', resumen: 'Refuerzos de aislamiento entre negocios en el movimiento de puntos y en el código QR del monedero. Tu QR ahora sólo lo puede regenerar la app, no el navegador.', summary: 'Closed the three module-14 isolation findings: earnPoints/burnPoints now require the account\'s own tenant to match the store\'s, qr_token is locked from client writes (with a new refreshQrToken function backing Wallet.jsx\'s refresh), and LoyaltyAccount.business_id/store_id can no longer be written to a foreign tenant.' },
  { version: '2.0.14', date: '2026-08-18', resumen: 'La app muestra su versión y sus novedades desde dentro.', summary: 'Added an in-app version/changelog display and a real health-check endpoint audit (acaciaControl\'s ping action already existed and works — no code change needed there).' },
  { version: '2.0.13', date: '2026-08-17', resumen: 'Correcciones de permisos dentro de un mismo negocio, avisos que no se guardaban y errores al generar pases de monedero.', summary: 'Same-tenant RLS over-permission, notification-preference gap, wallet/email crash guards.' },
  { version: '2.0.12', date: '2026-08-10', resumen: 'Se corrigió que una misma venta pudiera acumular puntos dos veces.', summary: 'Points-dedup gap on earnPoints, dependency patches.' },
  { version: '2.0.11', date: '2026-07-28', resumen: 'Correcciones de seguridad en invitaciones y en el manejo de puntos.', summary: 'Cross-tenant invitation leak, scheduled-function auth, points dedup hardening.' },
  { version: '2.0.10', date: '2026-07-27', resumen: 'Refuerzos de aislamiento entre negocios e integridad de los saldos de puntos.', summary: 'Tenant-isolation and points-integrity hardening.' },
  { version: '2.0.9', date: '2026-07-20', resumen: 'Revisión de mantenimiento y verificación de correcciones anteriores.', summary: 'Release-hygiene audit: sync release metadata, verify prior fix is live.' },
];
