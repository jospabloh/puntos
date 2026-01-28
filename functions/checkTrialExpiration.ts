import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Authenticate as admin (this should only run as scheduled task)
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const now = new Date();
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Get all trial accounts
    const trialAccounts = await base44.asServiceRole.entities.LoyaltyAccount.filter({
      subscription_status: 'trial'
    });

    const results = {
      expired: 0,
      reminder_3days: 0,
      reminder_7days: 0
    };

    for (const account of trialAccounts) {
      if (!account.trial_end_date) continue;

      const trialEnd = new Date(account.trial_end_date);

      // Trial expired - disable account
      if (trialEnd < now) {
        await base44.asServiceRole.entities.LoyaltyAccount.update(account.id, {
          subscription_status: 'inactive',
          status: 'suspended'
        });

        // Notify user
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: account.user_email,
            from_name: 'Puntos+',
            subject: 'Tu período de prueba ha finalizado',
            body: `
              <h2>Período de prueba finalizado</h2>
              <p>Hola ${account.user_name},</p>
              <p>Tu período de prueba de 30 días ha finalizado.</p>
              <p>Para continuar usando Puntos+, por favor contacta con nosotros para activar tu suscripción.</p>
              <p>Gracias por tu interés en Puntos+.</p>
            `
          });
        } catch (e) {
          console.error('Error sending expiration email:', e);
        }

        // Notify admin
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: 'jose.herrera@acaciaco.com.mx',
            from_name: 'Puntos+ Sistema',
            subject: '⏰ Trial expirado - Usuario suspendido',
            body: `
              <h2>Trial Expirado</h2>
              <p><strong>Usuario:</strong> ${account.user_name} (${account.user_email})</p>
              <p><strong>Fecha de expiración:</strong> ${trialEnd.toLocaleString('es-MX')}</p>
              <p>La cuenta ha sido suspendida automáticamente.</p>
            `
          });
        } catch (e) {
          console.error('Error sending admin notification:', e);
        }

        results.expired++;
      }
      // 3 days before expiration
      else if (trialEnd <= in3Days && trialEnd > now) {
        const daysRemaining = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
        
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: account.user_email,
            from_name: 'Puntos+',
            subject: '⏰ Tu prueba gratuita termina pronto',
            body: `
              <h2>Tu prueba gratuita termina en ${daysRemaining} días</h2>
              <p>Hola ${account.user_name},</p>
              <p>Te recordamos que tu período de prueba de Puntos+ finaliza el <strong>${trialEnd.toLocaleDateString('es-MX')}</strong>.</p>
              <p>Para continuar disfrutando de todos los beneficios, por favor contacta con nosotros para activar tu suscripción.</p>
              <p>¡Gracias por usar Puntos+!</p>
            `
          });
          results.reminder_3days++;
        } catch (e) {
          console.error('Error sending 3-day reminder:', e);
        }
      }
      // 7 days before expiration
      else if (trialEnd <= in7Days && trialEnd > in3Days) {
        const daysRemaining = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
        
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: account.user_email,
            from_name: 'Puntos+',
            subject: '🔔 Recordatorio: Tu prueba gratuita',
            body: `
              <h2>Tu prueba gratuita termina en ${daysRemaining} días</h2>
              <p>Hola ${account.user_name},</p>
              <p>Te recordamos que tu período de prueba de Puntos+ finaliza el <strong>${trialEnd.toLocaleDateString('es-MX')}</strong>.</p>
              <p>Si deseas continuar usando el programa, contacta con nosotros para gestionar tu suscripción.</p>
              <p>¡Gracias por tu confianza!</p>
            `
          });
          results.reminder_7days++;
        } catch (e) {
          console.error('Error sending 7-day reminder:', e);
        }
      }
    }

    return Response.json({
      success: true,
      results,
      timestamp: now.toISOString()
    });
  } catch (error) {
    console.error('Error checking trial expiration:', error);
    return Response.json(
      { error: 'Failed to check trial expiration', details: error.message },
      { status: 500 }
    );
  }
});