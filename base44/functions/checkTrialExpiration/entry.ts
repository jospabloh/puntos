import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Admin notification recipient. Must be configured via the
// ADMIN_NOTIFICATION_EMAIL environment variable — there is no hardcoded
// default. When unset, admin notifications and the support-contact line are
// skipped (the trial lifecycle logic still runs).
const ADMIN_NOTIFICATION_EMAIL = Deno.env.get('ADMIN_NOTIFICATION_EMAIL');
const SUPPORT_CONTACT_LINE = ADMIN_NOTIFICATION_EMAIL
  ? `<p>Email: ${ADMIN_NOTIFICATION_EMAIL}</p>`
  : '';

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

    // Get all accounts that could need attention (trial or recently expired)
    const accounts = await base44.asServiceRole.entities.LoyaltyAccount.filter({
      subscription_status: { $in: ['trial', 'inactive'] }
    });

    const results = {
      suspended: 0,
      reminder_final: 0,
      reminder_3days: 0,
      reminder_7days: 0
    };

    for (const account of accounts) {
      if (!account.trial_end_date) continue;

      const trialEnd = new Date(account.trial_end_date);
      const daysSinceExpiration = Math.floor((now - trialEnd) / (1000 * 60 * 60 * 24));

      // +7 días después de expirar: SUSPENDER
      if (daysSinceExpiration >= 7 && account.status !== 'suspended') {
        await base44.asServiceRole.entities.LoyaltyAccount.update(account.id, {
          subscription_status: 'inactive',
          status: 'suspended'
        });

        // Notify admin (only if a recipient is configured)
        if (ADMIN_NOTIFICATION_EMAIL) {
          try {
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: ADMIN_NOTIFICATION_EMAIL,
              from_name: 'Puntos+ Sistema',
              subject: '🚫 Usuario suspendido por falta de pago',
              body: `
                <h2>Usuario Suspendido</h2>
                <p><strong>Usuario:</strong> ${account.user_name} (${account.user_email})</p>
                <p><strong>Trial expiró:</strong> ${trialEnd.toLocaleDateString('es-MX')}</p>
                <p><strong>Días transcurridos:</strong> ${daysSinceExpiration}</p>
                <p>La cuenta ha sido suspendida automáticamente por falta de suscripción.</p>
              `
            });
          } catch (e) {
            console.error('Error sending admin notification:', e);
          }
        } else {
          console.warn('ADMIN_NOTIFICATION_EMAIL not configured; skipping admin suspension notification');
        }

        results.suspended++;
      }
      // +5 días después de expirar: Recordatorio FINAL
      else if (daysSinceExpiration === 5 && account.subscription_status === 'inactive') {
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: account.user_email,
            from_name: 'Puntos+',
            subject: '⚠️ ÚLTIMO RECORDATORIO - Tu cuenta será suspendida',
            body: `
              <h2>Último Recordatorio</h2>
              <p>Hola ${account.user_name},</p>
              <p>Tu período de prueba expiró hace 5 días.</p>
              <p><strong>Tu cuenta será suspendida en 2 días</strong> si no activas tu suscripción.</p>
              <p>Para continuar usando Puntos+, por favor contacta con nosotros inmediatamente.</p>
              ${SUPPORT_CONTACT_LINE}
            `
          });
          results.reminder_final++;
        } catch (e) {
          console.error('Error sending final reminder:', e);
        }
      }
      // Trial expiró (día 0): cambiar status pero no suspender
      else if (daysSinceExpiration >= 0 && daysSinceExpiration < 5 && account.subscription_status === 'trial') {
        await base44.asServiceRole.entities.LoyaltyAccount.update(account.id, {
          subscription_status: 'inactive'
        });

        // Notify user on expiration day
        if (daysSinceExpiration === 0) {
          try {
            await base44.asServiceRole.integrations.Core.SendEmail({
              to: account.user_email,
              from_name: 'Puntos+',
              subject: 'Tu período de prueba ha finalizado',
              body: `
                <h2>Período de prueba finalizado</h2>
                <p>Hola ${account.user_name},</p>
                <p>Tu período de prueba de 30 días ha finalizado hoy.</p>
                <p>Para continuar usando Puntos+, por favor contacta con nosotros para activar tu suscripción.</p>
                <p>Tienes <strong>7 días</strong> antes de que tu cuenta sea suspendida.</p>
              `
            });
          } catch (e) {
            console.error('Error sending expiration email:', e);
          }
        }
      }
      // 3 días antes de expirar
      else if (trialEnd <= in3Days && trialEnd > now && account.subscription_status === 'trial') {
        const daysRemaining = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
        
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: account.user_email,
            from_name: 'Puntos+',
            subject: '⏰ Tu prueba gratuita termina en 3 días',
            body: `
              <h2>Tu prueba gratuita termina en ${daysRemaining} días</h2>
              <p>Hola ${account.user_name},</p>
              <p>Te recordamos que tu período de prueba de Puntos+ finaliza el <strong>${trialEnd.toLocaleDateString('es-MX')}</strong>.</p>
              <p>Para continuar disfrutando de todos los beneficios, por favor contacta con nosotros para activar tu suscripción.</p>
              ${SUPPORT_CONTACT_LINE}
            `
          });
          results.reminder_3days++;
        } catch (e) {
          console.error('Error sending 3-day reminder:', e);
        }
      }
      // 7 días antes de expirar
      else if (trialEnd <= in7Days && trialEnd > in3Days && account.subscription_status === 'trial') {
        const daysRemaining = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
        
        try {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: account.user_email,
            from_name: 'Puntos+',
            subject: '🔔 Tu prueba gratuita termina en 7 días',
            body: `
              <h2>Tu prueba gratuita termina en ${daysRemaining} días</h2>
              <p>Hola ${account.user_name},</p>
              <p>Te recordamos que tu período de prueba de Puntos+ finaliza el <strong>${trialEnd.toLocaleDateString('es-MX')}</strong>.</p>
              <p>Si deseas continuar usando el programa, contacta con nosotros para gestionar tu suscripción.</p>
              ${SUPPORT_CONTACT_LINE}
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
      { error: 'Failed to check trial expiration' },
      { status: 500 }
    );
  }
});