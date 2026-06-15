import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { SignJWT } from 'npm:jose@5.2.0';

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
    
    // Parse service account JSON
    const serviceAccountJson = Deno.env.get('GOOGLE_WALLET_SERVICE_ACCOUNT');
    const issuerId = Deno.env.get('GOOGLE_WALLET_ISSUER_ID');
    
    if (!serviceAccountJson || !issuerId) {
      return Response.json({ error: 'Google Wallet not configured' }, { status: 500 });
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    
    // Define the Loyalty Class (template)
    const classId = `${issuerId}.puntos_plus_loyalty`;
    const loyaltyClass = {
      id: classId,
      issuerName: 'Puntos+',
      reviewStatus: 'UNDER_REVIEW',
      programName: 'Puntos+',
      programLogo: {
        sourceUri: {
          uri: 'https://images.unsplash.com/photo-1607083206869-4c7672e72a8a?w=400'
        }
      },
      hexBackgroundColor: '#8b5cf6',
      accountNameLabel: 'Titular',
      accountIdLabel: 'ID de Cuenta',
      rewardsTierLabel: 'Nivel',
      rewardsTier: account.tier.charAt(0).toUpperCase() + account.tier.slice(1),
    };

    // Define the Loyalty Object (user-specific instance)
    const objectId = `${issuerId}.${account.id}`;
    const loyaltyObject = {
      id: objectId,
      classId: classId,
      state: 'ACTIVE',
      accountName: account.user_name,
      accountId: account.id.slice(0, 8),
      barcode: {
        type: 'QR_CODE',
        value: account.qr_token,
      },
      loyaltyPoints: {
        balance: {
          int: account.current_balance
        },
        label: 'Puntos disponibles'
      },
      textModulesData: [
        {
          header: 'Total ganado',
          body: `${account.lifetime_earned.toLocaleString()} puntos`
        },
        {
          header: 'Total canjeado',
          body: `${account.lifetime_redeemed.toLocaleString()} puntos`
        }
      ]
    };

    // Create the claims for the Save to Google Wallet JWT
    const claims = {
      iss: serviceAccount.client_email,
      aud: 'google',
      origins: [],
      typ: 'savetogooglepay',
      payload: {
        loyaltyClasses: [loyaltyClass],
        loyaltyObjects: [loyaltyObject]
      }
    };

    // Import private key
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      new TextEncoder().encode(serviceAccount.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Sign JWT
    const jwt = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);

    // Generate the Save URL
    const saveUrl = `https://pay.google.com/gp/v/save/${jwt}`;

    // Return only the save URL — objectId contains the internal account ID
    // and is not needed by the client.
    return Response.json({ url: saveUrl });

  } catch (error) {
    console.error('Google Wallet error:', error.message, error.stack);
    return Response.json({ error: 'Failed to generate Google Wallet pass' }, { status: 500 });
  }
});