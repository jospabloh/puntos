import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Scheduled automations run without a user session — use service role directly.

    // Get all active accounts
    const accounts = await base44.asServiceRole.entities.LoyaltyAccount.filter({ 
      status: 'active' 
    });
    
    // Get date range (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    let emailsSent = 0;
    
    for (const account of accounts) {
      // Get user's transactions from last week
      const transactions = await base44.asServiceRole.entities.PointsLedger.filter({
        account_id: account.id
      });
      
      const recentTx = transactions.filter(tx => 
        new Date(tx.created_date) >= sevenDaysAgo
      );
      
      // Skip if no activity
      if (recentTx.length === 0) continue;

      // Respect the user's own notification preferences (mirrors
      // cleanupInactiveUsers) — this digest is promotional, not transactional,
      // so a global or per-category opt-out must be honored before sending.
      const preferences = await base44.asServiceRole.entities.NotificationPreference.filter({
        user_id: account.user_id
      });
      if (preferences.length > 0 && (preferences[0].email_enabled === false || preferences[0].points_activity_enabled === false)) {
        continue;
      }

      // Calculate stats
      const earned = recentTx
        .filter(tx => tx.type === 'EARN' || tx.type === 'BONUS')
        .reduce((sum, tx) => sum + tx.points, 0);
      
      const burned = recentTx
        .filter(tx => tx.type === 'BURN')
        .reduce((sum, tx) => sum + Math.abs(tx.points), 0);
      
      // Send email summary
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          from_name: 'Puntos+',
          to: account.user_email,
          subject: '📊 Tu resumen semanal - Puntos+',
          body: `
Hola ${account.user_name || 'Usuario'},

Aquí está tu resumen de actividad de la última semana:

🎯 **Tu actividad:**
• Puntos ganados: +${earned.toLocaleString()}
• Puntos canjeados: -${burned.toLocaleString()}
• Transacciones realizadas: ${recentTx.length}

💰 **Tu balance actual:**
• Puntos disponibles: ${(account.current_balance || 0).toLocaleString()}
• Nivel: ${account.tier || 'bronze'}

${(account.current_balance || 0) > 500 ? '\n🎁 ¡Tienes suficientes puntos para canjear ofertas! Revisa la app para ver las recompensas disponibles.\n' : ''}

¡Sigue acumulando puntos en cada compra!

Equipo Puntos+
          `
        });
        emailsSent++;
      } catch (emailError) {
        console.error(`Error sending email to ${account.user_email}:`, emailError);
      }
    }

    return Response.json({
      success: true,
      message: `Weekly summary sent to ${emailsSent} users`,
      total_accounts: accounts.length,
      emails_sent: emailsSent
    });
  } catch (error) {
    console.error('Error sending weekly summaries:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});