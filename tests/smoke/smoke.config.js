// Per-app half of the shared smoke suite. smoke.spec.js next to this file is
// byte-identical across the portfolio — the canonical copy lives in
// `jospabloh/acacia-app-standard` → `shared/smoke/`. Change it there and copy
// it out; everything specific to this app belongs here instead.
export default {
  name: 'Puntos+',
  url: 'https://puntosplus.acaciaco.com.mx',

  // Verbatim from this repo's index.html — proves the deploy served THIS app
  // and not a stale or unrelated one.
  title: /Puntos\+/,

  theme: {
    // Tailwind's `.dark` on <html>.
    kind: 'class',
    root: '[data-theme-switcher]',
  },

  // The "switcher covers nothing" check walks these, not the home page — and the
  // reason is a race, not taste. An anonymous visit to `/` is redirected to
  // `/Login` by the app itself (src/lib/goToLogin.js), on a timer set by how long
  // `auth.me()` takes to fail. The check does `goto('/', {waitUntil:'load'})` and
  // then inspects the page, so it was racing that redirect:
  //   - redirect lands DURING goto  -> `net::ERR_ABORTED` (the load is cancelled)
  //   - redirect lands AFTER goto   -> `Execution context was destroyed` mid-evaluate
  // Measured against production 2026-10-07: 6 failures in 6 runs from a laptop,
  // intermittent on the CI runner (green runs #47-#49, red #50-#51 with no code
  // change between them). Production itself was fine the whole time — an anonymous
  // visitor lands on `/Login` with the switcher mounted.
  //
  // `/Login` is where that visitor actually ends up, it does not redirect, and it
  // is the screen with the most chrome to collide with (the split auth panel), so
  // it is the better place to look, not a lesser one. `./` is NOT also listed: it
  // always resolves to this same screen, and listing it re-introduces the race.
  // Relative like the suite's own HOME, so it resolves under any SMOKE_URL.
  routes: ['./Login'],
};
