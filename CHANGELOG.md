# Changelog — Puntos+

All notable changes to Puntos+ are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.0.21] — 2026-09-28 — Auditoría programada: sin hallazgos, verificado contra producción

Siete días sin commits de código desde v2.0.20 (sólo un bump automático de
`@base44/sdk`/`@base44/vite-plugin`, ya en `main` y con CI verde). Esta
pasada repitió el recorrido completo contra el estado real, no contra la
memoria de la pasada anterior:

- **RLS comparado campo por campo contra `list_entity_schemas` en vivo**
  (`appId 696e7fdd7889892fe40868b7`): las 18 entidades del repo, tanto la
  regla de entidad completa (`create`/`read`/`update`/`delete`) como cada
  bloqueo de campo, coinciden byte a byte con lo desplegado — cero
  diferencias. Es la primera vez que esta comprobación se hace mediante una
  comparación automática en vez de una lectura manual de un subconjunto de
  campos.
- **`Membership` sigue viva (19 entidades, no 18) con 0 filas** — sin cambio
  desde el 2026-09-10; sigue pendiente de un `npm run deploy:entities`
  humano, y las herramientas MCP disponibles siguen sin un borrado de
  esquema.
- **CI y `Production smoke test` verdes** en las últimas 5 corridas
  (#38–#42; #38 fue roja una vez de forma aislada sin cambio de código
  antes ni después — no reprodujo, se registra como posible ruido y no
  como hallazgo).
- **Sin PRs abiertas, sin ramas de auditoría huérfanas.**
- `npm run lint` (eslint + `validate:rls` 18 + `validate:permissions` 11 +
  `validate:functions` 25/40), `npm run build` y `npm run check:secrets`
  limpios. `npm audit --omit=dev`: las mismas 2 advertencias moderadas de
  `react-router`, diferidas a propósito (exige salto de versión mayor).
  Barrido de `console.log`/`debugger`/`dangerouslySetInnerHTML`: sólo los
  dos ya documentados como intencionales (PassKit device log, chart.jsx de
  shadcn/ui). Módulo 9 (QA automatizada): sigue en cero archivos
  `*.test.*` — mismo hueco nombrado en v2.0.20, todavía sin abordar por ser
  cambio de alcance propio.

**Sin hallazgos nuevos de ningún tipo.** No se tocó código de aplicación.
Sin sesión de navegador disponible en este entorno: UI, UX, dispositivos y
rendimiento visual no se ejercitaron directamente esta vez tampoco — el
`Production smoke test` es la única cobertura viva de esas superficies.

---

## [2.0.20] — 2026-09-21 — Auditoría programada: el deploy gap de 10 días, cerrado en vivo

`main` llevaba once días sin un commit. Esta pasada corrió igual, y por
primera vez el conector MCP de Base44 estaba autorizado, así que lo que las
seis auditorías anteriores dejaron como "no verificado" — si el esquema
realmente desplegado coincide con el repo — se pudo comprobar contra la base
viva (`appId 696e7fdd7889892fe40868b7`).

**El hallazgo real: `Production smoke test` llevaba en rojo cada corrida
desde que v2.0.19 se mergeó** (2026-09-10, diez días), con el mismo síntoma
que esa versión decía haber cerrado — un visitante anónimo seguía rebotando
al `/login` genérico de la plataforma. Se leyó el árbol que Base44 tiene
sincronizado desde GitHub (mismo `appId`) y confirmó que el fix de v2.0.19
**sí** había llegado al workspace — sólo nunca se había publicado. Se
publicó desde aquí (`POST /api/apps/{app_id}/deploy`, la versión actual, ya
revisada y mergeada por un humano hace diez días — ningún cambio nuevo) y se
confirmó con un `workflow_dispatch` de la propia suite: **verde, las 7
pruebas**, primera vez desde el 2026-09-10.

**Confirmado en producción, no sólo en el `.jsonc`:** los 17 campos de
licencia bloqueados de `Business` (módulo 1) y los 8 campos de rol/inquilino
bloqueados de `User` (módulo 19) llevan exactamente el `rls.write` que el
repo declara. `LoyaltyAccount.qr_token`/`business_id`/`store_id` también
coinciden. Ningún hallazgo nuevo de aislamiento.

**Confirmado, no nuevo:** `Membership` sigue desplegada (19 entidades, no
18) con 0 filas — el retiro del módulo 18 documentado el 2026-09-10 sigue
pendiente de `npm run deploy:entities`, destructivo y sin herramienta MCP
disponible para ejecutarlo desde esta sesión (no se intentó).

**Sin hallazgos de código:** `npm run lint`, `npm run build`,
`npm run check:secrets` limpios. `npm audit` sigue en las mismas 2
advertencias moderadas de `react-router`, diferidas a propósito desde el
2026-08-31 (exige salto de versión mayor). Un barrido de
`console.log`/`debugger`/`TODO`/`dangerouslySetInnerHTML` no encontró nada
real.

**Nombrado por primera vez:** el módulo 9 (QA automatizada) nunca se
construyó — cero archivos `*.test.*` en el repo. Lo que corre en CI son
guardias estáticos de configuración (RLS, permisos, funciones, secretos),
no pruebas de lógica de negocio. Queda como tarea propia, mismo criterio
que el salto de `react-router`: no se improvisa sin revisión dentro de una
pasada desatendida.

Sin sesión de navegador disponible (sin credenciales Base44 en este
entorno): UI, UX, dispositivos y rendimiento no se ejercitaron visualmente.

---

## [2.0.19] — 2026-09-10 — El hueco de despliegue no existía: era el login

Nueve días de `Production smoke test` en rojo (runs #12 a #22) tenían una causa
distinta de la que este repo llevaba documentada, y la documentación equivocada
es parte del hallazgo.

### Lo que pasaba

`pages.config.js` define `mainPage: "Home"`. Un visitante **sin sesión** entra a
`/`:

1. `Home.jsx` llama a `base44.auth.me()`, que lanza para un anónimo;
2. su `catch` llamaba a `base44.auth.redirectToLogin()`;
3. el navegador se iba al `/login` **en minúsculas** que sirve la plataforma
   Base44, con `?from_url=…`.

La SPA de Puntos+ **nunca llegaba a montarse**. Nada que dibuje React podía
estar en esa página — el selector de tema del módulo 12 incluido.

Por eso el smoke test fallaba exactamente 3 de 6: las tres afirmaciones que
pasaban (200, `<title>`, tema resuelto antes del montaje) las cumple igual la
página de login de Base44, porque salen del HTML estático y del script
pre-montaje. Las tres que fallaban son las únicas que exigen React montado.
**La suite decía la verdad; el diagnóstico que se le colgó encima era falso.**

### Por qué se descartó la otra explicación

`npx base44 visibility` puede poner una app en `private`, y una app privada
rebota a los anónimos igual. Se confirmó con el dueño que **Puntos+ está en
`public`**, así que el rebote no lo hacía la plataforma: lo hacía el código.

### El defecto de fondo

El módulo 10 del estándar dice «NUNCA un redirect al login por defecto de
Base44». Ese arreglo se había aplicado en **un** sitio — la rama `authError` de
`App.jsx`, que hasta lleva un comentario largo dándolo por cerrado — mientras
**diez** seguían rebotando:

`Home.jsx`, `Wallet.jsx`, `Offers.jsx`, `History.jsx`, `Chat.jsx`,
`Profile.jsx`, `MerchantPOS.jsx`, `Onboarding.jsx`, `Layout.jsx` y
`useCurrentUser.js` (`useRequirePage`).

Nuevo `src/lib/goToLogin.js`: un solo dueño de esa navegación, para que el
próximo `catch` que necesite mandar a login no vuelva a elegir. Va a `/Login`
con `window.location.assign` — la mayoría de los llamadores están en `catch` o
efectos sin contexto de router, y `Login.jsx` no lee ningún parámetro de
retorno, así que no se pierde nada al no propagarlo.

**Un sitio sigue llamando a `redirectToLogin` a propósito:**
`components/auth/ContinueAs.jsx`, cuyo «Continuar como…» necesita el viaje
redondo por la plataforma para reestablecer la sesión en silencio.
`AuthContext.navigateToLogin` (hoy sin llamadores) se reapuntó al helper en vez
de borrarse: una función viva que hace lo prohibido es un arma cargada.

### Verificado

`npm run lint` (eslint + `validate:rls` 19 entidades + `validate:permissions` +
`validate:functions` 26/40) y `npm run build` pasan. Y con un navegador real
contra el build de producción servido en local: un visitante anónimo en `/`
ahora navega a `/Login` —dentro de la SPA, con `[data-theme-switcher]`
presente— y **ninguna** navegación sale a `/login?from_url=`.

**Alcance de esa prueba, dicho claro:** en local el redirect de plataforma no
llegaba a saltar nunca (el fallback SPA de `vite preview` lo absorbe), así que
esto demuestra que el código ya no llama al redirect prohibido y que el destino
es el correcto. **La prueba de producción es desplegar y correr la suite** —
`npm run deploy:site` y después un `workflow_dispatch` de `Production smoke
test`. Hasta entonces esto no está demostrado en vivo.

### La lección, que es la cara del módulo 11

Este repo pasó nueve días con una explicación escrita y equivocada («mergear no
deploya el sitio»), que era **plausible, documentada, y de la casa** — el mismo
fallo había ocurrido de verdad antes, en flowfin. Ayer se desplegó de verdad, el
smoke siguió rojo, y sólo entonces se leyó la línea del log que decía
`navigated to ".../login?from_url=..."` y llevaba ahí desde el principio.

**Una hipótesis que encaja con los síntomas no es un diagnóstico.** Lo que la
convierte en diagnóstico es leer lo que el fallo ya está diciendo, y el smoke
test lo llevaba diciendo nueve días en cada corrida.

---

## [2.0.18] — 2026-09-09 — Módulos 19-23 del estándar ACACIA

Auditoría programada contra `jospabloh/acacia-app-standard`. La lista de
cumplimiento de este repo llegaba al módulo 10; el estándar va por el 23. De
los trece que faltaban por revisar, nueve ya estaban hechos y documentados en
prosa (11-18); los cinco últimos no existían. Están en esta versión.

> **Número de versión:** el 2.0.17 **no existe**, y ya está resuelto. Se
> reservó para PR #66 (`claude/sleepy-cray-wio3k2`), que llevaba abierto desde
> el 2026-08-31; al mergear esa rama —después de ésta— se dejó caer su bump y
> su contenido entró aquí como documentación (ver la sección de más abajo). Es
> la tercera colisión de versión seguida entre PRs de auditoría en este repo, y
> la lección es la misma cada vez: **el número de versión se elige al mergear,
> no al abrir el PR.**

### Módulo 14 — la reauditoría del 2026-08-31, que se quedó en una rama

Contenido de PR #66, mergeado aquí sin su bump de versión (ver la nota de
arriba). Registra una pasada real que se hizo el **2026-08-31** y que nunca
llegó a `main`: el módulo 18 (cambio de negocio — entidad `Membership`,
`switchBusiness`, y los cambios de `acceptInvitation`/`createBusiness` que lo
sostienen) se envió el 2026-08-26 **sin** la reauditoría del módulo 14 que
este mismo archivo exige al añadir una entidad o una función. Y cambiar de
inquilino es exactamente el escenario que la pasada del 2026-08-23 había dado
por inexistente en esta app.

Lo que esa pasada encontró, contra el esquema desplegado:

- `Membership.read` va acotado por `data.user_id`, **no** por negocio — y eso
  es correcto y necesario: es lo que permite listar las membresías de negocios
  en los que el usuario no tiene activo su `business_id`. `create` / `update` /
  `delete` son sólo servicio, igual que el resto de campos que cruzan
  inquilino en este repo.
- `switchBusiness` re-deriva el conjunto de membresías del llamante en el
  servidor, nunca del cuerpo, y responde el **mismo 404 genérico** para un
  `business_id` ajeno que para uno inexistente — no funciona como oráculo de
  existencia. Nunca escribe `role: admin`, y el dueño de plataforma no recibe
  fila `Membership` al crear un negocio, para que el selector no pueda
  degradarlo a `business_admin` de su propio negocio.

**Y su conclusión de "sin hallazgos nuevos" era falsa**, lo cual es la parte
que vale la pena conservar. Una revisión de Codex sobre ese mismo PR encontró
que `manageTeamMember` nunca tocaba la fila `Membership` al remover o degradar
a alguien — y como `switchBusiness` lee `Membership` en solitario, la persona
recién removida recuperaba su acceso con una sola llamada. Arreglado en la
2.0.16, ya mergeada. Es el segundo caso seguido en este repo en que una
auditoría automatizada firma "sin hallazgos" sobre algo que sí los tenía, y el
que los encontró fue un revisor distinto mirando el mismo diff.

**Dependencias — `react-router` sigue diferido, y por escrito.**
`react-router-dom@6.30.4` arrastra un aviso moderado (open-redirect por
backslash en `<Link>`/`useNavigate`; el segundo aviso, de hidratación SSR, no
aplica: esta app es un SPA de Vite). El arreglo real exige `>=7.18`, un salto
mayor v6→v7; `npm audit fix` sin `--force` sólo llega a 6.30.6, todavía dentro
del rango vulnerable. No se cierra en una pasada desatendida: una migración de
enrutado que toca todas las rutas necesita regresión manual, que es justo lo
que este archivo lleva quince módulos pidiendo. Sigue pendiente, con su propio
seguimiento.

### Módulo 22 — ninguna decisión de escritura se toma con la vista cacheada de `auth.me()` (seguridad)

`base44.auth.me()` es la vista de SESIÓN del usuario y está cacheada — es
barata justo porque no vuelve a la base. Trece funciones de backend la usaban
para decidir **si** escribían o **en qué inquilino** escribían: `user.role`,
`user.data.business_id`, `user.storeId`. Todos esos campos los escribe otra
función de servicio (`switchBusiness`, `manageTeamMember`, `acceptInvitation`,
`createBusiness`), así que la vista queda vieja en cuanto una de ellas corre.

Los tres casos peores que había, y no son teóricos:

- **`createBusiness` / `acceptInvitation`** escribían una fila `Membership` con
  el `business_id` y el `role` cacheados. `switchBusiness` (módulo 18) confía
  en `Membership` sin releer nunca el `User`, así que una vista vieja aquí
  graba una pertenencia al inquilino equivocado — y le abre esa puerta de forma
  permanente.
- **`createLoyaltyAccount`** decidía `role = user.role === 'admin' ? 'admin' :
  'customer'` y lo **escribía**: una vista que dijera `customer` de quien ya es
  `admin` degrada al dueño de la plataforma a cliente.
- **`getAppContext`** es el "diff y me lo salto" exacto que el módulo describe:
  `if (isOwner && user.role !== 'admin')` → promover. Si el cacheado dice
  `admin` pero el registro almacenado no lo es, la promoción no corre, la
  respuesta sale igual de contenta, y el dueño se queda sin consola sin que
  nada lo delate. Es la forma en que Rumbo perdió dos rondas de diagnóstico.

Nuevo `base44/shared/callerIdentity.ts` (`resolveCaller` /
`unresolvedCallerResponse` / `resolveAppRole`): relee el registro `User` del
llamante como servicio y devuelve su identidad autoritativa. Falla **cerrado**
— si el registro no se puede leer, 403, nunca la vista cacheada. `auth.me()`
se queda para lo que sí sirve: `user.id` y `user.email`.

Migradas: `guardedEntityWrite`, `adjustCustomerPoints`, `createStore`,
`manageTeamMember`, `createBusiness`, `acceptInvitation`, `earnPoints`,
`burnPoints`, `redeemOffer`, `licensesAdmin`, `deleteMyAccount`,
`createLoyaltyAccount` y `getAppContext`. `switchBusiness` ya estaba bien (sólo
usa `user.id` y relee `Membership`).

**Y de paso, una afirmación falsa que costaba código:** cinco archivos repetían
que «Deno no puede importar entre directorios de función», y por eso
`isBusinessWriteBlocked()` y `getAppRole()` están copiados a mano en media
docena de sitios. Es falso — `base44/shared/scheduledGuard.ts` lleva meses
importándose desde cuatro crons, y `cleanupInactiveUsers` lo desmentía en su
propia línea 2 mientras lo afirmaba en la línea 4. Lo que de verdad no se puede
es importar desde `src/`. Los comentarios están corregidos; consolidar las
copias toca las cuatro funciones que mueven puntos y merece su propio cambio.

### Módulo 20 — control de sesión, las tres capas

Sólo existía media capa 2: `AppSession` con un latido de cliente. No había
temporizador de inactividad ni forma de que una sesión muerta se cerrara.

- **Capa 1 — inactividad.** A los 20 min aparece `IdleWarningDialog` con 2 min
  de cuenta regresiva; sin respuesta, la sesión se cierra y sale
  `SessionExpiredDialog`. Los dos diálogos son **idénticos byte a byte** a los
  canónicos del repo estándar, salvo **una línea** documentada en el propio
  archivo: el canónico llama a `base44.auth.redirectToLogin()`, que manda al
  `/login` genérico de Base44 — precisamente lo que el módulo 10 de esta app
  arregló. Aquí el botón va a `/Login`, la pantalla propia.
- **Capa 2 — otros dispositivos, a la vista.** Nuevo `ActiveSessions` en
  Perfil: cada navegador con la sesión abierta, cuándo estuvo activo, y un
  botón para cerrarlo. Se muestra a **todos los roles**, no sólo a clientes: un
  dispositivo desconocido es una señal de cuenta comprometida igual para un
  cajero que para un consumidor.
- **Capa 3 — cosecha de sesiones rancias.** Nueva
  `base44/functions/purgeStaleSessions`: revoca toda sesión con más de **48 h**
  sin actividad, detrás del mismo guardia fail-closed (`scheduledGuard.ts`) que
  las otras cuatro tareas programadas. Sin `SCHEDULED_TASK_SECRET` responde
  403, nunca "corrió igual".

`src/lib/SessionHeartbeat.jsx` se fusionó en `src/hooks/useSessionManager.js`
(un solo dueño del estado de sesión). El único cambio de comportamiento: una
sesión revocada ahora levanta el diálogo —volver a entrar, o salir del todo—
en vez de rebotar a logout sin explicación.

**Desviación deliberada del contrato canónico:** el `useSessionManager.js` del
estándar habla con un router `session` sobre una entidad `Session` con
`device_id` y `status: active|passive|revoked`. Puntos+ tiene `AppSession`, ya
desplegada y leída por el puente de Mission Control, cuya marca de revocación
es `revoked_at`. Adoptar el contrato canónico exigiría campos nuevos en una
entidad viva — y un campo no desplegado en Base44 se **descarta en silencio**
al escribir, así que un `status: 'revoked'` escrito antes de desplegar el
esquema desaparecería y la capa 3 parecería funcionar sin cosechar nada. Esta
versión usa sólo campos ya desplegados: funciona el día que se mergea.

### Módulo 21 — pantalla "Acerca de"

No existía: sólo un número de versión en el pie de Perfil, y el arreglo
`CHANGELOG` de `appConfig.js` era código muerto que nadie leía. Nueva
`src/pages/About.jsx`, enlazada desde Perfil y desde la barra lateral:

- **Manual de usuario buscable** (`src/lib/manual.js`), por área y filtrado por
  rol, en lenguaje llano. La búsqueda ignora acentos y mayúsculas: quien
  escribe "codigo qr" encuentra "código QR".
- **Novedades de esta versión** leídas del mismo arreglo `CHANGELOG` del módulo
  6 —no una segunda lista que alguien tenga que acordarse de actualizar— con el
  historial completo detrás de un desplegable.
- **Versión sin ambigüedad**: `About`, `package.json` y el pie de Perfil son la
  misma línea.
- **Contacto**: correo de soporte y acceso directo a la pantalla de soporte de
  la app, más la línea de ACACIA.

Cada entrada del changelog lleva ahora **dos** resúmenes: `resumen` (español
llano, lo que cambió para la persona) es lo que se muestra, y `summary` sigue
siendo el registro técnico. Quien lee "closed the three module-14 isolation
findings" no aprende nada; quien lee "revisión de mantenimiento" pierde el
rastro. `About` cae a `summary` si falta `resumen`, así que olvidarse de uno
degrada en vez de dejar la tarjeta en blanco.

**Sin número de WhatsApp**, y a propósito: el módulo lo sugiere pero no hay
ninguno en este repo, y un canal de contacto inventado es peor que ninguno.
Cuando exista, va en esta pantalla.

### Módulo 19 — el porqué de cada bloqueo, dentro del propio esquema

Los **17** campos de licencia de `Business` tenían `rls.write: false` y
**ninguna descripción**. Un agente inspeccionando el esquema desplegado en
aislamiento —que es exactamente lo que le pasó a FlowFin, donde una sesión
ajena quitó el bloqueo de `User.family_id` razonando al revés sobre el
mecanismo— no tenía forma de saber qué protegían. Los 17, más los 3 de
`LoyaltyAccount` y los 8 de `User`, llevan ahora una descripción que dice qué
es el campo, **qué se rompe si se quita el bloqueo**, y —lo crítico— que
gobierna la **ESCRITURA y no la lectura**: una regla de escritura no puede
producir un síntoma de lectura, y decirlo en el sitio donde alguien va a mirar
es lo que corta ese diagnóstico al revés.

### Módulo 23 — la navegación sobrevive a una recarga

El elemento activo ya se derivaba de la ruta en cada render (`currentPageName`
sale del `<Route>`), así que sale bien desde el primer frame. Lo que no se
derivaba de nada era el scroll dentro del menú lateral, y este repo **recarga a
propósito** (el cambio de negocio del módulo 18 llama a
`window.location.reload()`). Nuevo `useStickyScroll`: guarda la posición en
`sessionStorage` —no `localStorage`: sobrevive a la recarga sin filtrarse a
otras pestañas— y la restaura en `useLayoutEffect`, antes de pintar, para que
no se vea un frame en la posición por defecto. No hay grupos plegables en esta
nav, así que el scroll es el único estado no derivable que había.

### Verificado

`npm ci`, `npm run lint` (eslint + `validate:rls` 19 entidades +
`validate:permissions` + `validate:functions` 26/40), `npm run build`,
`npm run check:secrets`. `deno check` sobre las 14 funciones tocadas **contra
una línea base de `HEAD`**: el conteo de errores bajó o quedó igual en todas
(p.ej. `acceptInvitation` 29→15, `createBusiness` 45→31), ninguna subió — los
que quedan son el hueco de tipos genéricos del `@base44/sdk`
(`Property 'X' does not exist on type '{}'`) que `switchBusiness`, sin tocar,
también reporta. La búsqueda del manual se ejercitó con casos reales
(acentos, varios términos).

### No verificado — dilo, no lo insinúes

- **Ninguna pantalla autenticada se abrió en un navegador.** No hay sesión de
  Base44 en este entorno. Eso incluye `About`, los dos diálogos de sesión y la
  lista de dispositivos.
- **Nada de esto está desplegado.** El conector MCP de Base44 no está
  autorizado en esta sesión, así que no se pudo correr `npm run deploy:site`,
  `npm run deploy` ni `npm run deploy:entities`. Ver la sección de acciones
  pendientes en `CLAUDE.md`: mergear no despliega nada, y las descripciones del
  módulo 19 no llegan a producción hasta un `deploy:entities`.
- **`purgeStaleSessions` no tiene todavía su entrada en el panel de tareas
  programadas de Base44.** Desplegar la función no la agenda; hay que darla de
  alta a mano, como las otras cuatro.
- **El hueco de despliegue del 2026-09-07 sigue abierto.** `Production smoke
  test` cumple hoy **9 días seguidos en rojo** (runs #12 a #21), siempre porque
  `[data-theme-switcher]` no aparece en producción aunque `ThemeSwitcher` se
  monte sin condición en `src/App.jsx`.

---

## [2.0.16] — 2026-09-07 — Scheduled full audit: production deploy gap, dependency patches

### Security — fixed while this PR was open: revoked/demoted team members could self-restore access

A Codex review on PR #66 caught this during this same audit run: `manageTeamMember`
(`remove` / `setRole` / `assignStore`) only ever updated the target's live `User`
record. It never touched their `Membership` row for that tenant — and
`switchBusiness` (module 18) reads Membership alone, never the live `User`
record, to decide what business/role/store a switch restores. Net effect: a
tenant admin removes a staff member, or demotes a `business_admin` to
`merchant` — the `User` record changes, but the old `Membership` row for that
business still says `business_admin` (or whatever they had). The
removed/demoted person calls `switchBusiness` with that same `business_id` and
gets their old role, store, and business access back, no invitation needed.
Access revocation was reversible by the person it was revoked from.

Fixed: `manageTeamMember` now mirrors every op into the target's Membership row
for the tenant it's operating in — `remove` and a `setRole` down to `customer`
delete it (no tenant role left to preserve); `setRole` to `business_admin`/
`merchant` and `assignStore` update its role/store in place. Never creates a
row that didn't already exist — a member with no Membership can't be switched
back into regardless. Verified with a `deno check` type-check of both the
touched file and the untouched `switchBusiness` (to confirm the pre-existing
`@base44/sdk` typing gaps it also reports are not something this change
introduced — this repo has no deno step in CI, so this was the first type
check either file has ever gotten).

**Resolved 2026-09-09:** PR #66 (`claude/sleepy-cray-wio3k2`, the
module-14/Membership reaudit) independently also bumped to `2.0.16`. It was
briefly renumbered to `2.0.17`, then merged third — after `2.0.18` — so its
bump was dropped entirely and its content folded into the `2.0.18` entry
above as documentation. `2.0.17` never shipped and does not exist.

### Found — production is not serving the deployed code (not fixed here — needs a manual deploy)

`npm run test:smoke`'s daily scheduled run has failed identically for at
least 7 consecutive days (GitHub Actions runs #12–#18, 2026-08-31 through
today) against `https://puntosplus.acaciaco.com.mx`: the site answers 200
with the right `<title>`, throws no console errors, and paints a resolved
theme before mount, but `[data-theme-switcher]` — the corner control shipped
in module 12 (2026-08-21) — is never found. `ThemeSwitcher` is mounted
unconditionally at the top of `src/App.jsx` (no auth/route gate that could
explain it being absent for a logged-out visitor on `/`), so this reads as
exactly the failure mode this repo's own CLAUDE.md has documented since
module 11: **merging to `main` does not deploy the site** —
`npm run deploy:site` is a separate, manual step. This sandbox has no Base44
CLI credentials (`npx base44 whoami` fails outright, no `BASE44_*` env is
set) and the Base44 MCP connector isn't authorized in this session either, so
the deploy itself could not be run or confirmed from here.

**Action needed from a human with Base44 access:** run `npm run deploy:site`,
then re-run the `Production smoke test` workflow (`workflow_dispatch`) to
confirm the corner switcher shows up. If it still doesn't after a real
deploy, that changes this from a deploy gap into a real product bug and
needs its own follow-up.

### Fixed — dependency vulnerabilities (transitive, non-breaking)

`npm audit` had climbed to 6 advisories (1 low, 4 moderate, 1 high) since the
2.0.15 audit: `fflate`, `postcss-selector-parser`, `@humanfs/node`, and
`browserslist` all had newer non-breaking patches available. `npm audit fix`
(no `--force`) resolved all four; only `package-lock.json` changed, no
direct dependency version in `package.json` moved. `npm run lint` and
`npm run build` both still pass.

**Left deferred, as before:** the `react-router`/`react-router-dom` moderate
advisory (open redirect via backslash in `<Link>`/`useNavigate`) still needs
a major v6→v7 bump (`react-router-dom@7.18.3`) that `npm audit fix --force`
would apply blindly. Per the 2.0.16-in-#66 decision, this isn't something an
unattended audit run should force through without manual route regression
testing — still tracked as its own follow-up, not done here either.

### Docs

- `docs/USER_MANUAL.md` had no mention of the module-12 theme switcher at
  all (last updated 2026-08-17, four days before that feature shipped) —
  added a short **Appearance** section and bumped its version/date header.
- This entry.

### Verified this pass

`npm ci`, `npm run lint` (eslint + `validate:rls` 19 entities +
`validate:permissions` + `validate:functions` 25/40), `npm run build`,
`npm run check:secrets`, `npm audit --omit=dev` (down to the one deferred
finding above). PR #66 (open since 2026-08-31) had its `lint-and-build` check
failing identically on both of its original attempts — 3-4 second runs that
died before `actions/checkout` could even start. Re-triggered it now that a
week of green `CI` runs on `main` argues against a real regression; it came
back green on this re-run, confirming the prior diagnosis (runner-
provisioning flake, not this repo's code).

## [2.0.15] — 2026-08-24 — Close out the three module-14 isolation findings

Scheduled portfolio-standard audit re-ran module 14 (multi-tenant isolation)
against this repo's own CLAUDE.md, which already documented three findings
from the 2026-08-23 pass as real-but-unfixed. All three were still present in
the deployed schema/code and are fixed here; no new findings surfaced.

### Security — RLS / tenant isolation
- **MEDIUM — `earnPoints`/`burnPoints` never checked the loyalty account's own
  tenant against the store being operated.** Both only checked
  `account.store_id && account.store_id !== store.id` — a legacy/unscoped
  account (`business_id: null`, `store_id: null`, the shape any account
  created before store assignment has) sailed past that `&&` entirely. A
  cashier at any store of any tenant could accrue or deduct points on such an
  account. Fixed by adding the same fail-closed tenant check `redeemOffer`
  already used: reject unless `account.business_id` is set and equals
  `store.business_id`, ahead of the pre-existing store_id check (left in place
  as a secondary constraint).
- **LOW — `LoyaltyAccount.qr_token` had no field-level RLS write lock**, so a
  customer could set their own QR token to any value, including another
  customer's (collision risk was already store-scoped by the POS lookup and
  RLS, not a cross-tenant leak, but there was no reason to allow it — only
  `createLoyaltyAccount`/`regenerateExpiredQR` should ever set it). Now
  `rls.write: false`.
  - **Caught in review (Codex, before merge):** locking the field broke
    `Wallet.jsx`'s own QR refresh — it wrote `qr_token`/`qr_token_expires`
    directly from the browser every 5 minutes on expiry (and QRWallet.jsx's
    auto-refresh would have retried every second on failure, spamming the
    error toast). New `base44/functions/refreshQrToken` is the service-role
    replacement, scoped to the caller's own account (same shape as
    `exportMyData`); `Wallet.jsx` now calls it instead of writing the field.
    Not `regenerateExpiredQR` — that one's the unauthenticated cron sibling
    that sweeps every account, wrong shape for a single on-demand refresh.
- **LOW — `LoyaltyAccount.business_id`/`store_id` field-level write rules had
  no tenant scoping**, unlike the entity-level rule sitting right next to
  them. A cashier or business_admin could, via a direct SDK call, move one of
  their own tenant's accounts to a foreign `business_id`/`store_id` (could not
  reach anything outside their tenant, only push a record out of it). Both
  fields now carry the same `data.business_id == {{user.data.business_id}}`
  scoping the entity-level `update` rule already enforces.

**Deploy note: the `LoyaltyAccount` schema change (`qr_token`,
`business_id`, `store_id`) must be pushed via `npm run deploy:entities`
(or `update_entity_schema`) — the repo `.jsonc` alone doesn't change the
field locks in production.**

**Verified:** `npm run lint` (eslint + `validate:rls` 18 entities +
`validate:permissions` + `validate:functions`) and `npm run build` both pass.
`deno check --node-modules-dir=auto` on both edited functions shows no new
type errors near the changed lines (12 pre-existing errors elsewhere in
`earnPoints`, all from the `@base44/sdk` types resolving `user`/`sr.entities`
too loosely — unrelated to this change, present before it too). **Not
verified:** a live suspended/cross-tenant POS session — this repo still has
only the one tenant/account documented in module 14's "lo que no pude
verificar", so the exact scenario these fixes close still can't be exercised
against real data.

## [2.0.14] — 2026-08-18 — In-app version/changelog display

Portfolio-standard audit flagged module 6 ("changelog & versioning") as
missing, since there was no `APP_VERSION`/in-app changelog surface — only
this file. That part of the finding was accurate; a second, separate claim
in the same audit round ("no changelog system exists at all") was not — this
file already existed and was already being kept up to date every release.

- Added `src/lib/appConfig.js` (`APP_VERSION`, `RELEASE_DATE`, a condensed
  `CHANGELOG` array mirroring this file's own entry titles) and surfaced it
  in the footer of `src/pages/Profile.jsx`, matching the pattern already used
  in stockflow/cateqhub.
- The same audit also flagged module 5 ("health & latency") as fully
  missing. That claim was wrong: `base44/functions/acaciaControl/entry.ts`'s
  `case 'ping'` has existed all along and Mission Control's `syncHealth.js`
  already polls it — no code change was needed, just correcting the record.

## [2.0.13] — 2026-08-17 — Same-tenant RLS over-permission, notification-preference gap, wallet/email crash guards

Scheduled security/quality/tenant-isolation/permissions/UX audit. No cross-tenant
leaks found (the audit's gating check) — every finding below is **same-tenant**
over-permission or a functional/quality bug. Inventory step found PR #43
(v2.0.12) still open a week after CI passed with no blocking review comment;
merged it first, then continued this pass on top of it.

### Security — RLS (same-tenant over-permission, all additive/narrowing-safe)
- **MEDIUM — `LoyaltyAccount.read`, `PointsLedger.{create,read}`, `AuditLog.create`,
  `Redemption.{read,update}` each carried a redundant, wider `$or` branch**
  (merchant + `business_id` only, no `store_id`/`storeId`) sitting alongside the
  already-correct store-pinned branch. Net effect: any staff (`merchant`) account
  could read every customer's `LoyaltyAccount` (balance, tier, phone) tenant-wide,
  read/forge `PointsLedger`/`AuditLog` entries for stores they don't operate, and
  read/update `Redemption`s from other stores in the same tenant — all via a
  direct SDK call bypassing the UI, which already scopes correctly by
  `store_id` (see `MerchantPOS.jsx`'s own `// SECURITY: Only customers from this
  store` comment) and contradicts `rbac.js`'s declared matrix (`customers:view`
  excludes `staff`). Verified no legitimate flow relied on the wider grant before
  removing it. Fixed by deleting each redundant branch — the store-pinned branch
  already covers all legitimate staff access.
- **LOW — `Offer.read`, `Campaign.read`, `Store.read` each carried a trailing,
  unconditional `data.business_id`-only branch that neutralized the preceding
  `status: "active"` gate**, letting any tenant member — including plain
  `customer` — read draft/paused/ended `Offer`s and `Campaign`s and
  inactive/suspended `Store`s. Fixed by replacing the unconditional branch with
  one scoped to `business_admin` (who legitimately needs to see and manage
  drafts — confirmed `AdminCampaigns.jsx`/`AdminStores.jsx` query without a
  status filter); customers/staff still only ever see `status: "active"` rows.
- **MEDIUM — `NotificationPreference` had no `business_admin` read branch**, so
  `AdminCampaigns.jsx`'s "Notificar usuarios" button (campaign/offer emails)
  silently sent to ~0 recipients for every tenant admin — RLS narrowed the
  client-side `filter({business_id})` call down to the admin's own row. Doubly
  broken: `Profile.jsx`'s `NotificationPreference.create` never stamped
  `business_id` in the first place, so even a correct RLS branch would have
  matched nothing. Fixed both: added the `business_admin` + `data.business_id`
  read branch (additive), and `Profile.jsx` now stamps `business_id` from the
  signed-in user's own record at creation. Pre-existing rows created before this
  fix won't retroactively gain a `business_id` (no destructive backfill run);
  going forward, all new opt-ins are tenant-discoverable.
- All 8 changed entity schemas deployed to the Base44 backend and independently
  re-verified against `list_entity_schemas` — zero drift between repo and
  deployed `rls`/`properties`/`required`.

### Security — email / crash guards
- **HIGH — stored HTML injection in `checkTrialExpiration`'s admin/customer
  emails.** `account.user_name` is a copy of the customer-editable
  `User.full_name` (`Profile.jsx`, no validation) interpolated unescaped into
  HTML `<p>` tags — a customer could embed markup/a phishing link that renders
  in the platform admin's inbox (`ADMIN_NOTIFICATION_EMAIL`) or their own
  suspension/reminder emails. Fixed with a local `escapeHtml()` applied to every
  `user_name`/`user_email` interpolation in the file.
- **MEDIUM — `createGoogleWalletPass` crashed on legacy accounts with a null
  `tier`** (`account.tier.charAt(...)` with no guard), and read
  `current_balance`/`lifetime_earned`/`lifetime_redeemed` without the `|| 0`
  fallback its sibling `createAppleWalletPass` already uses. Brought in line
  with the Apple-pass guard pattern.
- **LOW — `sendWeeklySummary`/`cleanupInactiveUsers` read `current_balance`
  unguarded**, silently dropping that customer's email (swallowed by the
  per-account try/catch, logged as a generic "email send" failure) on any
  legacy record missing the field. Added the same `|| 0` guard.
- **LOW — `sendWeeklySummary` never consulted `NotificationPreference`**, unlike
  `cleanupInactiveUsers`. It's a promotional digest, not transactional; now
  skips accounts with `email_enabled` or `points_activity_enabled` off.

### Code quality
- Centralized the `merchant_role === 'merchant' || role === 'merchant'`
  inline check — duplicated across `Wallet.jsx`, `Home.jsx`, `Chat.jsx`,
  `Offers.jsx`, `History.jsx`, `Profile.jsx` — to `rbac.js`'s `isStaff()`,
  which also correctly covers the `app_role === 'staff'` case the six inline
  copies omitted.
- Removed `src/components/ProtectedRoute.jsx` — dead code, never imported
  anywhere (route guarding is done inline in `App.jsx`).
- `docs/ARCHITECTURE.md` entity count corrected (16 → 18; `AppSession` and
  `WalletRegistration` were never listed).

### Accessibility
- Added `aria-label`s to icon-only buttons that were missing one, matching the
  app's own established pattern: `MerchantPOS.jsx` back button,
  `NotificationsPanel.jsx` close button, `Layout.jsx`'s two mobile menu toggles.
- `Login.jsx`/`Register.jsx` password/email/name fields now have a
  programmatically-associated `<Label htmlFor>` instead of placeholder-only or
  a plain `<span>`.
- `BusinessSupport.jsx`'s satisfaction-rating stars and "Cerrar ticket" now
  disable while the rating mutation is in flight, matching the double-submit
  guard used everywhere else in the app.

### Dependencies
- `npm audit fix` (non-breaking) re-confirmed clean after the above changes:
  `lint`/`build`/`validate:rls`/`check:secrets` all pass.

### Deferred (documented, not fixed in this pass — see rationale)
- **The `tier` field never advances past `bronze`** — `earnPoints`/`burnPoints`
  update balances but never recompute tier from `lifetime_earned`, even though
  `Profile.jsx` already renders specific progression thresholds (1,000 / 5,000
  / 15,000 pts) that can now never be reached. Real, customer-visible, but a
  scoped feature change to a live points-earning function, not a pure bug fix —
  deferred to its own PR so it gets dedicated testing rather than riding along
  in a routine audit, same treatment this repo has already given the
  `react-router` v6→v7 migration (still open, still accepted-risk, re-verified
  not exploitable this pass).
- `earnPoints`/`burnPoints` duplicate ~35 lines of auth/store-scoping logic
  verbatim (a past fix, "G-1", had to be hand-applied to both) — a shared-helper
  refactor across Base44 Deno functions is a larger, separate change.
- Dark mode CSS/Tailwind tokens and the `next-themes` dependency are fully
  wired but never activated (no `ThemeProvider`, nothing toggles the `dark`
  class) — flagged as dead weight or unfinished feature, a product decision
  either way, not touched here.
- ~20 pages using `useQuery` check `isLoading` but not `isError` (e.g.
  `Wallet.jsx`, `Offers.jsx` fall through to rendering with `undefined` data on
  a failed fetch) — real, but a broad sweep better scoped as its own change.
- Locale-inconsistent `.toLocaleString()` (~45 call sites, roughly half omit
  `'es-MX'`) and `PageNotFound.jsx`/`UserNotRegisteredError.jsx`'s
  English-only text + hand-rolled SVGs instead of `lucide-react` — cosmetic,
  deferred.

---

## [2.0.12] — 2026-08-10 — Points-dedup gap on earnPoints, dependency patches

Scheduled security/quality/tenant-isolation/loyalty-integrity audit.

### Security
- **MEDIUM — `earnPoints` had no reliable duplicate-request protection.**
  Unlike `burnPoints`/`redeemOffer` (which have required a client-generated
  `request_id` since v2.0.11), `earnPoints` only deduplicated on the
  operator-entered `ticket_id` — an optional POS field. When the cashier
  left it blank (a normal, supported flow), the entire idempotency check
  was skipped, so a double-tap or a client-side network retry on the same
  purchase created two separate `PointsLedger` `EARN` entries and credited
  the customer twice. Caught by an automated PR review (`chatgpt-codex-connector`)
  flagging that this release's audit notes overstated the existing
  guarantee. Fixed by mirroring the `burnPoints` pattern exactly: the POS
  now sends a `crypto.randomUUID()` `request_id` per earn attempt
  (`MerchantPOS.jsx`), `earnPoints` requires it and keys the idempotency
  check on it unconditionally; `ticket_id` remains a separate, optional
  business/display field on the ledger entry, no longer tied to dedup.
- **Dependency patches (transitive, no direct version pins changed).**
  `npm audit` reported 6 advisories (3 high, 3 moderate) in transitive
  dependencies; `npm audit fix` resolved 4 within existing semver ranges,
  verified with a clean `lint` / `build` / `validate:rls` afterward:
  - `brace-expansion` (HIGH — unbounded expansion DoS, dev-only via
    `eslint-plugin-react`/`tailwindcss`).
  - `dompurify` (MODERATE — `IN_PLACE` hook removal could leave a
    detached subtree executable, causing XSS; transitive via `jspdf`,
    used for admin-side CSV/PDF export, not for rendering untrusted HTML).
  - `nanoid` (HIGH — custom generator infinite loop on `size: 0`,
    build-tool-only via `postcss`).
  - `socket.io-parser` (HIGH — zero-attachment memory exhaustion,
    transitive via `@base44/sdk`'s realtime client).
- **Accepted risk — `react-router` / `react-router-dom` (2 MODERATE).**
  Two advisories affect the installed `6.30.4` (latest available `6.x`);
  the fix requires the `7.x` major, a breaking migration out of scope for
  an automated dependency patch. Verified not exploitable as currently
  used: (1) the SSR `deserializeErrors()` constructor-injection advisory
  does not apply — this is a Vite SPA with no server-side rendering; (2)
  the open-redirect advisory requires a `<Link to>` / `useNavigate` target
  built from untrusted input with a leading backslash — grepped the
  codebase for navigation targets derived from query params or
  `location.state` and found none; all routes are statically defined.
  Deferred: track the `react-router` v7 migration as separate,
  deliberately-scoped follow-up work, not a routine-audit fix.

### Audit coverage (no findings requiring a code change)
- **Tenant isolation:** diffed all 18 `base44/entities/*.jsonc` schemas
  against the deployed Base44 backend (`list_entity_schemas`) — zero
  drift in fields, `required`, or `rls` on any entity. Every
  business-scoped entity still carries the two-halves-correct
  `data.business_id` / `{{user.data.business_id}}` pattern and the
  service-role `admin` branch.
- **Loyalty/points integrity:** re-verified `earnPoints`, `burnPoints`,
  `redeemOffer` compute balances server-side only and stay tenant/store
  scoped for staff. All three now require a mandatory `request_id` for
  duplicate-request protection (`earnPoints` closed this release, see
  above). `createLoyaltyAccount` uses a different, equally-effective
  guard — one `LoyaltyAccount` per `user_id`, enforced server-side before
  create — so a retried onboarding call 409s with the existing account
  instead of creating a duplicate; it does not use `request_id`.
- **Wallet/pass:** `passkitWebService` HMAC-signs/verifies with
  `crypto.subtle` + timing-safe compare, all Apple certs/secrets read
  from env (`Deno.env.get`), never hardcoded; Google/Apple pass creation
  is per-caller-account only.
- **Payment/subscription:** Mercado Pago only (Stripe deps already
  removed in v2.0.11); no Stripe/webhook secrets present in the repo.
- **Code quality / CI:** `npm run lint`, `npm run build`,
  `npm run validate:rls` all pass; GitHub Actions CI green on `main` at
  the pre-audit HEAD (`1860687`).
- **Secrets scan:** no hardcoded API keys, tokens, or private-key
  material found in tracked source.
- **Permissions matrix / user manual:** reviewed against
  `src/lib/rbac.js` and current routes — already current for v2.0.11,
  no capability or role-default changes in this release.

---

## [2.0.11] — 2026-07-28 — Cross-tenant invitation leak, scheduled-function auth, points dedup hardening

### Security
- **CRITICAL — Cross-tenant read/write via unvalidated `Invitation.store_id`.**
  `Invitation.create` RLS only checks `business_id`, never that `store_id`
  belongs to it, and `acceptInvitation` stamped `inv.store_id` onto the
  accepting `User` record without verifying that either. Any authenticated
  user could self-service a `business_admin` role (`createBusiness` is
  open), then invite an alt account with `business_id: <own tenant>,
  store_id: <victim tenant's store>`. `AuditLog`, `LoyaltyAccount`,
  `PointsLedger`, and `Redemption` each grant a merchant-role RLS branch on
  `data.store_id` alone, with no `business_id` check in that branch — the
  resulting account, despite carrying the attacker's own `business_id`,
  satisfied those branches for the victim's store: read customer PII,
  balances, and redemption history; forge `current_balance`/`tier` directly
  via the client SDK (redeemable at the real merchant's POS — real
  financial loss); inject `PointsLedger` entries; mutate `Redemption`
  records. Full breach of tenant isolation, no server function required.
  Fixed at both layers: `acceptInvitation` now re-fetches the `Store`
  server-side and only trusts `inv.store_id` when its `business_id`
  actually matches `inv.business_id` (mirrors `manageTeamMember`'s existing
  pattern for the same assignment; fails closed — a mismatched pairing
  drops the store instead of applying it). Defense in depth: the four
  store-scoped merchant RLS branches now also require `data.business_id`
  to match, per the canonical business-scoped rule in `CLAUDE.md`.
  Additive-safe — the Invitation UI only ever offers stores already scoped
  to the inviting `business_admin`'s own tenant, so no legitimate existing
  pairing is narrowed, only the forged-invitation path is closed.
- **MEDIUM — `createLoyaltyAccount`'s unused `merchant` account-type branch
  trusted `business_id`/`business_name` from the client with no
  verification** (`Onboarding.jsx`, the only real caller, never sends it —
  confirmed dead code). Removed rather than patched: nothing calls it, and
  merchant/staff role assignment already has a sanctioned, verified path
  (`acceptInvitation` / `manageTeamMember`). The `customer` path's
  legacy-store fallback (for stores predating the multi-tenant migration)
  no longer falls back to a client-supplied business id/name either — a
  store without one just creates an account without one.
- **LOW — `createStore` resolves `business_name` for the admin
  cross-tenant-override path from the `Business` record server-side**
  instead of trusting `body.business_name` verbatim. Display-field
  integrity only — `business_id`, the real scoping field, was already
  admin-chosen.
- **Resolved #41 — scheduled-function auth model confirmed, dead admin gate
  removed from `cleanupInactiveUsers`.** Base44 invokes scheduled
  automations without an end-user session — confirmed directly in this
  repo's history: on 2026-06-29 `base44-builder[bot]` removed the identical
  `role !== 'admin'` check from `checkTrialExpiration`, `regenerateExpiredQR`,
  `sendWeeklySummary`, and `updateWalletPasses` after it 403'd in
  production, replacing it with "no user session; use service role
  directly." `cleanupInactiveUsers` was missed in that cleanup: its
  `auth.me()` call has returned `null` on every real scheduled run since
  v1.4.7, so the check 403'd immediately and the inactive-user win-back
  email has never sent. Fixed by removing the gate to match its four
  siblings. `docs/PERMISSIONS.md`'s "role gate" claim corrected for all
  five scheduled functions.

### Points integrity
- **MEDIUM — `request_id` made mandatory on `burnPoints` / `redeemOffer`.**
  The v2.0.10 dedup fix made it optional, so any caller that omitted it (a
  raw HTTP request, a future client bug) silently reverted to the
  unprotected pre-fix path. Both frontend callers already always send one;
  requiring it server-side closes the opt-in gap with no client change.
- **Residual, tracked — the dedup check itself is a non-atomic
  read-then-write** (`PointsLedger.filter` then `.create`), so two requests
  with the *same* `request_id` fired truly concurrently can still both pass
  the existence check before either commits. Base44's schema-as-code has no
  unique-index primitive to close this atomically. Same root cause as the
  already-tracked M-2 "client-side balance race" platform limitation
  (open since v1.4.5): every safety check here is necessarily non-atomic.
  Not fixed this cycle — a lock-emulation workaround would be genuinely
  novel, financial-transaction code, and unverifiable without integration
  access to the live Base44 backend (none available this session); shipping
  an unverified concurrency fix risks doing more harm than the narrow
  window it would close. Logged as **M-7** below alongside M-2.

### Dependencies
- Removed unused `@stripe/react-stripe-js` and `@stripe/stripe-js` — zero
  imports anywhere in the codebase (this app uses Mercado Pago exclusively;
  see `CLAUDE.md`). Pure dead weight and a stale audit surface.
- **New since v2.0.10 — react-router advisory `GHSA-337j-9hxr-rhxg`**
  (arbitrary constructor injection via `deserializeErrors()` in SSR
  hydration). Confirmed not reachable: this app only uses `<BrowserRouter>`/
  `<Routes>`, never `createBrowserRouter`/`RouterProvider` or any data-router/
  SSR API. Tracked alongside the existing deferred react-router open-redirect
  advisory (`GHSA-wrjc-x8rr-h8h6`) — both require the same v6→v7 major-version
  migration to fully resolve.
- The brace-expansion advisory remains confined to the lint/build toolchain
  (dev dependency, never shipped to the client bundle) — unchanged in shape.

### Known Open Items (carried + new)
| ID  | Severity | Description | Status |
|-----|----------|-------------|--------|
| M-2 | Medium   | Atomic server-side balance update — client-side balance calculation race window | Open — Base44 platform limitation |
| M-4 | Medium   | Merchants can transact for any active store | Open — by design (single-program model) |
| M-5 | Medium   | `updateWalletPasses/entry.ts` — Apple push requires PassKit device registry (not yet built) | Open — requires Wallet API work |
| M-6 | Low      | External QR image service receives user token; consider self-hosted generation | Open |
| M-7 | Medium   | `burnPoints`/`redeemOffer` dedup check is a non-atomic read-then-write; identical concurrent `request_id`s can still double-process | Open — Base44 platform limitation (same root cause as M-2) |

### Verified (no code change required)
- `npm run lint`, `npm run build`, `npm run validate:rls`, and `npm run
  check:secrets` all pass.
- Re-verified `earnPoints`/`burnPoints`/`redeemOffer` balance handling:
  balances are always read server-side and written as a server-computed
  delta; the client never supplies a balance, rate, or point cost.
  Single-request over-redemption is correctly blocked.
- Wallet-pass code (`updateWalletPasses`, `createGoogleWalletPass`,
  `createAppleWalletPass`, `passkitWebService`): secrets never logged or
  returned in a response; all four fail closed (or honestly report
  unconfigured) when certs/keys are absent; `passkitWebService`'s HMAC
  compare is constant-time.
- `.github/workflows/ci.yml` still runs lint → validate:rls → check:secrets
  → build as required steps on every PR.

---

## [2.0.10] — 2026-07-27 — Tenant-isolation and points-integrity hardening

### Security
- **HIGH — Tenant self-reassignment via forged store payload in `createLoyaltyAccount`.**
  The customer-onboarding function trusted `business_id`/`store_id` from the
  client-supplied `store` object when stamping both the new `LoyaltyAccount` and
  the caller's own `User` record (service-role writes, which bypass RLS). An
  authenticated user could call the function directly with a forged store object
  — a real store id paired with a spoofed `business_id` — landing their own
  `User.business_id`/`storeId` in an arbitrary tenant and gaining that tenant's
  RLS-matched read access. Fixed: the store is now always re-fetched server-side
  before use, and tenant fields are derived only from the verified record —
  mirroring the pattern already used by `earnPoints`/`burnPoints`.

### Points integrity
- **HIGH — No duplicate-request protection on `burnPoints` / `redeemOffer`.**
  Unlike `earnPoints` (which dedupes on a client-supplied ticket id), `burnPoints`
  generated a fresh random idempotency key on every call, and `redeemOffer` keyed
  its ledger entry off a freshly-created record id — neither could recognize a
  retried or replayed request, so a network retry or a replayed capture could
  deduct points twice for a single physical redemption. Fixed: both functions now
  accept an optional client-generated request id; when present, the server checks
  for a prior ledger entry with the same derived key before deducting and returns
  the original result instead of double-charging. The point-of-sale screen and the
  customer offer-redemption screen now send a fresh id per action.

### Deferred — owner input needed
- **MEDIUM — Scheduled wallet-pass sync has no role check, unlike three of its
  sibling scheduled functions assume, and unlike this project's own permissions
  matrix documents.** Fixing it is only safe if scheduled invocations carry an
  authenticated admin session; if they don't, adding the check would silently
  break the wallet balance sync for every tenant. Not verifiable from the
  repository alone this cycle (no platform console access) — left unchanged
  pending the owner's confirmation of how scheduled invocations authenticate. See
  the pull request description for the exact question and both possible fixes.

### Dependencies
- Applied non-breaking `npm audit fix` (transitive bumps within existing semver
  ranges). One remaining advisory needs a major-version route migration to fully
  resolve; confirmed not currently exploitable in this app (no user-controlled
  value ever reaches a navigation target) and tracked as a deferred hardening
  item. A second remaining advisory is inside the lint toolchain only (a
  development dependency, never shipped to the client bundle).

### Verified (no code change required)
- `npm run lint`, `npm run build`, `npm run validate:rls`, and `npm run
  check:secrets` all pass.
- Re-read `earnPoints`, `createBusiness`, `createStore`, `acceptInvitation`,
  `manageTeamMember`: all correctly re-derive tenant/store context from
  server-side lookups; none trust a client-supplied role or tenant id.
- Re-verified the admin-bridge HMAC request verification (constant-time compare,
  signature covers the full request payload, replay window enforced).
- No hardcoded secrets found beyond what `npm run check:secrets` already covers.

---

## [2.0.9] — 2026-07-20 — Release-hygiene audit: sync release metadata, verify prior fix is live

### Process
- **LOW — Release metadata desync.** The 2026-07-08 fix (cross-tenant catalog
  leak on `Offer`/`Store`/`Campaign`, tenant-stamping on `redeemOffer` writes,
  and a role gate on `LicenseEvent` reads) merged to `main` without a matching
  `CHANGELOG.md` entry, `docs/PERMISSIONS.md`/`docs/USER_MANUAL.md` version
  bump, or `package.json` version bump, leaving release metadata out of sync
  with `main` for two weeks. This entry backfills the record.

### Verified (no code change required)
- Re-inspected the **deployed** Base44 entity schemas for `Offer`, `Store`,
  `Campaign`, and `LicenseEvent` directly against the live backend: the
  tenant-scoped `read` RLS from the 2026-07-08 fix is deployed and active in
  production (the original commit had flagged the deploy as not yet done —
  it has since been completed).
- Re-inspected the deployed `redeemOffer` function source: the
  `business_id`/`business_name` tenant-stamping on `Redemption`/`PointsLedger`
  writes from the same fix is live in production.
- `npm run build`, `npm run lint`, `npm run validate:rls`, and
  `npm run check:secrets` all pass on `main` with no findings.
- Reviewed `earnPoints`/`burnPoints`/`redeemOffer` for points-integrity: balance
  is always read and written server-side under the service role, never trusted
  from the client; `earnPoints` is idempotent on (store, account, ticket);
  `burnPoints` relies on the POS mutation's in-flight guard (no client-side
  auto-retry configured) rather than a server-side idempotency key — tracked
  as a hardening opportunity, not a reproducible bug under the current client.
- Reviewed Apple/Google Wallet pass generation: fails closed (HTTP 501) when
  wallet certificates/keys are not configured, keeps pass payloads minimal,
  and signs device registration tokens with HMAC — no secrets committed to
  the repo (`npm run check:secrets` confirms).
- No Stripe/payment code paths exist in `base44/functions` or `src`; the
  `@stripe/*` packages in `package.json` are unused dependencies, not an
  active payment flow — payment/subscription audit section is not applicable.
- `docs/PERMISSIONS.md` capability matrix cross-checked against
  `src/lib/rbac.js` (`PERMISSIONS`, `PAGE_ACCESS`): owner is the only implicit
  all-`true` tier, all other roles require an explicit allow-list entry per
  capability (safe-by-default), and matrix contents match code.

---

## [2.0.8] — 2026-07-06 — Cross-tenant offer-redemption isolation guard

### Security
- **MEDIUM — Cross-tenant offer redemption.** `redeemOffer` loaded the customer's
  loyalty account and the requested offer both via the service role, but did not
  verify that both records belonged to the same tenant. An authenticated customer
  who knew an offer ID from another business could call `redeemOffer` with that
  foreign offer ID — the cost would be deducted from their own account and a
  confirmation code generated for the other tenant's reward. Fixed: `redeemOffer`
  now rejects with HTTP 403 (`"Offer does not belong to your program"`) when
  `account.business_id` and `offer.business_id` are both populated and differ.

### Notes
- No entity schema changes. No RLS changes.
- **Deploy action required:** redeploy the `redeemOffer` serverless function to
  Base44 for the fix to take effect in production. The repo change alone is not
  sufficient — the running function must be updated.

---

## [2.0.7] — 2026-06-29 — Privilege-escalation & admin-bridge hardening

### Security
- **CRITICAL — User self-promotion (privilege escalation).** Onboarding assigned
  the caller's `role`/`business_id` from the browser via `auth.updateMe`, and the
  `User` entity had **no write protection** — so any authenticated user could call
  `auth.updateMe({ role: 'admin' })` and become the cross-tenant platform owner.
  Fixed in two layers:
  - Role/tenant assignment now happens **server-side with the service role** in
    `createBusiness`, `createLoyaltyAccount`, the new `acceptInvitation`, and the
    new `manageTeamMember`. The clients (`Onboarding.jsx`, `BusinessUsers.jsx`)
    no longer set `role`/`business_id`/`store_*` themselves; they call these
    functions and refresh the session. An invitation can grant `business_admin`
    or `merchant` only — never `admin`.
  - `User.jsonc` now carries **field-level write RLS** locking `role`, `app_role`,
    `business_id`, `business_name`, `storeId`, `store_id`, `store_name`, and
    `merchant_role` to service-role (`admin`) writes.
- **HIGH/MEDIUM — `acaciaControl` input hardening.** Added a finite-`ts` check
  (a non-numeric `ts` previously slipped past the freshness window), `action`/
  `params` type guards, and email-envelope validation in `emails.sendFollowup`
  (single, CR/LF-free recipient + header-safe subject + string body) to prevent
  header injection / recipient fan-out. The HMAC signing format is unchanged, so
  the Mission Control contract is preserved.

### ⚠️ Deployment order (required)
Deploy the **functions first** (`createBusiness`, `createLoyaltyAccount`,
`acceptInvitation`, `manageTeamMember`, `acaciaControl`), then deploy the
**`User` schema** field-RLS. If the lock lands before the functions set roles
server-side, Base44 silently drops the disallowed writes and new onboarding /
team changes no-op. The `User` field-RLS is **not** deployed by this change — it
must be applied via `update_entity_schema` after the functions are live.

### Note
- Fully closing the `acaciaControl` non-canonical-signing concern requires a
  matching change in the Mission Control repo (`api/_lib/ingestSign.js`), which is
  outside this repository; only backward-compatible hardening was applied here.

---

## [2.0.6] — 2026-06-29 — Loyalty-integrity hardening (POS earn/burn server-side)

### Security
- **MEDIUM (G-2) — Merchant POS balance moved server-side.** `MerchantPOS` used to
  read the customer's `current_balance`, compute the new balance in the browser,
  and write both the `PointsLedger` entry and `LoyaltyAccount.current_balance`
  directly — a tampered client could post any balance. Two new service-role
  functions, `earnPoints` and `burnPoints`, now own the points formula, the
  balance read, and the balance write; the client only sends store, account, and
  amount/points. Mirrors the existing `redeemOffer` pattern.
- **MEDIUM (G-1) — Staff pinned to their assigned store.** `earnPoints` /
  `burnPoints` reject any operation a `merchant` attempts on a store other than
  the one assigned to them (`store_id` / `storeId`); `admin` and `business_admin`
  may operate any store in the business. The POS store selector also hides
  unassigned stores for staff.

### Notes
- The new functions must be **deployed** to the Base44 backend before the POS
  earn/burn actions work; there is intentionally **no client-side fallback** (a
  fallback would re-open the forgeable-balance hole). Until deployed, the POS
  shows a clear error instead of writing a balance.

### Documentation
- Permissions matrix updated to v2.0.6: added `earnPoints` / `burnPoints` to the
  serverless functions table, documented staff store pinning under Point of sale,
  and updated the balance-writes note to cover all four server functions.

---

## [2.0.5] — 2026-06-29 — Security audit & documentation catch-up

### Fixed
- **MEDIUM — `createStore` function crash for platform owner.** The `body` variable
  was referenced before its `const body = await req.json()` declaration, placing it
  in the Temporal Dead Zone and causing a `ReferenceError` whenever an admin
  attempted to create a store for a specific tenant. Body is now parsed before the
  business-ID resolution logic.
- **LOW — `ChatConversation.create` RLS missing admin branch.** The `create` rule
  was `{ "data.user_id": "{{user.id}}" }` with no `admin` branch, preventing
  service-role functions from creating chat conversations on behalf of users. Added
  `$or` with `{"user_condition":{"role":"admin"}}` (additive — does not narrow
  any existing customer access).

### Documentation
- **User Manual updated to v2.0.5.** Complete rewrite covering the v2.0.x
  multi-tenant architecture: onboarding paths (register / join / invitation),
  persistent session / "Continue As" screen, business admin back-office
  (Settings, Users, Billing, Support), platform owner console, Apple Wallet
  auto-update behavior, license plans, team management, and updated permissions table.
- **Permissions matrix updated to v2.0.5.** Added missing serverless function
  entries: `createStore`, `getAppContext`, and `acaciaControl` with auth model
  and purpose for each.

### Known open items (carried)
| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| G-1 | Medium | Staff can transact for any store in their tenant (not pinned to one store) | Open — by design |
| G-2 | Medium | Merchant POS earn/burn balance still calculated client-side | Partially resolved (customer redemption atomic server-side) |

---

## [2.0.4] — 2026-06-24 — Hardening & polish pass

A systematic quality audit across every page (4 parallel reviewers + shared shell),
fixing the classes of defects that a real click-through surfaces.

### Security / correctness
- **Unique store codes, server-side.** Store codes are now generated and
  guaranteed globally unique by the backend (`createStore` function +
  `createBusiness`); the client never sets them. The code field is read-only and
  immutable once assigned (customers join by it). Onboarding shows the assigned
  code on a success screen with copy.
- **Cross-tenant leak fixed (AdminCampaigns).** The "notify customers" actions
  loaded `NotificationPreference.list()` unscoped — a business admin could email
  **every tenant's** customers. Now scoped by `business_id`.
- **POS records carry tenancy.** Merchant POS earn/burn now stamp
  `business_id`/`business_name` on `PointsLedger` + `AuditLog`, so they appear in
  the tenant admin's business-scoped views.
- **Owner-adjust mis-stamp fixed (AdminCustomers).** Manual point adjustments now
  derive `business_id` from the target account (was `user.business_id`, undefined
  when the owner adjusts another tenant's customer).

### Reliability
- **Render stability.** Hoisted components that were declared inside render
  bodies (`PlatformLicenses` Row/Portfolio; the onboarding shell; `Layout` nav) to
  module scope — eliminating remount/focus-loss (root cause of the earlier
  "registration resets on every keystroke").
- **react-query v5:** standardized all `invalidateQueries(['key'])` (array form,
  which over-invalidates every query) to the scoped `{ queryKey: [...] }` object form.
- NaN/undefined guards across points, balances, tiers, dates, and number inputs;
  empty/loading states added where lists rendered blank; previously-silent mutation
  failures now show error toasts; Profile notification toggle reverts on failure;
  Chat quick-action `setTimeout` race removed.

### UX / a11y
- Confirmation dialogs for destructive/lifecycle actions (store delete; tenant
  view-only/suspend/archive; invite revoke). Buttons disable while pending.
- License gating: invite/save blocked when a tenant is view-only/suspended; seat
  limit enforced.
- Accessibility: labels/`aria-label` on icon-only buttons, search inputs, switches,
  and dialog titles; dead "change password" button wired to feedback.

---

## [2.0.2] — 2026-06-24 — Apple Wallet update service (G-7 follow-through)

Completes the Apple side of wallet balance updates that v2.0.1 scoped out.

### Added
- **`passkitWebService` function** — implements Apple's PassKit Web Service:
  device register / unregister, list-updatable-passes (`passesUpdatedSince`),
  and serve-latest-pass. Authenticates each request by recomputing the pass
  `authenticationToken = HMAC_SHA256(secret, serial)` (no per-account secret
  stored). Runs as service role since the caller is an Apple device, not a
  logged-in user.
- **`WalletRegistration` entity** (service-role-only RLS, deployed live) — the
  device registry backing the web service.
- **Token-based APNs push in `updateWalletPasses`** — mints an ES256 (.p8) APNs
  JWT and sends the background push that makes registered devices pull the latest
  pass; deactivates registrations APNs reports as expired (`410`). Works over
  Deno's HTTP/2 fetch without client-cert mTLS.
- **`createAppleWalletPass`** now advertises `webServiceURL` +
  `authenticationToken` when `APPLE_WALLET_WEB_SERVICE_URL` is set, so passes can
  be registered and refreshed. When unset, behavior is unchanged.

### Configuration
New optional Base44 function env vars (see `.env.example`):
`APPLE_WALLET_WEB_SERVICE_URL`, `APPLE_WALLET_AUTH_SECRET`, `APPLE_APNS_KEY_P8`,
`APPLE_APNS_KEY_ID`. With pass certs only (no web-service URL), passes still
generate as before. Adding the web-service URL enables manual refresh; adding the
APNs key enables automatic push.

### Notes
- Verified by `validate:rls` (17 entities) + `lint` + `build`. End-to-end device
  registration / APNs delivery still requires real Apple credentials + a deployed
  function URL to exercise — not runnable from CI/sandbox.
- Functions deploy to the Base44 functions environment on push (Builder sync);
  `WalletRegistration` RLS is already live.

---

## [2.0.1] — 2026-06-24 — Tenant-create hardening + wallet balance-push

### Security
- **CRITICAL — `Business.create` locked to platform admins.** The Base44 RLS
  scanner flagged `Business` with an open `create: {}` rule (any authenticated
  user could create tenants). `create` is now `{"user_condition":{"role":"admin"}}`
  (deployed live). Self-serve business onboarding moves to a new **service-role
  function `createBusiness`**, which provisions the `Business` + first `Store` +
  owner `LoyaltyAccount` + `trial_started` `LicenseEvent` with server-enforced safe
  values, then the client promotes the user via `auth.updateMe`. This also fixes a
  latent bug: under tenant RLS a brand-new user could not create the first `Store`
  client-side (not yet `business_admin`) — that now happens server-side.

### Fixed
- **G-7 — `updateWalletPasses` now performs a real Google Wallet balance push.**
  Replaces the placeholder log loop with an OAuth2 service-account token exchange
  and a `PATCH` of each user's `loyaltyObject` points via the Google Wallet REST
  API (passes not yet saved by the user → 404 → skipped). The function reports
  `{updated, absent, errors}` instead of pretending success.
  - **Apple Wallet** balance push remains **not implemented** and is now reported
    honestly (`push_supported: false`) rather than logged as updated. A real Apple
    push needs a PassKit web service (device register/unregister endpoints + an
    APNs push signed with the Pass Type ID cert) and a device registry — tracked as
    a follow-up.

### Notes
- Wallet code was verified by production build + a preview-server boot smoke (app
  and JS bundle serve cleanly); authenticated QR-refresh / pass-generation /
  balance-push flows require live Base44 + Apple/Google Wallet credentials to
  exercise end-to-end.
- `createBusiness` and `updateWalletPasses` deploy to the Base44 functions
  environment on push (Builder sync). The `Business.create` RLS change is already
  live; the brief window until the function syncs only affects new business
  onboarding (existing tenants unaffected).

---

## [2.0.0] — 2026-06-24 — Multi-tenant SaaS

Puntos+ becomes a **multi-tenant, multi-user SaaS**: one platform owner (ACACIA)
licenses many independent businesses, each running its own loyalty program. This
is a major release; the live Base44 schema was migrated **additively** (no existing
RLS branch removed — see `docs/RUNBOOK-multitenant.md`).

### Added — platform & tenancy
- **`Business` (tenant) entity** with license plan, billing lifecycle
  (`trial → active → view_only → suspended → archived`), seat/store limits,
  trial/license dates, invite code, and branding.
- **Owner control plane** (`PlatformDashboard`, `PlatformTenants`,
  `PlatformLicenses`, `PlatformSupport`): tenant CRUD + lifecycle, license
  activation/renewal, revenue (MRR/ARR) estimate, and a full support console.
- **Tenant back-office** (`BusinessSettings`, `BusinessUsers`, `BusinessBilling`,
  `BusinessSupport`): business profile + branding, team/user management with
  invites and seat limits, plan/usage view with upgrade requests, and two-sided
  support ticket follow-up with satisfaction rating.
- **License plan catalog** (`src/lib/licensePlans.js`): Starter / Growth / Pro /
  Enterprise with hard limits and feature flags; `LicenseEvent` audit trail of all
  billing changes.
- **Support desk**: `SupportTicket` + `SupportTicketMessage` (threaded), with
  owner-only **internal notes** enforced by RLS.
- **Team invitations** (`Invitation`) and **per-tenant permission overrides**
  (`PermissionProfile`).
- **In-app permissions matrix** (`/Permissions`) rendered from the code-backed
  capability map.

### Added — foundation
- **RBAC** (`src/lib/rbac.js`): four roles (owner / business_admin / staff /
  customer), a canonical `PERMISSIONS` matrix, `can()`, and `PAGE_ACCESS` guards.
- **Tenant context** (`src/lib/useTenant.js`) deriving license posture + UI banners
  and a `canWrite` flag for view-only/suspended tenants.
- **`useCurrentUser` / `useRequirePage`** shared hooks for consistent page guards.
- **RLS static guard** `npm run validate:rls` (`scripts/validate-rls.mjs`) — fails
  CI on invalid entity/user RLS paths and warns on missing service-role branches.
- **Schema-as-code**: all 16 entities now committed under `base44/entities/*.jsonc`
  (the repo previously had none).

### Changed
- **Tenant isolation** added to `LoyaltyAccount`, `PointsLedger`, `Store`,
  `Campaign`, `Offer`, `Redemption`, `AuditLog`, `ChatConversation`,
  `NotificationPreference` via `business_id` + role-gated `$or` RLS branches
  (owner/service-role branch preserved on every operation). Field-level RLS on
  `LoyaltyAccount` financial fields now also allows `business_admin`.
- Existing admin pages (`AdminDashboard/Stores/Campaigns/Customers/Audit`) are now
  multi-tenant: usable by both the owner (sees all) and a business admin (scoped to
  their `business_id`); new records are stamped with tenancy.
- `createLoyaltyAccount` now stamps `business_id` from the store/owner context.
- **Onboarding** rebuilt into three paths: register a business (30-day trial),
  join as a customer by store code, or accept a team invitation.
- **Design system**: distinctive Puntos+ identity — refined violet brand with a
  gold "puntos" accent, Space Grotesk display + Inter body, a back-office sidebar
  shell, and a shared back-office UI kit. New `index.html` metadata/fonts.

### Security
- Multi-tenant RLS migration follows the documented two-halves rules; additive-only
  deploy guarantees no live access regression. New back-office routes are gated
  both client-side (`PAGE_ACCESS`) and at the data layer (RLS).

### Known open items (carried)
| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| G-1 | Medium | Staff can transact for any store in their tenant (not pinned to one store) | Open — by design |
| G-2 | Medium | Merchant POS earn/burn still client-side balance | Partially resolved (customer redemption atomic server-side) |
| G-7 | Medium | `updateWalletPasses` stub | Open — requires Wallet API integration |

---

## [1.4.7] — 2026-06-22

### Security

- **HIGH ×3 / MODERATE / LOW — Dependency vulnerabilities resolved.** `npm audit fix` resolved 5 new vulnerabilities in `ws` (GHSA-96hv-2xvq-fx4p: memory exhaustion DoS via tiny WebSocket fragments) and its dependant `engine.io-client`. Affected the `form-data` transitive chain. All are client/browser-transport libraries and do not affect the deployed server runtime, but could affect build-time tooling. `npm audit` now reports **0 vulnerabilities**.

- **LOW — Internal error messages no longer returned to callers from `createLoyaltyAccount`, `regenerateExpiredQR`, and `checkTrialExpiration` functions.** Three serverless functions returned raw `error.message` strings (or a `details` field containing `error.message`) in their HTTP 500 error responses. This was inconsistent with the G-10 fix applied to the wallet functions in v1.4.6. All three functions now return fixed generic error messages; full details continue to be logged server-side via `console.error`.
  - `createLoyaltyAccount/entry.ts` — removed `details: error.message` from 500 response
  - `regenerateExpiredQR/entry.ts` — replaced `error: error.message` with fixed string
  - `checkTrialExpiration/entry.ts` — removed `details: error.message` from 500 response

### Known Open Items (carried)
| ID  | Severity | Description | Status |
|-----|----------|-------------|--------|
| G-1 | Medium   | Merchants can see and transact for any active store (not restricted to their own) | Open — by design (single-program model), documented |
| G-2 | Medium   | Client-side balance calculation race condition for concurrent POS earn/burn | Partially resolved (v1.4.5) — customer redemption now atomic server-side; merchant POS still client-side |
| G-7 | Medium   | `updateWalletPasses/entry.ts` is a stub — wallet push updates not yet implemented | Open — requires Google/Apple Wallet API integration |

---

## [1.4.6] — 2026-06-15

### Security
- **LOW — Wallet function error details no longer returned to client.** `createGoogleWalletPass` and `createAppleWalletPass` previously returned `error.message` in the JSON response body, which could leak internal credential or JWT error details to the browser. Both functions now return a fixed generic message (`'Failed to generate … pass'`); full error details are still logged server-side.
- **LOW — `objectId` removed from Google Wallet API response.** The response from `createGoogleWalletPass` previously included `objectId`, which was composed of `GOOGLE_WALLET_ISSUER_ID` and the internal `account.id`. The client does not need this field (only the `url` is required), so it has been removed to avoid exposing the internal record identifier.

### Fixed
- **MEDIUM — `redeemOffer` now propagates `store_id` to `Redemption` and `PointsLedger` records.** Offer redemptions performed by customers via the `redeemOffer` serverless function were creating `Redemption` and `PointsLedger` records without a `store_id`. The merchant-scoped RLS rule on both entities uses `store_id` to filter results, so those records were invisible to the merchant. Both records now carry `store_id` from the customer's `LoyaltyAccount`, matching the existing RLS expectation.

### Known Open Items (carried)
| ID  | Severity | Description | Status |
|-----|----------|-------------|--------|
| H-1 | High     | `esbuild` 0.17–0.28 supply-chain CVE (GHSA-gv7w-rqvm-qjhr) — affects build toolchain only (not deployed runtime). Fix requires upgrading to vite@8 (breaking change). Risk is low in the controlled GitHub Actions CI environment; no registry interception capability. Upgrade to vite@8 should be evaluated when the Base44 vite plugin confirms compatibility. | Open — deferred, upgrade needed |
| G-1 | Medium   | Merchants can see and transact for any active store (not restricted to their own) | Open — by design (single-program model), documented |
| G-2 | Medium   | Client-side balance calculation race condition for concurrent POS earn/burn | Partially resolved (v1.4.5) — customer redemption now atomic server-side; merchant POS still client-side |
| G-7 | Medium   | `updateWalletPasses/entry.ts` is a stub — wallet push updates not yet implemented | Open — requires Google/Apple Wallet API integration |

---

## [1.4.5] — 2026-06-08

### Security
- **CRITICAL — LoyaltyAccount financial fields hardened against tampering.** The `update` RLS rule let a normal user (`role: user`) update their own record, including `current_balance`, `lifetime_earned`/`lifetime_redeemed`, `tier`, `status`, `subscription_*` and `trial_*`. Because point balances were written client-side, a customer could set their own balance arbitrarily. Added **field-level RLS** (`rls.write`) to those fields plus `user_id`/`user_email`/`store_*`, restricting writes to `admin` or `merchant` (service-role backend bypasses RLS). Reads are unchanged, so customers still see their own balance.

### Changed
- **Customer offer redemption moved server-side.** New `redeemOffer` serverless function (service role) re-reads the account balance and offer server-side, validates funds/stock, and writes the `Redemption`, `PointsLedger` (BURN) and balance deduction atomically. `Offers.jsx` now calls the function instead of writing the balance from the browser. (Also addresses the deferred M-2 client-side balance race for redemptions.)
- **Onboarding account creation moved server-side.** New `createLoyaltyAccount` serverless function (service role) creates the `LoyaltyAccount` during customer and merchant onboarding with server-enforced safe values (balance always 0) and a one-account-per-user guard. Required because the new field-level RLS blocks normal/role-less users from writing those fields directly. `Onboarding.jsx` now calls the function for both flows.

### Notes
- Merchant POS (earn/burn) is unchanged — merchants satisfy the new field-write rule and keep writing balances at the POS.
- Both new functions must be deployed to the Base44 functions environment for redemption and onboarding to work.
- **Deploy ordering:** the field-level RLS is a manual Base44 schema step that must be applied **after** the functions are live — see `docs/RUNBOOK-loyaltyaccount-rls.md`. Applying it before deploy would break live onboarding/redemption. The live schema currently has no field-level RLS until the runbook is executed.

---

## [1.4.4] — 2026-06-08

### Security
- **Removed hardcoded email fallbacks** — The v1.4.3 env-var change kept the historical address (`... || 'jose.herrera@acaciaco.com.mx'`) as a fallback, which still embedded the address in source and was flagged by the secret scanner. The literal is now gone entirely from `checkTrialExpiration/entry.ts` and `Onboarding.jsx`. The recipient comes only from `ADMIN_NOTIFICATION_EMAIL` / `VITE_ADMIN_NOTIFICATION_EMAIL`; when unset, the admin notification (and the server-side support-contact line) is skipped while the surrounding flow (onboarding, trial lifecycle) still completes.

### Changed
- `.env.example` updated to mark the notification email as required and document the skip-when-unset behavior.

Resolves the actionable open items carried since v1.4.0.

### Security
- **M-8 / G-6 resolved** — Removed the unused `react-quill` dependency (and its transitive `quill` package), eliminating the deferred XSS advisory in the admin editor. The package was declared in `package.json` but never imported anywhere in the source, so removal is a clean fix with no behavior change. `npm audit` now reports **0 vulnerabilities** (was 2 moderate).
- **M-1 / G-5 resolved** — Moved the hardcoded admin notification email out of source. `checkTrialExpiration/entry.ts` now reads `ADMIN_NOTIFICATION_EMAIL` (Deno env) and `Onboarding.jsx` reads `VITE_ADMIN_NOTIFICATION_EMAIL` (Vite env), both falling back to the previous default so existing deployments are unaffected. Documented in `.env.example`.
- **M-3 / G-3 resolved** — Replaced `Date.now()`-based idempotency keys with a cryptographically secure suffix via the new `makeIdempotencyKey()`/`randomId()` helpers in `src/lib/utils.js`. Distinct EARN/BURN/ADJUST operations can no longer collide within the same millisecond. Real idempotency is preserved where a stable token exists (POS ticket id for EARN, redemption id for offer BURN).

### Added
- **M-7 resolved** — Added a GitHub Actions CI workflow (`.github/workflows/ci.yml`) that runs lint and build on every push to `main` and on all pull requests.
- `.env.example` documenting the required and optional environment variables.

### Changed
- Idempotency-key generation centralized in `src/lib/utils.js` and applied in `MerchantPOS.jsx` (EARN/BURN), `Offers.jsx` (BURN), and `AdminCustomers.jsx` (ADJUST).

### Known Open Items (carried)
| ID  | Severity | Description | Status |
|-----|----------|-------------|--------|
| M-2 | Medium   | Atomic server-side balance update — client-side balance calculation race window | Open — Base44 platform limitation |
| M-4 | Medium   | Merchants can transact for any active store | Open — by design (single-program model) |
| M-5 | Medium   | `updateWalletPasses/entry.ts` is a stub — wallet push updates not yet implemented | Open — requires Google/Apple Wallet API integration + credentials |
| M-6 | Low      | External QR image service receives user token; consider self-hosted generation | Open |

---

## [1.4.2] — 2026-06-08

### Security
- **CRITICAL FIX** — Replaced `Math.random()` with `crypto.getRandomValues()` in `regenerateExpiredQR/entry.ts`. The scheduled function that auto-regenerates expired QR tokens for all accounts was still using a cryptographically weak random source, allowing token prediction. Now uses the same cryptographically secure method as the client-side QR refresh in `Wallet.jsx` and `Onboarding.jsx`.
- **CRITICAL DEP FIX** — Updated `jspdf` from `4.0.0` to `4.2.1`, resolving CVE GHSA-pqxr-3g65-p328 (PDF Injection in AcroFormChoiceField — arbitrary JavaScript execution) and GHSA-95fx-jjr5-f39c (DoS via unvalidated BMP dimensions).
- **HIGH/MODERATE DEP FIXES** — Applied `npm audit fix` to resolve 24 additional vulnerabilities across transitive dependencies (react-router, axios, brace-expansion, js-yaml, yaml, ws, and others).

### Dependencies
- `jspdf` pinned to `^4.2.1` (was `^4.0.0`).
- 24 total dependency vulnerabilities resolved via `npm audit fix`.

### Known Open Items (carried from v1.4.0)
| ID  | Severity | Description |
|-----|----------|-------------|
| M-1 | Medium   | Move hardcoded admin notification email to environment variable |
| M-2 | Medium   | Atomic server-side balance update — client-side balance calculation race condition window |
| M-3 | Medium   | BURN idempotency uses `Date.now()`; rapid duplicate burn calls possible |
| M-4 | Medium   | Merchants can process transactions for any active store, not restricted to their own |
| M-5 | Medium   | `updateWalletPasses/entry.ts` is a stub — wallet push updates not yet implemented |
| M-6 | Low      | External QR image service (`api.qrserver.com`) receives user token; consider self-hosted generation |
| M-7 | Low      | No CI/CD pipeline configured |
| M-8 | Medium   | `react-quill`/`quill` XSS in admin editor — fix requires breaking change; admin-only risk |

---

## [1.4.1] — 2026-06-04

### Security
- **CRITICAL FIX** — Completed Row-Level Security (RLS) `read` rules for the `AuditLog` and `Redemption` entities. Both entities previously lacked merchant-scoped read access.
  - `AuditLog` read: admins read all records; users read their own (`actor_id`) or records that target them (`target_user_id`); merchants read records for their store (`store_id`).
  - `Redemption` read: admins read all redemptions; users read their own (`user_id`); merchants read redemptions for their store (`store_id`).

### Documentation
- Updated `docs/PERMISSIONS.md` entity-access matrix to reflect the new `AuditLog` and `Redemption` read policies.

---

## [1.4.0] — 2026-06-02

### Security
- **CRITICAL FIX** — Replaced `Math.random()` with `crypto.getRandomValues()` for QR token generation in `Wallet.jsx` and `Onboarding.jsx`. Predictable tokens could allow unauthorized account access.
- **HIGH FIX** — Removed `error.stack` from API error responses in `createGoogleWalletPass` and `createAppleWalletPass`. Stack traces are now logged server-side only.
- **MEDIUM FIX** — Removed internal `account.id` from QR code payload in `QRWallet.jsx`. Only the rotating token is now embedded in the QR barcode.

### Code Quality
- Fixed 30+ unused import lint errors across `OfferCard`, `TransactionItem`, `AdminAudit`, `AdminCampaigns`, `AdminCustomers`, `AdminDashboard`, `AdminStores`, `Chat`, `History`, `Home`, and `MerchantPOS`.
- All lint errors cleared. Build passes cleanly.

### Documentation
- Added `docs/USER_MANUAL.md` — end-user, merchant, and admin guide.
- Added `docs/PERMISSIONS.md` — RBAC matrix covering all entities and serverless functions.
- Updated `CHANGELOG.md`.

### Known Open Items (not in this release)
| ID  | Severity | Description |
|-----|----------|-------------|
| M-1 | Medium   | Move hardcoded admin email (`jose.herrera@acaciaco.com.mx`) to environment variable in `checkTrialExpiration` and `Onboarding` |
| M-2 | Medium   | Atomic server-side balance update — client-side balance calculation has a race condition window |
| M-3 | Medium   | BURN transactions lack a time-window idempotency key; rapid duplicate burn calls are possible |
| M-4 | Medium   | All merchants can see and process transactions for any active store, not just their own |
| M-5 | Medium   | `updateWalletPasses/entry.ts` is a stub — actual Google/Apple Wallet push update not yet implemented |
| M-6 | Low      | External QR image service (`api.qrserver.com`) receives user token; consider self-hosted QR generation |
| M-7 | Low      | No CI/CD pipeline — GitHub Actions not configured |
| M-8 | Low      | Browserslist and baseline-browser-mapping packages are outdated |

---

## [1.3.0] — 2026-06-01

### Security
- Replaced `Math.random()` with `crypto.getRandomValues()` in `regenerateExpiredQR/entry.ts`.
- Removed `error.stack` from Google Wallet and Apple Wallet API error responses (backend functions).
- Fixed AuditLog write permissions for merchant role.

### Documentation
- Added `CHANGELOG.md`, `docs/USER_MANUAL.md`, `docs/PERMISSIONS.md`, `docs/SECURITY_AUDIT.md`.

### Other
- Bumped `package.json` version from `0.0.0` to `1.3.0`.

> Note: PR #1 (branch `claude/epic-bardeen-vP88u`) was created for this release but never merged.
> Release 1.4.0 supersedes and includes all 1.3.0 fixes applied to the main branch.

---

## [1.2.0] — 2026-05-15

### Features
- Apple Wallet pass generation (`createAppleWalletPass`).
- Google Wallet pass generation (`createGoogleWalletPass`).
- QR token auto-refresh every 5 minutes in `QRWallet` component.
- Weekly summary emails via `sendWeeklySummary` scheduled function.
- Inactive user re-engagement emails via `cleanupInactiveUsers`.

---

## [1.1.0] — 2026-05-01

### Features
- Trial lifecycle management: 30-day trial, 7-day grace period, automatic suspension via `checkTrialExpiration`.
- `TrialBanner` and `WelcomeTrialDialog` components for merchant trial UX.
- `SuspendedAccountModal` for suspended merchant accounts.
- Merchant onboarding flow with store creation and trial account initialization.
- Customer onboarding with store code verification.

---

## [1.0.0] — 2026-04-01

### Initial Release
- Loyalty program core: points earn (EARN), redeem (BURN), manual adjust (ADJUST).
- Idempotency keys on EARN transactions.
- Admin dashboard with metrics, charts, and tier distribution.
- Admin audit log for all point-impacting actions.
- Admin store management (create, edit, delete stores with points rate config).
- Admin campaign and offer management with email notification.
- Merchant POS: customer lookup by email/QR, earn and burn flows.
- Customer wallet: QR code display, balance, transaction history.
- AI-powered offer recommendations via LLM integration.
- Notification preferences with campaign/offer email opt-in.
- Tier system: Bronze, Silver, Gold, Platinum.
