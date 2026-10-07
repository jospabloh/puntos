// scheduledGuard — decide whether a scheduled backend function should run NOW.
//
// This used to compare a shared secret (`SCHEDULED_TASK_SECRET`) passed in the
// workflow's function_args. It no longer does, and the reason is not taste:
// Base44 mirrors every workflow into `base44/workflows/*.jsonc` and commits that
// tree to GitHub itself (as `base44-builder[bot]`). A secret that has to sit in a
// workflow's args therefore ends up in git every time anyone — a person or an
// API call — saves the workflow. Rotating it only moves the leak; the 2026-10-07
// rotation was committed to `main` seven times in an afternoon. A credential the
// platform republishes on its own is not a credential.
//
// What replaces it is not authentication, and it says so: it is a RATE bound.
// Each function runs at most once per its own schedule period. Anyone who finds
// the function URL can still call it, but the call either does the one run the
// scheduler was about to do anyway, or is a no-op that returns `skipped`. There
// is nothing to leak and nothing to brute-force, and an attacker cannot make
// these jobs do MORE work than the schedule already does — only the same work
// slightly earlier.
//
// That bound is what makes dropping the secret acceptable for these five jobs
// (QR rotation, wallet refresh, session purge, two email digests). It would NOT
// be acceptable for a function whose single run is itself harmful or whose
// effect depends on who asked — those need a real caller identity, not this.
//
// The claim lives in `AuditLog` (entity_type `ScheduledRun`), which is already
// deployed: a field or entity that exists only in the repo is silently dropped on
// write, and a gate that cannot persist its own claim would look like it worked
// while bounding nothing. Rows carry no `business_id`, so no tenant's RLS branch
// can read them; only the platform owner and the service role can.
//
// FAILS CLOSED: if the claim cannot be read or written, the job does NOT run and
// the response is 503. Silently running ungated on a storage error would turn a
// bookkeeping fault into the unbounded version of the very thing this prevents.
//
// Usage — rename the handler and wrap it, leaving its body untouched:
//   async function run(req: Request): Promise<Response> { ...existing handler... }
//   Deno.serve((req) => runScheduled(createClientFromRequest(req), 'myJob', EVERY_DAY, () => run(req)));

/** The least time between two runs of a job on this schedule, with slack. */
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Not the period itself: the scheduler fires with seconds of jitter, and a run at
// 13:34:02 followed by one at 14:13:33 is 59:31 apart. A gate set to exactly the
// period would reject the legitimate run. ~75-85% of the period keeps the bound
// meaningful (still at most one run per period) without eating real runs.
export const EVERY_HOUR = 45 * MINUTE;
export const EVERY_DAY = 20 * HOUR;
export const EVERY_WEEK = 6 * DAY;

const ENTITY_TYPE = 'ScheduledRun';

// Only the surface this file touches, so a test can hand in a fake without
// pulling in the SDK.
interface AuditLogApi {
  filter(query: Record<string, unknown>, sort?: string, limit?: number): Promise<AuditRow[]>;
  create(data: Record<string, unknown>): Promise<AuditRow>;
  delete(id: string): Promise<unknown>;
}
interface AuditRow { id: string; created_date?: string }
// `entities` is typed `{}` by the SDK (the same gap every function here already
// works around), so demanding `{ AuditLog: ... }` at the boundary would add a new
// type error to every caller. Accept anything object-shaped and narrow inside.
interface ClientLike { asServiceRole: { entities: object } }

export interface ScheduledClaim {
  ok: boolean;
  /** Why the run was refused: `ran_recently`, `concurrent_run`, or `gate_unavailable`. */
  reason?: string;
  /** Give the period back, so the next scheduled attempt may retry a run that failed. */
  release: () => Promise<void>;
}

// Base44 stamps `created_date` without a zone ("2026-10-07T03:59:03.502000").
// `Date.parse` would read that as LOCAL time; the runtime's zone is not ours to
// assume, so a zoneless stamp is taken as UTC.
function stampMs(s?: string): number {
  if (!s) return NaN;
  return Date.parse(/(Z|[+-]\d\d:?\d\d)$/.test(s) ? s : `${s}Z`);
}

const NOOP = async () => {};

/**
 * Claim this job's run for the current period.
 *
 * Read, write, re-read: the first read is the cheap common case (already ran —
 * skip without writing). The write-then-re-read is for two invocations landing
 * together, which would both pass the first read: whichever claim is OLDEST in
 * the window wins and the other withdraws its row.
 */
export async function claimScheduledRun(
  base44: ClientLike,
  name: string,
  minIntervalMs: number,
  nowMs: number = Date.now(),
): Promise<ScheduledClaim> {
  const log = (base44.asServiceRole.entities as { AuditLog: AuditLogApi }).AuditLog;
  const since = nowMs - minIntervalMs;
  const key = { entity_type: ENTITY_TYPE, entity_id: name };
  const inWindow = (rows: AuditRow[]) => rows.filter((r) => stampMs(r.created_date) >= since);

  try {
    if (inWindow(await log.filter(key, '-created_date', 10)).length > 0) {
      return { ok: false, reason: 'ran_recently', release: NOOP };
    }

    const mine = await log.create({
      ...key,
      action: 'update',
      actor_id: 'system',
      actor_role: 'system',
      payload_summary: 'scheduled run claimed',
      metadata: { claimed_at: new Date(nowMs).toISOString(), min_interval_ms: minIntervalMs },
    });

    const release = async () => {
      try { await log.delete(mine.id); } catch { /* best-effort: worst case the period stays spent */ }
    };

    const claimed = inWindow(await log.filter(key, '-created_date', 10));
    const oldest = claimed.reduce<AuditRow | null>(
      (a, r) => (a === null || stampMs(r.created_date) < stampMs(a.created_date) ? r : a),
      null,
    );
    if (oldest && oldest.id !== mine.id) {
      await release();
      return { ok: false, reason: 'concurrent_run', release: NOOP };
    }
    return { ok: true, release };
  } catch (e) {
    console.error(`scheduledGuard: cannot claim "${name}":`, e);
    return { ok: false, reason: 'gate_unavailable', release: NOOP };
  }
}

/**
 * Run `job` only if this period's run is still unclaimed, and give the period
 * back if the job fails so the next scheduled attempt can try again. A job that
 * succeeds keeps its claim: that is the bound.
 */
export async function runScheduled(
  base44: ClientLike,
  name: string,
  minIntervalMs: number,
  job: () => Promise<Response>,
): Promise<Response> {
  const claim = await claimScheduledRun(base44, name, minIntervalMs);
  if (!claim.ok) {
    if (claim.reason === 'gate_unavailable') {
      return Response.json({ error: 'gate_unavailable', skipped: true }, { status: 503 });
    }
    return Response.json({ skipped: true, reason: claim.reason });
  }

  let res: Response;
  try {
    res = await job();
  } catch (e) {
    await claim.release();
    throw e;
  }
  if (!res.ok) await claim.release();
  return res;
}
