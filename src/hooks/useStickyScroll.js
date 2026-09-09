import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Módulo 23 del estándar ACACIA — la cromática de navegación sobrevive a una
 * recarga.
 *
 * Una recarga completa NO es un evento raro en esta app: el cambio de negocio
 * del módulo 18 dispara `window.location.reload()` a propósito (para limpiar
 * el estado del inquilino anterior en vez de intentar resetearlo en sitio), y
 * un refresco de licencia o un F5 hacen lo mismo. El trabajo de esa recarga es
 * resetear los DATOS, nunca la navegación que la persona no pidió resetear —
 * son dos "empezar de cero" distintos.
 *
 * El elemento activo del menú ya se deriva de la ruta en cada render
 * (`currentPageName` viene del `<Route>` en App.jsx), así que sale correcto
 * desde el primer frame sin ayuda. Lo que NO es derivable de la ruta es dónde
 * había dejado la persona el scroll dentro de un menú largo, y eso es lo que
 * guarda este hook.
 *
 * `sessionStorage` y no `localStorage`: sobrevive a una recarga, que es lo que
 * se pide, sin filtrarse a otras pestañas ni a otros dispositivos — el scroll
 * de una barra lateral no es una preferencia de la cuenta.
 *
 * La restauración va en `useLayoutEffect` para que ocurra antes de pintar: con
 * `useEffect` se vería un frame en la posición por defecto antes de saltar.
 */
export function useStickyScroll(key) {
  const ref = useRef(null);
  const frameRef = useRef(0);

  const setNode = useCallback((node) => { ref.current = node; }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    try {
      const saved = Number(sessionStorage.getItem(key));
      if (Number.isFinite(saved) && saved > 0) el.scrollTop = saved;
    } catch { /* modo privado: sin memoria, pero sin romper nada */ }

    const onScroll = () => {
      // El scroll dispara muchísimo; una escritura por frame es de sobra.
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        try { sessionStorage.setItem(key, String(el.scrollTop)); } catch { /* idem */ }
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [key]);

  return setNode;
}
