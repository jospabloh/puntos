import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Customer-facing offer redemption.
//
// Runs entirely with the service role so the points balance is read and
// written server-side — the client never supplies the balance. This closes
// the hole where a normal user could set their own `current_balance` via a
// direct LoyaltyAccount update.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const offerId = body?.offer_id;
    if (!offerId) {
      return Response.json({ error: 'offer_id is required' }, { status: 400 });
    }

    // Load the caller's own loyalty account server-side (source of truth).
    const accounts = await base44.asServiceRole.entities.LoyaltyAccount.filter({ user_id: user.id });
    const account = accounts[0];
    if (!account) {
      return Response.json({ error: 'Loyalty account not found' }, { status: 404 });
    }
    if (account.status !== 'active') {
      return Response.json({ error: 'Account is not active' }, { status: 403 });
    }

    // Load and validate the offer server-side.
    const offer = await base44.asServiceRole.entities.Offer.get(offerId);
    if (!offer) {
      return Response.json({ error: 'Offer not found' }, { status: 404 });
    }
    if (offer.status !== 'active') {
      return Response.json({ error: 'Offer is not available' }, { status: 400 });
    }
    if (typeof offer.stock === 'number' && offer.stock === 0) {
      return Response.json({ error: 'Offer is sold out' }, { status: 400 });
    }

    // Tenant isolation guard: the offer must belong to the same tenant as the
    // customer's loyalty account. Fail-closed: if either side lacks a business_id
    // (legacy/unscoped record), reject rather than allow cross-tenant redemption.
    if (!account.business_id || !offer.business_id || account.business_id !== offer.business_id) {
      return Response.json({ error: 'Offer does not belong to your program' }, { status: 403 });
    }

    const cost = offer.points_cost || 0;
    const currentBalance = account.current_balance || 0;
    if (currentBalance < cost) {
      return Response.json({ error: 'Insufficient balance' }, { status: 400 });
    }

    const newBalance = currentBalance - cost;

    // Cryptographically random confirmation code.
    const codeBytes = new Uint8Array(6);
    crypto.getRandomValues(codeBytes);
    const confirmationCode = Array.from(codeBytes, (b) => b.toString(36).padStart(2, '0'))
      .join('')
      .substring(0, 8)
      .toUpperCase();

    // Create the redemption record. store_id comes from the account so that
    // merchant-scoped RLS on Redemption.read lets the store owner see it.
    const redemption = await base44.asServiceRole.entities.Redemption.create({
      account_id: account.id,
      user_id: user.id,
      user_email: user.email,
      store_id: account.store_id,
      business_id: account.business_id,
      business_name: account.business_name,
      offer_id: offer.id,
      offer_title: offer.title,
      points_spent: cost,
      value_mxn: offer.value_mxn,
      status: 'confirmed',
      confirmation_code: confirmationCode,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

    // Create the ledger entry (idempotent: one redemption = one burn).
    // store_id propagated so merchant-scoped RLS on PointsLedger.read is satisfied.
    const ledger = await base44.asServiceRole.entities.PointsLedger.create({
      account_id: account.id,
      user_id: user.id,
      store_id: account.store_id,
      business_id: account.business_id,
      business_name: account.business_name,
      type: 'BURN',
      points: -cost,
      balance_after: newBalance,
      reference_type: 'redemption',
      reference_id: redemption.id,
      idempotency_key: `burn_${redemption.id}`,
      description: `Canje: ${offer.title}`,
      status: 'completed'
    });

    await base44.asServiceRole.entities.Redemption.update(redemption.id, { ledger_id: ledger.id });

    // Deduct the balance.
    await base44.asServiceRole.entities.LoyaltyAccount.update(account.id, {
      current_balance: newBalance,
      lifetime_redeemed: (account.lifetime_redeemed || 0) + cost,
      last_activity: new Date().toISOString()
    });

    // Decrement stock if the offer is limited.
    if (typeof offer.stock === 'number' && offer.stock > 0) {
      await base44.asServiceRole.entities.Offer.update(offer.id, {
        stock: offer.stock - 1,
        redemptions_count: (offer.redemptions_count || 0) + 1
      });
    }

    return Response.json({
      success: true,
      redemption,
      confirmation_code: confirmationCode,
      new_balance: newBalance
    });
  } catch (error) {
    console.error('Error redeeming offer:', error);
    return Response.json({ error: 'Failed to redeem offer' }, { status: 500 });
  }
});
