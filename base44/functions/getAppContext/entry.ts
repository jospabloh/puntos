import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { resolveCaller } from '../../shared/callerIdentity.ts';

// getAppContext — server-side resolution of platform context that the client
// cannot read directly (the owner/support emails are server-only secrets).
//
// Reads APP_OWNER_EMAIL (the platform owner / ACACIA) and APP_SUPPORT_EMAIL,
// and tells the client whether the signed-in user IS that owner. When the
// configured owner signs in but their Base44 role isn't yet `admin`, it
// self-heals by promoting them to `admin` via the service role — because the
// cross-tenant license/support console is only readable by role `admin` at the
// RLS layer. The promotion is gated entirely by the server-side email secret,
// so it is not a client-side privilege escalation.
//
// Never returns a secret value other than the support email (which is meant to
// be shown to users).
Deno.serve(async (req) => {
  const empty = { isOwner: false, promoted: false, supportEmail: null, ownerConfigured: false };
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    const ownerEmail = (Deno.env.get('APP_OWNER_EMAIL') || '').trim().toLowerCase();
    const supportEmail = Deno.env.get('APP_SUPPORT_EMAIL') || null;
    if (!user) {
      return Response.json({ ...empty, supportEmail, ownerConfigured: Boolean(ownerEmail) });
    }

    const isOwner = Boolean(ownerEmail) && (user.email || '').trim().toLowerCase() === ownerEmail;
    let promoted = false;

    // Módulo 22 — este es exactamente el "diff y me lo salto" que el módulo
    // nombra: si auth.me() dice 'admin' pero el registro almacenado NO lo es,
    // la promoción no corre, la respuesta sale igual de contenta y el dueño se
    // queda sin consola sin que nada lo delate. El rol se relee del registro.
    const caller = await resolveCaller(base44, user);
    const storedRole = caller ? caller.role : null;

    if (isOwner && storedRole !== 'admin') {
      // Server-gated promotion of the configured owner to the admin (owner) tier.
      try {
        await base44.asServiceRole.entities.User.update(user.id, { role: 'admin' });
        promoted = true;
      } catch (e) {
        console.error('Owner role promotion failed:', e?.message);
      }
    }

    return Response.json({
      isOwner,
      promoted,
      role: promoted ? 'admin' : user.role,
      supportEmail,
      ownerConfigured: Boolean(ownerEmail),
    });
  } catch (error) {
    console.error('getAppContext error:', error?.message);
    return Response.json(empty);
  }
});
