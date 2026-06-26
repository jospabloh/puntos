import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
// NOTE: passkit-generator is imported lazily (dynamic import) inside the
// configured path only — see below. The previous static import of
// `@apple-wallet/pass-js` referenced a package that does not exist on npm, so
// the isolate failed to boot at deploy time. Keeping the real signer behind a
// dynamic import means this function deploys cleanly and returns a graceful 501
// until the Apple certificates are configured.

// A minimal valid 1x1 PNG used as a fallback icon so the .pkpass is well-formed
// even before a branded icon is supplied. Apple requires a 29x29 icon for a
// production pass — override it with APPLE_WALLET_ICON_PNG_BASE64 (and ideally
// also @2x / @3x) for a real release.
const DEFAULT_ICON_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function b64ToUint8(b64: string) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// authenticationToken = HMAC_SHA256(secret, serial) — recomputed by
// passkitWebService to authorize device registration / pass refresh. No
// per-account secret is stored.
async function authToken(secret: string, serial: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(serial));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get loyalty account
    const accounts = await base44.entities.LoyaltyAccount.filter({ user_email: user.email });
    if (!accounts || accounts.length === 0) {
      return Response.json({ error: 'No loyalty account found' }, { status: 404 });
    }

    const account = accounts[0];

    // Get environment variables. passkit-generator signs with PEM material
    // (separate signer cert + signer key + Apple WWDR cert), NOT a single P12 —
    // the old code wrongly passed the same P12 buffer as both cert and key.
    const teamId = Deno.env.get('APPLE_WALLET_TEAM_ID');
    const passTypeId = Deno.env.get('APPLE_WALLET_PASS_TYPE_ID');
    const signerCertPem = Deno.env.get('APPLE_WALLET_SIGNER_CERT_PEM_BASE64');
    const signerKeyPem = Deno.env.get('APPLE_WALLET_SIGNER_KEY_PEM_BASE64');
    const wwdrPem = Deno.env.get('APPLE_WALLET_WWDR_PEM_BASE64');
    const certPassword = Deno.env.get('APPLE_WALLET_CERT_PASSWORD'); // signer key passphrase (optional)

    if (!teamId || !passTypeId || !signerCertPem || !signerKeyPem || !wwdrPem) {
      // Not configured yet → return 501 (Not Implemented) rather than pretending.
      return Response.json(
        { error: 'Apple Wallet not configured', detail: 'Missing APPLE_WALLET_TEAM_ID / APPLE_WALLET_PASS_TYPE_ID / APPLE_WALLET_SIGNER_CERT_PEM_BASE64 / APPLE_WALLET_SIGNER_KEY_PEM_BASE64 / APPLE_WALLET_WWDR_PEM_BASE64' },
        { status: 501 },
      );
    }

    // Tier colors and labels
    const tierConfig = {
      bronze: { color: 'rgb(180, 83, 9)', label: 'Bronce' },
      silver: { color: 'rgb(148, 163, 184)', label: 'Plata' },
      gold: { color: 'rgb(234, 179, 8)', label: 'Oro' },
      platinum: { color: 'rgb(139, 92, 246)', label: 'Platino' }
    };

    const tier = tierConfig[account.tier] || tierConfig.bronze;

    // If the PassKit web service is configured, advertise it so the pass can be
    // registered and refreshed with the latest balance (see passkitWebService).
    const webServiceURL = Deno.env.get('APPLE_WALLET_WEB_SERVICE_URL');
    const authSecret = Deno.env.get('APPLE_WALLET_AUTH_SECRET') || certPassword;

    // pass.json properties (everything that is not a field/barcode).
    const props: Record<string, unknown> = {
      formatVersion: 1,
      passTypeIdentifier: passTypeId,
      teamIdentifier: teamId,
      serialNumber: account.id,
      organizationName: 'Puntos+',
      description: 'Tarjeta de Lealtad Puntos+',
      logoText: 'Puntos+',
      foregroundColor: 'rgb(255, 255, 255)',
      backgroundColor: tier.color,
      labelColor: 'rgb(255, 255, 255)',
      ...(webServiceURL
        ? { webServiceURL, authenticationToken: await authToken(authSecret, account.id) }
        : {}),
    };

    // Lazy-load the real signer only once we know we are configured, so an
    // unconfigured deploy never even resolves the npm module.
    const { PKPass } = await import('npm:passkit-generator@3.5.7');

    const iconBase64 = Deno.env.get('APPLE_WALLET_ICON_PNG_BASE64') || DEFAULT_ICON_PNG_BASE64;
    const iconBuffer = b64ToUint8(iconBase64);

    const pass = new PKPass(
      { 'icon.png': iconBuffer, 'icon@2x.png': iconBuffer },
      {
        wwdr: b64ToUint8(wwdrPem),
        signerCert: b64ToUint8(signerCertPem),
        signerKey: b64ToUint8(signerKeyPem),
        signerKeyPassphrase: certPassword || undefined,
      },
      props,
    );
    pass.type = 'storeCard';

    pass.headerFields.push({ key: 'tier', label: 'NIVEL', value: tier.label });
    pass.primaryFields.push({ key: 'balance', label: 'PUNTOS DISPONIBLES', value: (account.current_balance || 0).toLocaleString() });
    pass.secondaryFields.push(
      { key: 'earned', label: 'TOTAL GANADO', value: (account.lifetime_earned || 0).toLocaleString() },
      { key: 'redeemed', label: 'TOTAL CANJEADO', value: (account.lifetime_redeemed || 0).toLocaleString() },
    );
    pass.backFields.push(
      { key: 'account_id', label: 'ID DE CUENTA', value: account.id.slice(0, 12) },
      { key: 'member_since', label: 'MIEMBRO DESDE', value: new Date(account.created_date).toLocaleDateString('es-MX') },
      { key: 'terms', label: 'TÉRMINOS Y CONDICIONES', value: 'Acumula puntos en cada compra. 1 punto por cada $10 MXN. Los puntos no expiran. Consulta ofertas disponibles en la app.' },
    );

    pass.setBarcodes({ message: account.qr_token, format: 'PKBarcodeFormatQR', messageEncoding: 'iso-8859-1' });

    // Return the .pkpass file
    const passBuffer = pass.getAsBuffer();

    return new Response(passBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename=puntos_plus_${account.id.slice(0, 8)}.pkpass`
      }
    });

  } catch (error) {
    console.error('Apple Wallet error:', error.message, error.stack);
    return Response.json({ error: 'Failed to generate Apple Wallet pass' }, { status: 500 });
  }
});