// scheduledGuard — shared verification that a backend function was invoked by
// the platform's scheduled automation, not by an anonymous external caller.
//
// The scheduler passes SCHEDULED_TASK_SECRET via the automation's function_args
// (which arrive as the request body). This compares that token against the same
// value stored as an app secret, timing-safe. Without it, anyone who knows the
// function URL could trigger mass-email sends and other privileged operations.
//
// Usage:
//   const guard = await verifyScheduledRequest(req);
//   if (!guard.ok) return unauthorizedResponse(guard.reason || 'Forbidden');

/** Constant-time string comparison (equal-length inputs only). */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

export interface ScheduledGuardResult {
  ok: boolean;
  body: Record<string, unknown> | null;
  reason?: string;
}

/**
 * Verify the request carries the scheduled-task shared secret.
 * Checks the `X-Scheduled-Token` header first, then a `scheduled_token` field
 * in the JSON body. Returns the parsed body so the caller can reuse it.
 */
export async function verifyScheduledRequest(req: Request): Promise<ScheduledGuardResult> {
  const expected = Deno.env.get('SCHEDULED_TASK_SECRET');
  if (!expected) {
    return { ok: false, body: null, reason: 'SCHEDULED_TASK_SECRET not configured' };
  }

  const headerToken = req.headers.get('X-Scheduled-Token');
  if (headerToken) {
    return { ok: timingSafeEqual(headerToken, expected), body: null };
  }

  let body: Record<string, unknown> | null = null;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const bodyToken = typeof body?.scheduled_token === 'string' ? body.scheduled_token : '';
  return { ok: timingSafeEqual(bodyToken, expected), body };
}

/** 403 response for unauthorized invocations. */
export function unauthorizedResponse(reason: string): Response {
  return Response.json({ error: 'Forbidden', reason }, { status: 403 });
}