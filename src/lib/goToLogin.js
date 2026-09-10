/**
 * El ÚNICO camino a la pantalla de inicio de sesión de esta app.
 *
 * Módulo 10 del estándar ACACIA: «NUNCA un redirect al login por defecto de
 * Base44». `base44.auth.redirectToLogin()` hace exactamente eso — manda el
 * navegador al `/login` en minúsculas que sirve la plataforma, con
 * `?from_url=…`. Base44 es dueña de esa ruta y responde con su propia página
 * genérica, así que el visitante nunca llega a `/Login`, la pantalla propia de
 * Puntos+ (que sí autentica de verdad: `base44.auth.login` +
 * `loginWithProvider('google')`).
 *
 * **Esto no era teórico.** Del 2026-08-31 al 2026-09-09, el smoke test de
 * producción estuvo en rojo nueve días seguidos porque el control de tema del
 * módulo 12 «no aparecía». No era el control: era que `Home.jsx` (la página de
 * `/`) llamaba a `redirectToLogin()` en su `catch`, así que TODO visitante
 * anónimo se iba a la página de Base44 y la SPA de Puntos+ no llegaba a
 * montarse nunca. El selector era el testigo, no el problema — y durante esos
 * nueve días el CLAUDE.md de este repo culpó a un «hueco de despliegue» que no
 * existía. Se confirmó descartando la otra hipótesis: la app está en
 * `visibility: public`, así que el rebote no lo hacía la plataforma.
 *
 * El arreglo del módulo 10 se había aplicado en UN solo sitio (la rama
 * `authError` de `App.jsx`, que hasta lleva un comentario dándolo por cerrado)
 * mientras otros nueve seguían rebotando. De ahí este archivo: un solo dueño,
 * para que el próximo `catch` que necesite mandar a login no vuelva a elegir.
 *
 * Se usa `window.location.assign` y no el router porque la mayoría de los
 * llamadores están en `catch`/efectos donde no hay contexto de router, y
 * porque un rebote de sesión caída conviene que limpie el estado de la SPA.
 * `Login.jsx` no lee ningún parámetro de retorno, así que no se pierde nada al
 * no propagarlo.
 *
 * Un solo sitio sigue llamando a `redirectToLogin`, y es deliberado:
 * `components/auth/ContinueAs.jsx` — el «Continuar como…» necesita el viaje
 * redondo por la plataforma para reestablecer la sesión en silencio.
 *
 * `pages/OAuthConsent.jsx` tampoco usa este helper, pero no llama a
 * `redirectToLogin`: navega al `login_path` que le devuelve la propia respuesta
 * de consentimiento, propagando `from_url`. Es otro flujo; déjalo en paz.
 * `components/SessionExpiredDialog.jsx` hace esta misma navegación en línea:
 * es una copia canónica del repo estándar y se le documentó esa única línea de
 * divergencia, así que no importa este helper para no separarse más.
 */
export const LOGIN_PATH = '/Login';

/** Dónde volver después de entrar. Sobrevive la recarga, no sale de la pestaña. */
const RETURN_KEY = 'pp-login-return';

/**
 * Sólo se acepta una ruta **relativa al propio origen**. Cualquier otra cosa se
 * descarta y se cae a `/`.
 *
 * No es paranoia de manual: un destino de post-login que acepte lo que le den es
 * un open redirect, y este repo arrastra a propósito el aviso de `react-router`
 * que es exactamente eso — la variante del **backslash** en `<Link>`/`useNavigate`
 * (ver el módulo 14, hallazgo de dependencias diferido). Por eso `\` se rechaza
 * explícitamente además de `//` y de cualquier `://`.
 */
function safeReturnPath(raw) {
  if (typeof raw !== 'string' || raw === '') return null;
  if (!raw.startsWith('/')) return null;   // relativa al origen, siempre
  if (raw.startsWith('//')) return null;   // //evil.com — relativa al protocolo
  if (raw.includes('\\')) return null;     // /\evil.com y familia
  if (raw.includes('://')) return null;
  return raw;
}

/**
 * Manda a la pantalla de inicio de sesión, recordando de dónde venía.
 *
 * Lo del retorno lo encontró una revisión de Codex sobre el PR que introdujo
 * este archivo, y era un hueco real: la llamada vieja
 * `redirectToLogin(window.location.href)` mandaba `from_url` a la plataforma,
 * que **sí** devolvía a la ruta pedida. Cambiarlo por un salto pelado a
 * `/Login` arreglaba el módulo 10 y de paso rompía los enlaces profundos — en
 * particular `/Onboarding?join=1`, que es como se acepta una invitación y que
 * `Layout.jsx` y `BusinessSwitcher.jsx` enlazan en cinco sitios. Quien llegara
 * sin sesión por ese enlace acababa en `/` y nunca veía la invitación.
 */
export function goToLogin() {
  try {
    const here = window.location.pathname + window.location.search;
    // No guardar la propia pantalla de login: eso sería un bucle.
    if (safeReturnPath(here) && !here.startsWith(LOGIN_PATH)) {
      sessionStorage.setItem(RETURN_KEY, here);
    }
  } catch { /* modo privado: se pierde el retorno, no la navegación */ }
  window.location.assign(LOGIN_PATH);
}

/**
 * La ruta a la que volver tras autenticar, de un solo uso. Devuelve `/` si no
 * hay ninguna guardada o si la guardada no pasa el saneado.
 */
export function consumeLoginReturn() {
  let raw = null;
  try {
    raw = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
  } catch { /* idem */ }
  return safeReturnPath(raw) || '/';
}
