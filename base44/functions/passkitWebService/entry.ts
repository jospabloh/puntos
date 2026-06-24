import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { create } from 'npm:@apple-wallet/pass-js@4.0.0';

// passkitWebService — implements Apple's PassKit Web Service so issued Apple
// Wallet passes can be registered by devices and refreshed with the latest
// points balance.
//
// Apple appends these paths to the pass's `webServiceURL`:
//   POST   /v1/devices/{deviceLibraryId}/registrations/{passTypeId}/{serial}
//   DELETE /v1/devices/{deviceLibraryId}/registrations/{passTypeId}/{serial}
//   GET    /v1/devices/{deviceLibraryId}/registrations/{passTypeId}?passesUpdatedSince=tag
//   GET    /v1/passes/{passTypeId}/{serial}
//   POST   /v1/log
//
// Auth: every pass carries `authenticationToken = HMAC_SHA256(secret, serial)`
// (serial = LoyaltyAccount id). We recompute and compare it from the
// `Authorization: ApplePass <token>` header — no per-account secret is stored.
//
// This function runs with the service role (asServiceRole) because the caller is
// an Apple device, not a logged-in Base44 user. Set the pass's webServiceURL to
// this function's invoke URL (env APPLE_WALLET_WEB_SERVICE_URL) for it to be hit.

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function authToken(secret: string, serial: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(serial)));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getBearer(req: Request) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^ApplePass\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

const tierConfig: Record<string, { color: string; label: string }> = {
  bronze: { color: 'rgb(180, 83, 9)', label: 'Bronce' },
  silver: { color: 'rgb(148, 163, 184)', label: 'Plata' },
  gold: { color: 'rgb(234, 179, 8)', label: 'Oro' },
  platinum: { color: 'rgb(139, 92, 246)', label: 'Platino' },
};

// Build the .pkpass for an account — kept in sync with createAppleWalletPass.
async function buildPass(account: any, env: Record<string, string | undefined>, webServiceURL: string | null, secret: string) {
  const tier = tierConfig[account.tier] || tierConfig.bronze;
  const passDefinition: any = {
    formatVersion: 1,
    passTypeIdentifier: env.APPLE_WALLET_PASS_TYPE_ID,
    teamIdentifier: env.APPLE_WALLET_TEAM_ID,
    serialNumber: account.id,
    organizationName: 'Puntos+',
    description: 'Tarjeta de Lealtad Puntos+',
    logoText: 'Puntos+',
    foregroundColor: 'rgb(255, 255, 255)',
    backgroundColor: tier.color,
    labelColor: 'rgb(255, 255, 255)',
    barcode: { message: account.qr_token, format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1' },
    storeCard: {
      headerFields: [{ key: 'tier', label: 'NIVEL', value: tier.label }],
      primaryFields: [{ key: 'balance', label: 'PUNTOS DISPONIBLES', value: (account.current_balance || 0).toLocaleString() }],
      secondaryFields: [
        { key: 'earned', label: 'TOTAL GANADO', value: (account.lifetime_earned || 0).toLocaleString() },
        { key: 'redeemed', label: 'TOTAL CANJEADO', value: (account.lifetime_redeemed || 0).toLocaleString() },
      ],
      backFields: [
        { key: 'account_id', label: 'ID DE CUENTA', value: account.id.slice(0, 12) },
        { key: 'terms', label: 'TÉRMINOS Y CONDICIONES', value: 'Acumula puntos en cada compra. Los puntos no expiran.' },
      ],
    },
  };
  if (webServiceURL) {
    passDefinition.webServiceURL = webServiceURL;
    passDefinition.authenticationToken = await authToken(secret, account.id);
  }
  const certBuffer = Uint8Array.from(atob(env.APPLE_WALLET_CERT_P12_BASE64 as string), (c) => c.charCodeAt(0));
  const pass = await create(passDefinition, {
    signerCert: certBuffer,
    signerKey: certBuffer,
    signerKeyPassphrase: env.APPLE_WALLET_CERT_PASSWORD,
    wwdr: 'automatic',
  });
  return await pass.getAsBuffer();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const env = {
      APPLE_WALLET_TEAM_ID: Deno.env.get('APPLE_WALLET_TEAM_ID'),
      APPLE_WALLET_PASS_TYPE_ID: Deno.env.get('APPLE_WALLET_PASS_TYPE_ID'),
      APPLE_WALLET_CERT_P12_BASE64: Deno.env.get('APPLE_WALLET_CERT_P12_BASE64'),
      APPLE_WALLET_CERT_PASSWORD: Deno.env.get('APPLE_WALLET_CERT_PASSWORD'),
    };
    const secret = Deno.env.get('APPLE_WALLET_AUTH_SECRET') || env.APPLE_WALLET_CERT_PASSWORD || '';
    const webServiceURL = Deno.env.get('APPLE_WALLET_WEB_SERVICE_URL') || null;

    const url = new URL(req.url);
    // Everything from /v1/ onward is the PassKit request (webServiceURL prefix stripped).
    const idx = url.pathname.indexOf('/v1/');
    if (idx === -1) return Response.json({ error: 'Not a PassKit request' }, { status: 404 });
    const parts = url.pathname.slice(idx + 1).split('/').filter(Boolean); // ['v1', ...]
    const sr = base44.asServiceRole;

    // POST /v1/log — Apple posts diagnostic logs.
    if (parts[1] === 'log') {
      try { const body = await req.json(); console.log('PassKit log:', JSON.stringify(body?.logs || body)); } catch { /* ignore */ }
      return new Response(null, { status: 200 });
    }

    // /v1/devices/{deviceLibraryId}/registrations/{passTypeId}[/{serial}]
    if (parts[1] === 'devices') {
      const deviceLibraryId = parts[2];
      const passTypeId = parts[4];
      const serial = parts[5];

      // GET list of updatable serials for a device since a tag.
      if (req.method === 'GET') {
        const since = url.searchParams.get('passesUpdatedSince');
        const regs = (await sr.entities.WalletRegistration.filter({ device_library_id: deviceLibraryId, active: true })) || [];
        const serials: string[] = [];
        let maxTag = since || '';
        for (const r of regs) {
          const accs = await sr.entities.LoyaltyAccount.filter({ id: r.serial_number });
          const acc = accs?.[0];
          if (!acc) continue;
          const updated = acc.updated_date || acc.last_activity || '';
          if (!since || (updated && updated > since)) {
            serials.push(r.serial_number);
            if (updated > maxTag) maxTag = updated;
          }
        }
        if (serials.length === 0) return new Response(null, { status: 204 });
        return Response.json({ lastUpdated: maxTag || new Date().toISOString(), serialNumbers: serials });
      }

      // Register / unregister require the pass auth token for that serial.
      const token = getBearer(req);
      if (!token || !serial) return new Response(null, { status: 401 });
      const expected = await authToken(secret, serial);
      if (!timingSafeEqual(token, expected)) return new Response(null, { status: 401 });

      if (req.method === 'POST') {
        let pushToken = '';
        try { pushToken = (await req.json())?.pushToken || ''; } catch { /* ignore */ }
        const accs = await sr.entities.LoyaltyAccount.filter({ id: serial });
        const acc = accs?.[0];
        const existing = (await sr.entities.WalletRegistration.filter({ device_library_id: deviceLibraryId, serial_number: serial })) || [];
        if (existing.length > 0) {
          await sr.entities.WalletRegistration.update(existing[0].id, { push_token: pushToken, active: true });
          return new Response(null, { status: 200 });
        }
        await sr.entities.WalletRegistration.create({
          device_library_id: deviceLibraryId,
          pass_type_id: passTypeId,
          serial_number: serial,
          push_token: pushToken,
          account_id: serial,
          user_id: acc?.user_id,
          business_id: acc?.business_id,
          active: true,
        });
        return new Response(null, { status: 201 });
      }

      if (req.method === 'DELETE') {
        const existing = (await sr.entities.WalletRegistration.filter({ device_library_id: deviceLibraryId, serial_number: serial })) || [];
        for (const r of existing) await sr.entities.WalletRegistration.update(r.id, { active: false });
        return new Response(null, { status: 200 });
      }
    }

    // GET /v1/passes/{passTypeId}/{serial} — return the latest .pkpass.
    if (parts[1] === 'passes' && req.method === 'GET') {
      const serial = parts[3];
      const token = getBearer(req);
      if (!token) return new Response(null, { status: 401 });
      const expected = await authToken(secret, serial);
      if (!timingSafeEqual(token, expected)) return new Response(null, { status: 401 });
      if (!env.APPLE_WALLET_CERT_P12_BASE64) return Response.json({ error: 'Apple Wallet not configured' }, { status: 500 });

      const accs = await sr.entities.LoyaltyAccount.filter({ id: serial });
      const acc = accs?.[0];
      if (!acc) return new Response(null, { status: 404 });
      const buffer = await buildPass(acc, env, webServiceURL, secret);
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.pkpass',
          'Last-Modified': new Date(acc.updated_date || Date.now()).toUTCString(),
        },
      });
    }

    return new Response(null, { status: 404 });
  } catch (error) {
    console.error('PassKit web service error:', error?.message);
    return new Response(null, { status: 500 });
  }
});
