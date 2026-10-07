// Run: deno test base44/shared/scheduledGuard.test.ts
//
// No imports besides the module under test and the std assert shim below, and no
// network: it runs in a sandbox where deno.land / jsr.io are blocked.
//
// What these pin is the BOUND, not the plumbing. The gate replaced a shared
// secret; the only thing left standing between an anonymous caller and a job that
// mails every account is "at most once per period". A test that only proved a
// first call succeeds would pass on a gate that bounds nothing.
import { claimScheduledRun, runScheduled, EVERY_HOUR, EVERY_DAY, EVERY_WEEK } from './scheduledGuard.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}
function eq<T>(a: T, b: T, msg: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
}

// In-memory AuditLog. `created_date` is zoneless, exactly as Base44 stamps it
// (the module must read that as UTC), and strictly increasing so "oldest claim
// wins" is deterministic. `failOn` makes a method throw, for the fail-closed case.
function fakeClient(opts: { startMs?: number; failOn?: 'filter' | 'create' } = {}) {
  let clock = opts.startMs ?? Date.UTC(2026, 9, 7, 6, 0, 0);
  let seq = 0;
  const rows: Array<Record<string, any>> = [];
  const stamp = (ms: number) => new Date(ms).toISOString().replace('Z', '000');
  const AuditLog = {
    async filter(query: Record<string, unknown>, _sort?: string, limit = 50) {
      await Promise.resolve(); // a real call yields; this is what lets two claims interleave
      if (opts.failOn === 'filter') throw new Error('storage down');
      return rows
        .filter((r) => Object.entries(query).every(([k, v]) => r[k] === v))
        .sort((a, b) => (a.created_date < b.created_date ? 1 : -1))
        .slice(0, limit);
    },
    async create(data: Record<string, unknown>) {
      await Promise.resolve();
      if (opts.failOn === 'create') throw new Error('storage down');
      clock += 1;
      const row = { id: `r${++seq}`, created_date: stamp(clock), ...data };
      rows.push(row);
      return row;
    },
    async delete(id: string) {
      await Promise.resolve();
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) rows.splice(i, 1);
    },
  };
  return {
    client: { asServiceRole: { entities: { AuditLog } } },
    rows,
    advance: (ms: number) => { clock += ms; },
    now: () => clock,
  };
}

Deno.test('first call in a period runs', async () => {
  const f = fakeClient();
  const c = await claimScheduledRun(f.client, 'job', EVERY_DAY, f.now());
  assert(c.ok, 'first claim should be granted');
  eq(f.rows.length, 1, 'one claim row written');
  eq(f.rows[0].actor_id, 'system', 'AuditLog requires actor_id');
  eq(f.rows[0].entity_type, 'ScheduledRun', 'claims are findable by entity_type');
});

Deno.test('a second call inside the period is refused — this is the bound', async () => {
  const f = fakeClient();
  assert((await claimScheduledRun(f.client, 'job', EVERY_DAY, f.now())).ok, 'first');
  f.advance(60 * 1000);
  const again = await claimScheduledRun(f.client, 'job', EVERY_DAY, f.now());
  assert(!again.ok, 'second call within the day must not run');
  eq(again.reason, 'ran_recently', 'reason');
  eq(f.rows.length, 1, 'a refused call must not write a claim');
});

Deno.test('hammering the endpoint does not multiply the work', async () => {
  const f = fakeClient();
  let ran = 0;
  for (let i = 0; i < 50; i++) {
    f.advance(1000);
    const res = await runScheduled(f.client, 'job', EVERY_DAY, async () => { ran++; return Response.json({ ok: true }); });
    assert(res.status === 200, 'refusals are 200 skipped, not errors');
  }
  eq(ran, 1, 'fifty calls in under a minute, exactly one run');
});

Deno.test('the legitimate next run is NOT eaten by scheduler jitter', async () => {
  // A daily job fired at 08:03:33 and again 24h later at 08:03:31 is 23:59:58
  // apart. A gate set to the exact period would reject that run; the slack must not.
  const f = fakeClient();
  assert((await claimScheduledRun(f.client, 'daily', EVERY_DAY, f.now())).ok, 'day 1');
  f.advance(24 * 3600 * 1000 - 2000);
  assert((await claimScheduledRun(f.client, 'daily', EVERY_DAY, f.now())).ok, 'day 2, 2s early');
});

Deno.test('hourly and weekly windows admit their own cadence and refuse a faster one', async () => {
  const h = fakeClient();
  assert((await claimScheduledRun(h.client, 'h', EVERY_HOUR, h.now())).ok, 'hour 1');
  h.advance(10 * 60 * 1000);
  assert(!(await claimScheduledRun(h.client, 'h', EVERY_HOUR, h.now())).ok, '10 min later is too soon');
  h.advance(50 * 60 * 1000);
  assert((await claimScheduledRun(h.client, 'h', EVERY_HOUR, h.now())).ok, '1h later is fine');

  const w = fakeClient();
  assert((await claimScheduledRun(w.client, 'w', EVERY_WEEK, w.now())).ok, 'week 1');
  w.advance(3 * 24 * 3600 * 1000);
  assert(!(await claimScheduledRun(w.client, 'w', EVERY_WEEK, w.now())).ok, '3 days later is too soon');
  w.advance(4 * 24 * 3600 * 1000);
  assert((await claimScheduledRun(w.client, 'w', EVERY_WEEK, w.now())).ok, '7 days later is fine');
});

Deno.test('jobs do not share a window', async () => {
  const f = fakeClient();
  assert((await claimScheduledRun(f.client, 'a', EVERY_DAY, f.now())).ok, 'a');
  assert((await claimScheduledRun(f.client, 'b', EVERY_DAY, f.now())).ok, 'b is a different job');
});

Deno.test('two invocations landing together: exactly one runs', async () => {
  const f = fakeClient();
  const [a, b] = await Promise.all([
    claimScheduledRun(f.client, 'job', EVERY_DAY, f.now()),
    claimScheduledRun(f.client, 'job', EVERY_DAY, f.now()),
  ]);
  eq([a.ok, b.ok].filter(Boolean).length, 1, 'one winner, not zero and not two');
  eq(f.rows.length, 1, 'the loser withdrew its claim row');
});

Deno.test('a failed job gives the period back so the next attempt can retry', async () => {
  const f = fakeClient();
  const bad = await runScheduled(f.client, 'job', EVERY_DAY, async () => Response.json({ error: 'x' }, { status: 500 }));
  eq(bad.status, 500, 'the failure is passed through');
  eq(f.rows.length, 0, 'claim released after a non-2xx');
  f.advance(3600 * 1000);
  const retry = await claimScheduledRun(f.client, 'job', EVERY_DAY, f.now());
  assert(retry.ok, 'a failed run must not burn the whole day');
});

Deno.test('a job that throws also releases', async () => {
  const f = fakeClient();
  let threw = false;
  try {
    await runScheduled(f.client, 'job', EVERY_DAY, async () => { throw new Error('boom'); });
  } catch { threw = true; }
  assert(threw, 'the throw must propagate');
  eq(f.rows.length, 0, 'claim released after a throw');
});

Deno.test('a successful job KEEPS its claim', async () => {
  const f = fakeClient();
  await runScheduled(f.client, 'job', EVERY_DAY, async () => Response.json({ ok: true }));
  eq(f.rows.length, 1, 'success must keep the claim — releasing it would unbound the job');
});

Deno.test('FAILS CLOSED: if the claim cannot be read, the job does not run', async () => {
  const f = fakeClient({ failOn: 'filter' });
  let ran = false;
  const res = await runScheduled(f.client, 'job', EVERY_DAY, async () => { ran = true; return Response.json({ ok: true }); });
  assert(!ran, 'must not run ungated on a storage error');
  eq(res.status, 503, 'surfaced as 503, not silently 200');
});

Deno.test('FAILS CLOSED: if the claim cannot be written, the job does not run', async () => {
  const f = fakeClient({ failOn: 'create' });
  let ran = false;
  const res = await runScheduled(f.client, 'job', EVERY_DAY, async () => { ran = true; return Response.json({ ok: true }); });
  assert(!ran, 'must not run if it cannot persist its own claim');
  eq(res.status, 503, '503');
});

Deno.test('a zoneless created_date is read as UTC, not local time', async () => {
  // Base44 stamps "2026-10-07T06:00:00.001000" with no zone. If that were read as
  // local time on a runtime in UTC-6, a fresh claim would look 6h old and the gate
  // would open. Proven by claiming "now" and refusing a call a minute later.
  const f = fakeClient();
  assert((await claimScheduledRun(f.client, 'job', EVERY_DAY, f.now())).ok, 'claim');
  assert(!/Z$/.test(f.rows[0].created_date), 'fixture really is zoneless');
  f.advance(60 * 1000);
  assert(!(await claimScheduledRun(f.client, 'job', EVERY_DAY, f.now())).ok, 'still inside the window');
});
