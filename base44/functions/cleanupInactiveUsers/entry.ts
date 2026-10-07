import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { runScheduled, EVERY_WEEK } from '../../shared/scheduledGuard.ts';

// The email template lives inline here — same convention as the duplicated
// isBusinessWriteBlocked() guards in earnPoints/burnPoints/redeemOffer/createStore.
//
// NOTA (2026-09-09): este comentario decía que era porque «Deno no puede
// importar entre directorios de función». Es falso, y este archivo mismo lo
// desmiente dos líneas más arriba, donde importa `../../shared/scheduledGuard.ts`.
// Lo que no se puede es importar desde `src/`.

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);
}

const TIER_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  bronze: { bg: '#f3e4d7', fg: '#8a5a2b', label: 'Bronze' },
  silver: { bg: '#eef0f2', fg: '#5b6470', label: 'Silver' },
  gold: { bg: '#fbf0d3', fg: '#96731b', label: 'Gold' },
  platinum: { bg: '#e9f3fb', fg: '#39647f', label: 'Platinum' },
};

const APP_URL = 'https://puntosplus.acaciaco.com.mx';

// Premium re-engagement email — paper/ink card shell (same family as Mission
// Control's wrap() in acacia-mission-control/api/_lib/messaging.js), built
// around a loyalty stat card instead of plain bullet text.
function reengagementEmailHtml(account: { user_name?: string; current_balance?: number; tier?: string }): string {
  const name = esc(account.user_name || 'Usuario');
  const balance = (account.current_balance || 0).toLocaleString('es-MX');
  const hasBalance = (account.current_balance || 0) > 0;
  const tierKey = (account.tier || 'bronze').toLowerCase();
  const tier = TIER_STYLE[tierKey] || TIER_STYLE.bronze;

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Puntos+</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f7f6f2;margin:0;padding:24px;color:#2a2a33;line-height:1.7}
.card{max-width:560px;margin:0 auto;background:#fff;border:1px solid #ece9e1;border-radius:16px;overflow:hidden}
.hd{padding:28px 28px 22px;text-align:center;background:linear-gradient(135deg,#fbf3e6,#ffffff)}
.hd .mark{display:inline-block;width:44px;height:44px;border-radius:12px;background:#3b6ef8;color:#fff;font-size:18px;font-weight:700;line-height:44px;margin-bottom:10px}
.hd b{display:block;font-size:18px;color:#0e0d14}
.hd span{color:#8a8780;font-size:12px}
.bd{padding:6px 28px 26px}
.bd p{margin:0 0 14px}
.hi{color:#3b6ef8;font-weight:600}
.stat{margin:20px 0;border-radius:14px;background:#faf9f6;border:1px solid #ece9e1;padding:22px;text-align:center}
.stat .balance-label{font-size:11px;color:#8a8780;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
.stat .balance{font-size:34px;font-weight:700;color:#0e0d14;letter-spacing:-.02em}
.tier{display:inline-block;margin-top:12px;padding:4px 14px;border-radius:999px;font-size:12px;font-weight:600;background:${tier.bg};color:${tier.fg}}
.cta{text-align:center;margin:22px 0 6px}
.cta a{display:inline-block;background:#3b6ef8;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:13px 30px;border-radius:10px}
.ft{padding:16px 28px;background:#faf9f6;border-top:1px solid #f0eee7;font-size:12px;color:#9b988f;text-align:center}
.ft a{color:#3b6ef8;text-decoration:none}
</style></head><body>
<div class="card">
  <div class="hd"><span class="mark">P+</span><b>Puntos+</b><span>tu programa de lealtad</span></div>
  <div class="bd">
    <p>Hola <span class="hi">${name}</span>,</p>
    <p>Hace tiempo que no te vemos por aquí. ${hasBalance ? 'Tus puntos siguen esperándote.' : '¡Comienza a acumular puntos en tu próxima compra!'}</p>
    <div class="stat">
      <div class="balance-label">Puntos disponibles</div>
      <div class="balance">${balance}</div>
      <span class="tier">Nivel ${esc(tier.label)}</span>
    </div>
    <p>${hasBalance ? 'Aún tienes puntos disponibles para canjear por increíbles recompensas — no dejes que se queden esperando.' : 'Regresa y empieza a acumular puntos con tu próxima compra.'}</p>
    <div class="cta"><a href="${APP_URL}">Volver a Puntos+</a></div>
  </div>
  <div class="ft">Puntos+ — desarrollado por <b>ACACIA</b><br><a href="mailto:soporte@acaciaco.com.mx">soporte@acaciaco.com.mx</a></div>
</div>
</body></html>`;
}

async function run(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);


    // Scheduled automation — no user session; use service role directly.

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
            body: reengagementEmailHtml(account),
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
}

Deno.serve((req: Request) => runScheduled(createClientFromRequest(req), 'cleanupInactiveUsers', EVERY_WEEK, () => run(req)));
