import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { create } from 'npm:@apple-wallet/pass-js@4.0.0';

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

    // Get environment variables
    const teamId = Deno.env.get('APPLE_WALLET_TEAM_ID');
    const passTypeId = Deno.env.get('APPLE_WALLET_PASS_TYPE_ID');
    const certBase64 = Deno.env.get('APPLE_WALLET_CERT_P12_BASE64');
    const certPassword = Deno.env.get('APPLE_WALLET_CERT_PASSWORD');

    if (!teamId || !passTypeId || !certBase64 || !certPassword) {
      return Response.json({ error: 'Apple Wallet not configured' }, { status: 500 });
    }

    // Decode certificate
    const certBuffer = Uint8Array.from(atob(certBase64), c => c.charCodeAt(0));

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

    // Create pass definition
    const passDefinition = {
      formatVersion: 1,
      passTypeIdentifier: passTypeId,
      teamIdentifier: teamId,
      serialNumber: account.id,
      ...(webServiceURL
        ? { webServiceURL, authenticationToken: await authToken(authSecret, account.id) }
        : {}),
      organizationName: 'Puntos+',
      description: 'Tarjeta de Lealtad Puntos+',
      logoText: 'Puntos+',
      foregroundColor: 'rgb(255, 255, 255)',
      backgroundColor: tier.color,
      labelColor: 'rgb(255, 255, 255)',
      barcode: {
        message: account.qr_token,
        format: 'PKBarcodeFormatQR',
        messageEncoding: 'iso-8859-1'
      },
      storeCard: {
        headerFields: [
          {
            key: 'tier',
            label: 'NIVEL',
            value: tier.label
          }
        ],
        primaryFields: [
          {
            key: 'balance',
            label: 'PUNTOS DISPONIBLES',
            value: account.current_balance.toLocaleString()
          }
        ],
        secondaryFields: [
          {
            key: 'earned',
            label: 'TOTAL GANADO',
            value: account.lifetime_earned.toLocaleString()
          },
          {
            key: 'redeemed',
            label: 'TOTAL CANJEADO',
            value: account.lifetime_redeemed.toLocaleString()
          }
        ],
        backFields: [
          {
            key: 'account_id',
            label: 'ID DE CUENTA',
            value: account.id.slice(0, 12)
          },
          {
            key: 'member_since',
            label: 'MIEMBRO DESDE',
            value: new Date(account.created_date).toLocaleDateString('es-MX')
          },
          {
            key: 'terms',
            label: 'TÉRMINOS Y CONDICIONES',
            value: 'Acumula puntos en cada compra. 1 punto por cada $10 MXN. Los puntos no expiran. Consulta ofertas disponibles en la app.'
          }
        ]
      }
    };

    // Create the pass
    const pass = await create(passDefinition, {
      signerCert: certBuffer,
      signerKey: certBuffer,
      signerKeyPassphrase: certPassword,
      wwdr: 'automatic' // Automatically fetch Apple WWDR certificate
    });

    // Return the .pkpass file
    const passBuffer = await pass.getAsBuffer();

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