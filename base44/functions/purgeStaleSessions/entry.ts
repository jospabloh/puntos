import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { runScheduled, EVERY_DAY } from '../../shared/scheduledGuard.ts';

// purgeStaleSessions — Módulo 20 del estándar ACACIA, capa 3.
//
// Es la pieza que un temporizador de inactividad en el cliente NO puede dar:
// una sesión cuyo dispositivo murió (batería, pestaña que mató el sistema
// operativo, portátil cerrado y nunca reabierto) no vuelve a mandar un latido,
// así que se queda viva para siempre — no queda nada corriendo en el navegador
// que la cierre. Sólo el servidor puede.
//
// Puntos+ marca la revocación con `revoked_at` (un timestamp), no con un
// `status: 'revoked'` como el ejemplo canónico del estándar
// (shared/session/purgeStaleSessions.example.ts): `AppSession` es anterior a
// ese contrato y ya está desplegada así, leída por las acciones
// `sessions.list` / `sessions.revoke` del puente de Mission Control. Escribir
// un campo `status` que no existe en el esquema desplegado no daría error — se
// descartaría en silencio (ver CLAUDE.md, "Base44 schema-as-code"), y este
// trabajo parecería funcionar sin revocar nada. Se usa el campo que ya está.
//
// Revocar aquí es el arreglo entero: `useSessionManager` (src/hooks/) relee su
// propia fila en cada latido y, al ver `revoked_at`, levanta
// `SessionExpiredDialog` — la misma vía por la que Mission Control ya fuerza
// un cierre de sesión remoto. No hace falta ningún cambio de cliente.
//
// Va detrás de la MISMA compuerta que las otras cuatro funciones de cron de este
// repo (`scheduledGuard.ts`): corre como mucho una vez por periodo y, si no puede
// reclamar su corrida, responde 503 y no corre — falla CERRADO, nunca "corrió
// igual". Ya no hay secreto compartido: ver la cabecera de ese archivo.

const STALE_AFTER_MS = 48 * 60 * 60 * 1000; // 48h — el valor por defecto del portafolio
const PAGE = 200;

async function run(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;
    const cutoffMs = Date.now() - STALE_AFTER_MS;
    const cutoff = new Date(cutoffMs).toISOString();

    // El SDK de Base44 no expone comparadores de rango, así que se pagina y se
    // filtra aquí. Se revocan TODAS las sesiones caducadas, no sólo las del
    // dispositivo "actual" de cada usuario: una sesión vieja se queda rancia
    // exactamente igual que la reciente, y es justo la que nadie mira.
    let revoked = 0;
    let scanned = 0;
    let skip = 0;

    for (;;) {
      const page = await sr.entities.AppSession.list('-created_date', PAGE, skip);
      if (!page || page.length === 0) break;
      scanned += page.length;

      for (const session of page) {
        if (session.revoked_at) continue;
        const seen = Date.parse(session.last_active_at || session.started_at || session.created_date || '');
        // Una fila sin ninguna marca de tiempo legible no se toca: no se puede
        // demostrar que esté rancia, y cerrarle la sesión a alguien por una
        // fecha que no se pudo leer es peor que dejarla correr un día más.
        if (!Number.isFinite(seen) || seen >= cutoffMs) continue;
        try {
          await sr.entities.AppSession.update(session.id, {
            revoked_at: new Date().toISOString(),
            revoked_by: 'purgeStaleSessions',
          });
          revoked++;
        } catch (e) {
          console.error('purgeStaleSessions: could not revoke', session.id, (e as Error)?.message);
        }
      }

      if (page.length < PAGE) break;
      skip += PAGE;
    }

    return Response.json({ ok: true, scanned, revoked, cutoff });
  } catch (error) {
    console.error('purgeStaleSessions failed:', error);
    return Response.json({ error: 'purge_failed' }, { status: 500 });
  }
}

Deno.serve((req: Request) => runScheduled(createClientFromRequest(req), 'purgeStaleSessions', EVERY_DAY, () => run(req)));
