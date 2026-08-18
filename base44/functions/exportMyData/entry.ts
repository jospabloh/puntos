import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// "Descargar mis datos" — module 7 (cuenta y zona de peligro) of the
// portfolio standard requires a self-service data export, not just a
// profile-edit page. Returns the caller's own loyalty data as one JSON
// payload; Profile.jsx turns it into a client-side download.
//
// Runs as service role so it can read across LoyaltyAccount/PointsLedger/
// Redemption by user_id/account_id directly, rather than depending on each
// entity's own RLS shape — but every read below is explicitly scoped to
// this caller's own id/email, never anyone else's.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sr = base44.asServiceRole;

    const accounts = await sr.entities.LoyaltyAccount.filter({ user_id: user.id });
    const account = accounts[0] || null;

    let pointsLedger = [];
    let redemptions = [];
    if (account) {
      [pointsLedger, redemptions] = await Promise.all([
        sr.entities.PointsLedger.filter({ account_id: account.id }),
        sr.entities.Redemption.filter({ account_id: account.id }),
      ]);
    }

    let notificationPreferences = [];
    try {
      notificationPreferences = await sr.entities.NotificationPreference.filter({ user_id: user.id });
    } catch { /* optional */ }

    return Response.json({
      success: true,
      exported_at: new Date().toISOString(),
      data: {
        profile: {
          full_name: user.full_name || null,
          email: user.email,
          phone: user.phone || account?.phone || null,
        },
        LoyaltyAccount: account,
        PointsLedger: pointsLedger,
        Redemption: redemptions,
        NotificationPreference: notificationPreferences,
      },
    });
  } catch (error) {
    console.error('Error exporting user data:', error);
    return Response.json({ error: 'No se pudieron exportar tus datos' }, { status: 500 });
  }
});
