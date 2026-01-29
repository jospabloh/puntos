import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authenticate as admin (required for scheduled tasks)
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Get all accounts
    const accounts = await base44.asServiceRole.entities.LoyaltyAccount.list();
    
    // 30 days ago
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    let remindersSent = 0;
    
    for (const account of accounts) {
      // Skip if not active or no last_activity
      if (account.status !== 'active' || !account.last_activity) continue;
      
      const lastActivity = new Date(account.last_activity);
      
      // Send reminder if inactive for 30+ days
      if (lastActivity < thirtyDaysAgo) {
        // Check if user has notification preferences
        const preferences = await base44.asServiceRole.entities.NotificationPreference.filter({
          user_id: account.user_id
        });
        
        // Skip if user has disabled notifications
        if (preferences.length > 0 && !preferences[0].email_enabled) continue;
        
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            from_name: 'Puntos+',
            to: account.user_email,
            subject: '✨ ¡Te extrañamos! Vuelve a ganar puntos',
            body: `
Hola ${account.user_name || 'Usuario'},

Hace tiempo que no te vemos por aquí. 

💎 **Tu cuenta sigue activa:**
• Puntos disponibles: ${account.current_balance.toLocaleString()}
• Nivel: ${account.tier}

${account.current_balance > 0 ? '¡Aún tienes puntos disponibles para canjear por increíbles recompensas!' : '¡Comienza a acumular puntos en tu próxima compra!'}

No dejes que tus puntos se queden esperando. 

¡Regresa y sigue disfrutando de los beneficios de Puntos+!

Equipo Puntos+
            `
          });
          remindersSent++;
        } catch (emailError) {
          console.error(`Error sending reminder to ${account.user_email}:`, emailError);
        }
      }
    }

    return Response.json({
      success: true,
      message: `Sent ${remindersSent} inactive user reminders`,
      total_accounts: accounts.length,
      reminders_sent: remindersSent
    });
  } catch (error) {
    console.error('Error processing inactive users:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});