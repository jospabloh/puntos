import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// acceptInvitation — a user accepts a pending team invitation.
//
// Why server-side: onboarding used to read the Invitation on the client and then
// self-assign role/business_id via auth.updateMe. Because the User entity had no
// write protection, a malicious user could skip the invitation entirely and call
// updateMe({ role: 'business_admin'|'admin', data: { business_id: <anything> } }).
// This function is the only sanctioned path: it verifies a real pending invite
// addressed to THIS user's email and assigns exactly the role/tenant the invite
// grants — with the service role, and never `admin` (an invite can't mint owners).
//
// Modulo 18 (jospabloh/acacia-app-standard -> STANDARD.md, 2026-08-26): accepting
// an invitation used to overwrite business_id/role unconditionally, with no
// record of whatever business the caller belonged to before. A business_admin
// of Business A invited to join Business B as staff would silently and
// irreversibly lose access to A the moment they accepted. Now, before moving
// business_id away from the caller's current tenant role, that membership is
// backfilled into Membership -- and a Membership row for the invitation's own
// business is created (or reused, if one already exists) -- so joining a
// second business is always safe and reversible via switchBusiness.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const invitationId = body?.invitationId;

    const sr = base44.asServiceRole;
    const email = (user.email || '').trim().toLowerCase();
    if (!email) return Response.json({ error: 'No email on account' }, { status: 400 });

    // Pending invitations for THIS user's email (the email is the trust anchor —
    // the invite was addressed to it). Never trust a business_id from the client.
    const pending = await sr.entities.Invitation.filter({ email, status: 'pending' });
    let inv = null;
    if (invitationId) {
      inv = (pending || []).find((i: Record<string, unknown>) => i.id === invitationId) || null;
    } else {
      inv = (pending && pending.length > 0) ? pending[0] : null;
    }
    if (!inv) return Response.json({ error: 'No pending invitation for this account' }, { status: 404 });
    if ((inv.email || '').trim().toLowerCase() !== email) {
      return Response.json({ error: 'Invitation email mismatch' }, { status: 403 });
    }

    // An invitation can only grant business_admin or staff (merchant) — never the
    // platform-owner tier. An existing platform owner keeps admin.
    const grantsAdmin = inv.role === 'business_admin';
    const role = user.role === 'admin' ? 'admin' : (grantsAdmin ? 'business_admin' : 'merchant');
    const appRole = user.role === 'admin' ? 'owner' : (grantsAdmin ? 'business_admin' : 'staff');

    // A store assignment is only trusted after re-fetching the Store server-side
    // and confirming it actually belongs to the invitation's business. Invitation
    // RLS only checks business_id on create, never that store_id belongs to it —
    // a forged Invitation (business_id: own tenant, store_id: another tenant's
    // store) would otherwise land a mismatched store_id on this user, and several
    // entities' merchant RLS branches key on store_id alone with no business_id
    // check, granting cross-tenant access. Fail closed: drop the store instead of
    // trusting it.
    let storeId: string | undefined;
    let storeName: string | undefined;
    if (inv.store_id) {
      const store = await sr.entities.Store.get(inv.store_id).catch(() => null);
      if (store && store.business_id === inv.business_id) {
        storeId = store.id;
        storeName = store.name;
      }
    }

    // Backfill a Membership for whatever business the caller was already
    // administering/staffing, BEFORE moving business_id away from it — a lazy,
    // one-time migration for accounts that predate Membership. Only meaningful
    // for a real tenant role; the platform owner (handled below) has none to
    // preserve, and a brand-new user has no prior business_id at all.
    if (user.business_id && (user.role === 'business_admin' || user.role === 'merchant')) {
      const already = await sr.entities.Membership.filter(
        { business_id: user.business_id, user_id: user.id }, undefined, 1,
      );
      if (!already?.length) {
        await sr.entities.Membership.create({
          business_id: user.business_id,
          business_name: user.business_name || '',
          user_id: user.id,
          user_email: user.email,
          role: user.role,
          store_id: user.store_id || user.storeId || '',
          store_name: user.store_name || '',
        });
      }
    }

    // Membership for the business this invitation grants — same skip for the
    // platform owner as createBusiness (their tier isn't a Membership role,
    // and they keep `admin` below regardless). Idempotent: accepting an
    // invitation to a business already joined reuses the existing row rather
    // than overwriting a role an admin may have since promoted by hand.
    if (user.role !== 'admin') {
      const existingHere = await sr.entities.Membership.filter(
        { business_id: inv.business_id, user_id: user.id }, undefined, 1,
      );
      if (!existingHere?.length) {
        await sr.entities.Membership.create({
          business_id: inv.business_id,
          business_name: inv.business_name || '',
          user_id: user.id,
          user_email: user.email,
          role: grantsAdmin ? 'business_admin' : 'merchant',
          store_id: storeId || '',
          store_name: storeName || '',
        });
      }
    }

    await sr.entities.User.update(user.id, {
      role,
      app_role: appRole,
      business_id: inv.business_id,
      business_name: inv.business_name,
      storeId: storeId,
      store_id: storeId,
      store_name: storeName,
      merchant_role: grantsAdmin ? undefined : 'merchant',
      onboarding_completed: true,
    });

    try {
      await sr.entities.Invitation.update(inv.id, {
        status: 'accepted',
        accepted_at: new Date().toISOString(),
      });
    } catch { /* audit best-effort */ }

    return Response.json({
      success: true,
      role,
      business_id: inv.business_id,
      business_name: inv.business_name,
      store_id: inv.store_id || null,
      store_name: inv.store_name || null,
      is_admin: grantsAdmin,
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    return Response.json({ error: 'Failed to accept invitation' }, { status: 500 });
  }
});
