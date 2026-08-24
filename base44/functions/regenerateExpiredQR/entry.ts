import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { verifyScheduledRequest, unauthorizedResponse } from '../../shared/scheduledGuard.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Only the platform's scheduled automation may invoke this — it passes the
    // SCHEDULED_TASK_SECRET via function_args. Anonymous external callers get 403.
    const guard = await verifyScheduledRequest(req);
    if (!guard.ok) return unauthorizedResponse(guard.reason || 'Forbidden');
    // Scheduled automation — no user session; use service role directly.

    // Find accounts with expired QR tokens
    const now = new Date();
    const accounts = await base44.asServiceRole.entities.LoyaltyAccount.list();
    
    let regeneratedCount = 0;
    
    for (const account of accounts) {
      const tokenExpires = account.qr_token_expires ? new Date(account.qr_token_expires) : null;
      
      // Regenerate if expired or missing
      if (!account.qr_token || !tokenExpires || tokenExpires <= now) {
        const bytes = new Uint8Array(9);
        crypto.getRandomValues(bytes);
        const newToken = Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').substring(0, 12).toUpperCase();
        const newExpires = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // 5 minutes
        
        await base44.asServiceRole.entities.LoyaltyAccount.update(account.id, {
          qr_token: newToken,
          qr_token_expires: newExpires
        });
        
        regeneratedCount++;
      }
    }

    return Response.json({
      success: true,
      message: `Regenerated ${regeneratedCount} QR tokens`,
      total_accounts: accounts.length,
      regenerated: regeneratedCount
    });
  } catch (error) {
    console.error('Error regenerating QR tokens:', error);
    return Response.json({
      error: 'Failed to regenerate QR tokens',
      success: false
    }, { status: 500 });
  }
});