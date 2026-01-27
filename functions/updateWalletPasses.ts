import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// This function updates both Google Wallet and Apple Wallet passes when points change
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // This function is called by an entity automation, so we use service role
    const { account_id } = await req.json();

    if (!account_id) {
      return Response.json({ error: 'Missing account_id' }, { status: 400 });
    }

    // Get updated account
    const account = await base44.asServiceRole.entities.LoyaltyAccount.get(account_id);
    
    if (!account) {
      return Response.json({ error: 'Account not found' }, { status: 404 });
    }

    // TODO: In production, you would:
    // 1. For Google Wallet: Call the Google Wallet API to update the loyalty object
    // 2. For Apple Wallet: Send push notifications to update the pass
    
    // For now, we'll just log the update
    console.log(`Wallet passes should be updated for account ${account_id}`);
    console.log(`New balance: ${account.current_balance}`);

    return Response.json({ 
      success: true,
      message: 'Wallet update triggered',
      balance: account.current_balance
    });

  } catch (error) {
    console.error('Update wallet error:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});