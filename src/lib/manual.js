/**
 * El manual de usuario que se lee DENTRO de la app — módulo 21 del estándar
 * ACACIA. Lo consume `src/pages/About.jsx`.
 *
 * No son documentos de API ni un README: es lenguaje llano, una entrada por
 * "¿cómo hago…?", agrupada por área. Lo que convierte un ticket de soporte
 * ("¿cómo divido un canje?") en algo que la persona resuelve sola.
 *
 * `roles` filtra qué ve cada quien, con las claves de `src/lib/rbac.js`
 * (`owner` | `business_admin` | `staff` | `customer`). Una entrada sin `roles`
 * la ven todos. El filtro es de PRESENTACIÓN, no de seguridad: quien controla
 * de verdad qué puede hacer cada rol es el módulo 3 (servidor), no esta lista.
 *
 * `docs/USER_MANUAL.md` es el mismo material en formato largo y en inglés,
 * para quien lee el repo. Al cambiar una función, actualiza los dos.
 */

export const MANUAL = [
  {
    id: 'primeros-pasos',
    title: 'Primeros pasos',
    entries: [
      {
        q: '¿Cómo entro a mi cuenta?',
        a: 'Desde la pantalla de inicio de sesión, con tu correo y contraseña, o con el botón de Google. Si ya habías entrado en este navegador, Puntos+ te ofrece "Continuar como…" para saltarte el formulario. Si olvidaste la contraseña, usa "¿Olvidaste tu contraseña?" en esa misma pantalla — no hay forma de recuperarla desde dentro de la app.',
      },
      {
        q: '¿Cómo cambio entre claro, oscuro y el tema del dispositivo?',
        a: 'Con el control redondo anclado en una esquina de la pantalla. Al pulsarlo se abre de lado en tres opciones: Claro, Oscuro y Sistema. "Sistema" sigue en vivo la preferencia de tu teléfono o computadora, así que cambia solo al anochecer si tu dispositivo lo hace. Tu elección se recuerda en este navegador.',
      },
      {
        q: '¿Qué pasa si dejo la sesión abierta y me voy?',
        a: 'A los 20 minutos sin actividad aparece un aviso con una cuenta regresiva de 2 minutos. Si no respondes, la sesión se cierra sola y tendrás que volver a entrar. Es la misma protección en todas las apps de ACACIA.',
      },
      {
        q: 'Veo un dispositivo que no reconozco en mi perfil. ¿Qué hago?',
        a: 'En Perfil, "Dispositivos con tu sesión abierta" lista cada navegador donde tu cuenta está activa. Pulsa "Cerrar" en el que no reconozcas: esa sesión se cierra en cuanto ese dispositivo vuelva a conectarse. Después cambia tu contraseña.',
      },
    ],
  },
  {
    id: 'clientes',
    title: 'Para clientes',
    roles: ['customer', 'staff', 'business_admin', 'owner'],
    entries: [
      {
        q: '¿Cómo acumulo puntos?',
        a: 'Muestra el código QR de tu monedero en la caja. El cajero lo escanea, captura el monto de tu compra y los puntos entran a tu saldo al momento. Cada negocio decide cuántos puntos da por peso y si hay un monto mínimo.',
      },
      {
        q: '¿Dónde está mi código QR?',
        a: 'En "Monedero". El código se renueva por seguridad cada tanto; si te aparece vencido, vuelve a abrir la pantalla y se refresca solo. También puedes guardarlo en Google Wallet o Apple Wallet desde esa misma pantalla.',
      },
      {
        q: '¿Cómo canjeo una promoción?',
        a: 'En "Ofertas" eliges la que quieras y confirmas. Se descuentan los puntos que cuesta y el canje queda registrado en tu historial. Si no te alcanza el saldo o la oferta ya venció, la app te lo dice antes de descontar nada.',
      },
      {
        q: '¿Puedo ver en qué gasté mis puntos?',
        a: 'Sí, en "Historial": cada acumulación y cada canje, con fecha, tienda y saldo resultante. Es el registro contable de tu cuenta y no se borra, ni siquiera si cierras la cuenta.',
      },
      {
        q: '¿Cómo descargo mis datos o elimino mi cuenta?',
        a: 'En Perfil. "Descargar mis datos" te da un archivo con tu cuenta, tus movimientos de puntos, tus canjes y tus preferencias de aviso. "Eliminar mi cuenta" es permanente: cierra la cuenta y borra tus datos personales. Tu historial de puntos se conserva como registro contable, sin tus datos. Las cuentas de equipo o administración no se eliminan desde aquí — escribe a soporte.',
      },
    ],
  },
  {
    id: 'caja',
    title: 'Para el equipo de caja',
    roles: ['staff', 'business_admin', 'owner'],
    entries: [
      {
        q: '¿Cómo acredito puntos a un cliente?',
        a: 'Entra a "Punto de venta", escanea o escribe el código del cliente, captura el monto de la compra y confirma. Los puntos se calculan con la tasa de tu tienda. Si repites la misma venta por error, el sistema detecta el duplicado y no la cuenta dos veces.',
      },
      {
        q: '¿Cómo aplico un canje?',
        a: 'En el mismo "Punto de venta", en la pestaña de canje: identificas al cliente, eliges la oferta y confirmas. Si el cliente no tiene saldo suficiente, la operación se rechaza antes de entregar nada.',
      },
      {
        q: 'Me dice que la licencia está suspendida o en solo lectura.',
        a: 'Significa que el negocio tiene un tema de pago pendiente. Mientras dure, no se pueden acumular ni canjear puntos ni dar de alta tiendas — consultar sí. Avisa a quien administra el negocio: se arregla desde "Facturación".',
      },
    ],
  },
  {
    id: 'administracion',
    title: 'Administración del negocio',
    roles: ['business_admin', 'owner'],
    entries: [
      {
        q: '¿Cómo doy de alta una tienda?',
        a: 'En "Tiendas" → nueva tienda. El código con el que los clientes se unen lo genera el sistema, nunca se captura a mano: así dos tiendas no pueden chocar en el mismo código. Ahí mismo defines la tasa de puntos, el monto mínimo y el tope diario.',
      },
      {
        q: '¿Cómo invito a alguien a mi equipo?',
        a: 'Dos formas, en "Equipo": una invitación por correo con el rol ya definido (al aceptarla, entra de inmediato con ese rol), o compartir el código de tu negocio (quien lo usa queda en "Solicitudes para unirse", esperando que tú elijas su rol y apruebes). Puedes cambiarle el rol, asignarle una tienda o quitarle el acceso desde esa misma pantalla en cualquier momento.',
      },
      {
        q: '¿Qué puede hacer cada rol?',
        a: 'En "Permisos" ves la matriz completa: una fila por función, una columna por rol, y puedes ajustar excepciones para tu negocio. Lo que aquí niegues se respeta también del lado del servidor, no sólo escondiendo el botón.',
      },
      {
        q: '¿Cómo corrijo el saldo de un cliente?',
        a: 'En "Clientes", el ajuste manual de puntos. Pide una razón obligatoria y queda registrado en la bitácora con tu nombre — es una corrección auditada, no un movimiento silencioso.',
      },
      {
        q: '¿Dónde veo qué cambió y quién lo hizo?',
        a: 'En "Bitácora": cada ajuste de puntos, cambio de rol y operación sensible, con autor y fecha.',
      },
      {
        q: '¿Puedo pertenecer a más de un negocio?',
        a: 'No: cada cuenta pertenece a un solo negocio. Si ya tienes uno y intentas crear otro o unirte con un código, la app te lo impide — así se evita perder acceso al negocio original. Si necesitas operar un segundo negocio, usa una cuenta de correo distinta para él.',
      },
      {
        q: '¿Cómo reporto un problema o pido una mejora?',
        a: 'En "Soporte" dentro de la app. El ticket llega al equipo de ACACIA en segundos, no al día siguiente, y puedes seguir la conversación desde esa misma pantalla. Soporte sigue disponible aunque la licencia esté suspendida — es justo cuando más falta hace.',
      },
    ],
  },
  {
    id: 'plataforma',
    title: 'Consola de plataforma (ACACIA)',
    roles: ['owner'],
    entries: [
      {
        q: '¿Dónde se opera la licencia de un inquilino?',
        a: 'En "Licencias". Los campos de licencia están bloqueados contra escritura desde el navegador a propósito: sólo los mueve esta consola o el cron de Mission Control, y cada cambio deja su evento de auditoría en la misma operación.',
      },
      {
        q: '¿Cómo doy de alta un inquilino nuevo?',
        a: 'En "Inquilinos". El alta crea el negocio, su primera tienda y la membresía de quien lo administrará, y arranca el periodo de prueba de 30 días.',
      },
    ],
  },
];

/** Las secciones que le tocan a un rol. `role` usa las claves de rbac.js. */
export function manualForRole(role) {
  return MANUAL.filter((s) => !s.roles || s.roles.includes(role));
}

/**
 * Búsqueda sencilla sobre pregunta y respuesta, sin acentos y sin distinguir
 * mayúsculas — quien busca "codigo qr" espera encontrar "código QR".
 */
function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function searchManual(sections, query) {
  const q = normalize(query).trim();
  if (!q) return sections;
  const terms = q.split(/\s+/);
  return sections
    .map((section) => ({
      ...section,
      entries: section.entries.filter((e) => {
        const hay = normalize(`${e.q} ${e.a}`);
        return terms.every((t) => hay.includes(t));
      }),
    }))
    .filter((section) => section.entries.length > 0);
}
