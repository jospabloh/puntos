import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveCaller, unresolvedCallerResponse } from '../../shared/callerIdentity.ts';

/**
 * Module 1 — the owner console's only write path into a tenant's license
 * state, and the reason `Business`'s license fields are now `rls.write:false`.
 *
 * The hole this closes: `Business`'s update rule granted whole-record write
 * access to a tenant's own `business_admin` (`$and[role:business_admin,
 * id:{{user.data.business_id}}]`) with NO field-level lock on
 * `billing_status` / `license_plan` / `trial_end_at` / `license_expires_at`.
 * Since the 2026-08-18 lifecycle consolidation the whole app derives
 * `isSuspended`/`isTrial` from `Business.billing_status`, so a tenant admin
 * could flip their own suspended tenant back to `active`, or extend their own
 * trial, with a single SDK call — contradicting Module 1's "written ONLY by
 * Mission Control's unified cron". Same defect class jospabloh/rumbo found and
 * fixed on `TenantLicense` (see its CLAUDE.md, module 1, 2026-08-19).
 *
 * Field-level RLS blocks the client for EVERY role, owner included, so the
 * owner console (PlatformLicenses.jsx / PlatformTenants.jsx) has to come
 * through here — `asServiceRole` bypasses field-level RLS the same way it
 * bypasses the entity-level rules.
 *
 * Gated on the platform tier (`role: admin`, i.e. app role `owner`) and
 * nothing else: a tenant's own admin gets 403 here rather than a silently
 * tenant-scoped write.
 */

// Only these may be written through `patch`. Anything else is dropped — this
// is the license surface, not a general-purpose Business editor (tenant
// settings go through guardedEntityWrite's own whitelist).
const PATCHABLE_FIELDS = [
  'billing_status',
  'status',
  'license_plan',
  'license_cycle',
  'license_expires_at',
  'license_activated_at',
  'licensed_user_limit',
  'licensed_store_limit',
  'trial_start_at',
  'trial_end_at',
  'auto_renewal',
  'payment_reference',
  'activation_notes',
  'activated_by_admin',
  'archived_at',
  'scheduled_delete_at',
  'view_only_since',
  'support_contacted_at',
];

const CREATABLE_FIELDS = [
  'name',
  'legal_name',
  'owner_email',
  'contact_email',
  'invite_code',
  'invite_code_active',
  ...PATCHABLE_FIELDS,
];

const EVENT_FIELDS = [
  'business_id',
  'business_name',
  'event_type',
  'from_status',
  'to_status',
  'from_plan',
  'to_plan',
  'expires_at',
  'effective_at',
  'notes',
];

function pick(source: Record<string, unknown> | undefined, fields: string[]) {
  const out: Record<string, unknown> = {};
  if (!source) return out;
  for (const field of fields) {
    if (field in source) out[field] = source[field];
  }
  return out;
}

function fail(status: number, error: string) {
  return Response.json({ success: false, error }, { status });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return fail(401, 'unauthorized');
    // Platform tier only. `role: admin` is the ACACIA owner — never a tenant's
    // own business_admin, however much of their own tenant they otherwise run.
    //
    // Módulo 22: el rol sale de una lectura FRESCA del registro User, no de la
    // vista cacheada de auth.me(). Esta función escribe campos de licencia con
    // rls.write:false; si a alguien le acaban de quitar `admin`, su sesión aún
    // lo dice y ese es el peor momento para creerle.
    const caller = await resolveCaller(base44, user);
    if (!caller) return unresolvedCallerResponse();
    if (caller.role !== 'admin') return fail(403, 'forbidden');

    const body = await req.json().catch(() => ({}));
    const { action } = body ?? {};

    if (action === 'patch') {
      const { business_id: businessId, patch, event } = body;
      if (!businessId) return fail(400, 'business_id es obligatorio.');
      const updates = pick(patch, PATCHABLE_FIELDS);
      if (!Object.keys(updates).length) return fail(400, 'Nada que actualizar.');

      const record = await base44.asServiceRole.entities.Business.update(businessId, updates);
      // The event is written in the same call so a license change can never
      // land without its audit row (the client used to make two independent
      // requests, and the second could simply not happen).
      if (event) {
        await base44.asServiceRole.entities.LicenseEvent.create({
          ...pick(event, EVENT_FIELDS),
          business_id: businessId,
          actor_email: user.email,
          effective_at: event.effective_at || new Date().toISOString(),
        });
      }
      return Response.json({ success: true, business: record });
    }

    if (action === 'create_tenant') {
      const { business, event } = body;
      const payload = pick(business, CREATABLE_FIELDS);
      if (!payload.name) return fail(400, 'name es obligatorio.');

      const created = await base44.asServiceRole.entities.Business.create(payload);
      if (event) {
        await base44.asServiceRole.entities.LicenseEvent.create({
          ...pick(event, EVENT_FIELDS),
          business_id: created.id,
          business_name: created.name,
          actor_email: user.email,
          effective_at: event.effective_at || new Date().toISOString(),
        });
      }
      return Response.json({ success: true, business: created });
    }

    if (action === 'log_event') {
      const created = await base44.asServiceRole.entities.LicenseEvent.create({
        ...pick(body.event, EVENT_FIELDS),
        actor_email: user.email,
        effective_at: body.event?.effective_at || new Date().toISOString(),
      });
      return Response.json({ success: true, event: created });
    }

    return fail(400, `Acción no permitida: ${action}`);
  } catch (error) {
    console.error('licensesAdmin failed:', error);
    return fail(500, 'No se pudo completar la operación.');
  }
});
