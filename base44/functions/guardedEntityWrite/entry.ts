import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { resolveCaller, unresolvedCallerResponse } from '../../shared/callerIdentity.ts';

/**
 * Module 3's server-side half for Puntos+.
 *
 * `src/lib/rbac.js`'s PERMISSIONS matrix and the per-tenant `PermissionProfile`
 * override were, until this landed, enforced NOWHERE but the client: `can()`
 * hides a button, and every one of these entities was then written straight
 * from the browser with `base44.entities.X.create/update/delete()`. RLS is not
 * a substitute — it enforces tenant isolation and the coarse role branches,
 * but it has no way to see:
 *
 *  1. a `PermissionProfile` override (a business_admin denying their staff a
 *     specific capability — it lives on a different row, and Base44 RLS
 *     templates cannot join);
 *  2. `Business.billing_status` (also a different row) — the same
 *     `canTenantWrite()` gate the POS/redemption functions already enforce
 *     server-side, which these entities never inherited.
 *
 * Precedence mirrors `can()` in src/lib/rbac.js EXACTLY:
 *   1. app role `owner` → always allowed (the platform super-tier);
 *   2. explicit true/false in that tenant's PermissionProfile for the caller's
 *      role wins;
 *   3. else the PERMISSIONS default for the role;
 *   4. and separately, a view_only/suspended/archived tenant is refused every
 *      write regardless.
 *
 * PERMISSIONS below is a hand-kept mirror of src/lib/rbac.js (Deno cannot
 * import from src/). `npm run validate:permissions` fails the build on drift.
 *
 * Deliberately NOT routed through here — each already closed by a
 * non-spoofable built-in in its own RLS, exactly like the `AppSession`
 * exclusion documented in jospabloh/stockflow's CLAUDE.md:
 *   - `AppSession` (scoped to `created_by_id`, and gating a heartbeat on
 *     billing would lock a suspended tenant out of the screen explaining why);
 *   - a customer's own `LoyaltyAccount` / `NotificationPreference`
 *     (scoped to their own `user_id`, no capability finer than "your own row");
 *   - `SupportTicket` / `SupportTicketMessage` — support must stay reachable
 *     for a suspended tenant, which is the whole reason `updateSupportTicket`
 *     is left outside the billing gate in the rest of the portfolio too;
 *   - `Business` license/billing fields and `LicenseEvent`, which belong to
 *     the owner-only `licensesAdmin` function (Module 1), not here.
 */

// AUTOGEN-ADJACENT: mirror of PERMISSIONS in src/lib/rbac.js. Only the keys
// this function actually gates are listed; validate-permissions.mjs checks
// every one of them against the client matrix and fails on any difference.
const PERMISSIONS: Record<string, string[]> = {
  'business:update_settings': ['owner', 'business_admin'],
  'users:invite': ['owner', 'business_admin'],
  'users:update_role': ['owner', 'business_admin'],
  'users:remove': ['owner', 'business_admin'],
  'stores:create': ['owner', 'business_admin'],
  'stores:update': ['owner', 'business_admin'],
  'stores:delete': ['owner', 'business_admin'],
  'campaigns:manage': ['owner', 'business_admin'],
  'offers:manage': ['owner', 'business_admin'],
};

/**
 * Per-entity: which capability gates each operation, and which fields may be
 * written. Anything not listed in `fields` is dropped — mass-assignment
 * protection, and the reason `Business` cannot be used from here to touch
 * `billing_status`/`license_plan`/`trial_end_at`: those are Mission Control's
 * (Module 1) and are absent from the whitelist on purpose.
 */
const ENTITY_CONFIG: Record<
  string,
  {
    create: string | null;
    update: string;
    delete: string | null;
    fields: string[];
    // Business is keyed by its own built-in id, not by a business_id field.
    tenantKey: 'business_id' | 'id';
  }
> = {
  Campaign: {
    create: 'campaigns:manage',
    update: 'campaigns:manage',
    delete: 'campaigns:manage',
    tenantKey: 'business_id',
    fields: [
      'name', 'description', 'business_name', 'type', 'status', 'start_date', 'end_date',
      'multiplier', 'bonus_points', 'min_purchase', 'max_points_per_user',
      'eligible_stores', 'eligible_tiers', 'rules', 'total_budget', 'used_budget',
    ],
  },
  Offer: {
    create: 'offers:manage',
    update: 'offers:manage',
    delete: 'offers:manage',
    tenantKey: 'business_id',
    fields: [
      'title', 'description', 'short_description', 'business_name', 'type', 'campaign_id',
      'points_cost', 'value_mxn', 'image_url', 'category', 'status', 'stock',
      'eligible_tiers', 'eligible_stores', 'start_date', 'end_date', 'terms',
      'recommendation_tags',
    ],
  },
  Store: {
    create: 'stores:create',
    update: 'stores:update',
    delete: 'stores:delete',
    tenantKey: 'business_id',
    fields: [
      'name', 'business_name', 'merchant_id', 'merchant_name', 'merchant_email',
      'address', 'city', 'state', 'phone', 'status', 'points_rate', 'min_purchase',
      'daily_earn_limit', 'logo_url', 'metadata',
      // `code` is deliberately absent: it is server-authoritative and assigned
      // by the createStore function, never chosen by the client.
    ],
  },
  Invitation: {
    create: 'users:invite',
    update: 'users:remove',
    delete: 'users:remove',
    tenantKey: 'business_id',
    fields: [
      'business_name', 'email', 'role', 'store_id', 'store_name', 'status',
      'invited_by', 'expires_at',
      // `accepted_at` is written by acceptInvitation (service role), not here.
    ],
  },
  PermissionProfile: {
    // The override store itself. Whoever can write this can grant capabilities,
    // so it is gated on the same key as changing someone's role.
    create: 'users:update_role',
    update: 'users:update_role',
    delete: 'users:update_role',
    tenantKey: 'business_id',
    fields: ['label', 'permissions', 'role_key', 'updated_by'],
  },
  Business: {
    // Settings only — creating or deleting a tenant is the owner console's
    // job (licensesAdmin), never a tenant's own.
    create: null,
    update: 'business:update_settings',
    delete: null,
    tenantKey: 'id',
    fields: [
      'name', 'legal_name', 'rfc', 'contact_email', 'phone', 'address', 'city',
      'state', 'industry', 'logo_url', 'primary_color', 'invite_code',
      'invite_code_active',
    ],
  },
};

const BLOCKED_BILLING = new Set(['view_only', 'suspended', 'archived']);

/**
 * Same condition as `canTenantWrite()` in src/lib/useTenant.js, and identical
 * to the inline copies in earnPoints/burnPoints/redeemOffer/createStore.
 * Keep all of them in sync if the write-gate logic changes.
 */
function isBusinessWriteBlocked(business: Record<string, unknown> | null | undefined): boolean {
  if (!business) return false;
  if (BLOCKED_BILLING.has(String(business.billing_status || ''))) return true;
  return business.status === 'suspended';
}

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return Response.json({ success: false, error, ...extra }, { status });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return fail(401, 'unauthorized');

    const body = await req.json().catch(() => ({}));
    const { entity, operation, id, data } = body ?? {};

    const config = ENTITY_CONFIG[entity];
    if (!config) return fail(400, `Entidad no permitida: ${entity}`);
    if (!['create', 'update', 'delete'].includes(operation)) {
      return fail(400, `Operación no permitida: ${operation}`);
    }

    const key = config[operation as 'create' | 'update' | 'delete'];
    if (!key) return fail(400, `Operación no disponible para ${entity}: ${operation}`);

    // Tenant and role are ALWAYS the caller's own, re-derived from a FRESH
    // service-role read of their user record (module 22) — never from the
    // request body, and never from auth.me()'s cached session view, which goes
    // stale the moment manageTeamMember writes those fields.
    const caller = await resolveCaller(base44, user);
    if (!caller) return unresolvedCallerResponse();

    const role = caller.appRole;
    const isOwner = role === 'owner';
    const businessId = caller.businessId;
    if (!isOwner && !businessId) return fail(403, 'No perteneces a ningún negocio.');

    // For update/delete, the EXISTING record's tenant is what gets checked, so
    // a client cannot submit a foreign id to escape its own tenant's gates.
    if (operation !== 'create') {
      if (!id) return fail(400, 'id es obligatorio.');
      const existing = await base44.asServiceRole.entities[entity].get(id).catch(() => null);
      if (!existing) return fail(404, 'Registro no encontrado.');
      const recordTenant = config.tenantKey === 'id' ? existing.id : existing.business_id;
      if (!isOwner && recordTenant !== businessId) return fail(403, 'forbidden');
    }

    if (!isOwner) {
      // Precedence 2 — an explicit override for this tenant + role wins.
      const profiles = await base44.asServiceRole.entities.PermissionProfile.filter({
        business_id: businessId,
        role_key: role,
      });
      const override = profiles?.[0]?.permissions?.[key];

      let allowed: boolean;
      if (override === true || override === false) {
        allowed = override;
      } else {
        // Precedence 3 — the default matrix.
        allowed = Array.isArray(PERMISSIONS[key]) && PERMISSIONS[key].includes(role);
      }
      if (!allowed) return fail(403, 'forbidden', { permission: key });

      // Precedence 4 — the billing gate RLS cannot express.
      const businesses = await base44.asServiceRole.entities.Business.filter({ id: businessId });
      if (isBusinessWriteBlocked(businesses?.[0])) {
        return fail(403, 'write_blocked', { billing_status: businesses?.[0]?.billing_status });
      }
    }

    if (operation === 'delete') {
      await base44.asServiceRole.entities[entity].delete(id);
      return Response.json({ success: true });
    }

    const sanitized: Record<string, unknown> = {};
    for (const field of config.fields) {
      if (data && field in data) sanitized[field] = data[field];
    }

    if (operation === 'create') {
      const record = await base44.asServiceRole.entities[entity].create({
        ...sanitized,
        business_id: isOwner ? (data?.business_id ?? businessId) : businessId,
      });
      return Response.json({ success: true, record });
    }

    const record = await base44.asServiceRole.entities[entity].update(id, sanitized);
    return Response.json({ success: true, record });
  } catch (error) {
    console.error('guardedEntityWrite failed:', error);
    return fail(500, 'No se pudo completar la operación.');
  }
});
