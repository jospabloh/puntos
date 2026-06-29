import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// createStore — adds a store to the caller's tenant with a server-generated,
// globally-unique code. The code is never accepted from the client, so two
// stores can never collide on the code customers join with.
//
// Runs as service role: it reads the caller's business_id from their user record
// and stamps the new store, then checks code uniqueness across ALL stores before
// creating (the check + create happen server-side to avoid a client race).

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I/L

function randPart(n: number) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

function slug(name: string) {
  return (name || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'PP';
}

async function uniqueStoreCode(sr: any, name: string) {
  for (let i = 0; i < 12; i++) {
    const code = i < 8 ? `${slug(name)}${randPart(3)}` : randPart(8);
    const taken = await sr.entities.Store.filter({ code });
    if (!taken || taken.length === 0) return code;
  }
  return `${slug(name)}${randPart(6)}`; // astronomically unlikely fallback
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const ownBusinessId = user.business_id || user.data?.business_id;
    const ownBusinessName = user.business_name || user.data?.business_name;
    // The platform owner (role admin) may create a store inside ANY tenant they
    // are administering — honor the explicit business_id override. Everyone else
    // is pinned to their own business.
    const isAdmin = user.role === 'admin';
    const businessId = (isAdmin && body?.business_id) ? body.business_id : ownBusinessId;
    const businessName = (isAdmin && body?.business_id) ? (body?.business_name || '') : ownBusinessName;
    if (!businessId) return Response.json({ error: 'No tienes un negocio asignado' }, { status: 403 });

    const name = (body?.name || '').trim();
    if (!name) return Response.json({ error: 'El nombre de la tienda es obligatorio' }, { status: 400 });

    const sr = base44.asServiceRole;
    const code = await uniqueStoreCode(sr, name);

    const store = await sr.entities.Store.create({
      name,
      code,
      business_id: businessId,
      business_name: businessName,
      merchant_id: user.id,
      merchant_name: user.full_name || user.email?.split('@')[0],
      merchant_email: user.email,
      address: body?.address || '',
      city: body?.city || '',
      state: body?.state || '',
      phone: body?.phone || '',
      status: body?.status || 'active',
      points_rate: typeof body?.points_rate === 'number' ? body.points_rate : 1,
      min_purchase: typeof body?.min_purchase === 'number' ? body.min_purchase : 0,
      daily_earn_limit: typeof body?.daily_earn_limit === 'number' ? body.daily_earn_limit : 1000,
    });

    return Response.json({ success: true, store });
  } catch (error) {
    console.error('Error creating store:', error);
    return Response.json({ error: 'Failed to create store' }, { status: 500 });
  }
});
