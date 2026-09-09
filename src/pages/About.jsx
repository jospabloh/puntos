import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { APP_VERSION, RELEASE_DATE, CHANGELOG } from '@/lib/appConfig';
import { manualForRole, searchManual } from '@/lib/manual';
import { getAppRole } from '@/lib/rbac';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BookOpen, LifeBuoy, Mail, Search, Sparkles, Tag } from 'lucide-react';

/**
 * Acerca de — módulo 21 del estándar ACACIA.
 *
 * Cuatro cosas en una sola pantalla, y la razón de que sean UNA:
 *
 *  1. El manual de usuario, buscable y por área (`src/lib/manual.js`). Es lo
 *     que convierte un ticket en algo que la persona resuelve sola.
 *  2. Las novedades de esta versión, leídas del MISMO arreglo `CHANGELOG` que
 *     el módulo 6 ya genera — no una segunda lista que alguien tenga que
 *     acordarse de actualizar también.
 *  3. La versión, sin ambigüedad: el número de aquí, el de `package.json` y
 *     el del pie de Perfil son la misma línea.
 *  4. A quién se le pregunta, y de quién es esta app.
 *
 * Ninguna de las cuatro es de Mission Control: quien pregunta "¿cómo uso
 * esto?" no debería tener que enterarse de que Mission Control existe.
 */

const SUPPORT_FALLBACK = 'soporte@acaciaco.com.mx';

export default function About() {
  const { data: user } = useCurrentUser();
  const [query, setQuery] = useState('');
  const [showAllVersions, setShowAllVersions] = useState(false);

  const role = getAppRole(user);
  const sections = useMemo(() => manualForRole(role), [role]);
  const results = useMemo(() => searchManual(sections, query), [sections, query]);
  const hits = results.reduce((n, s) => n + s.entries.length, 0);

  const supportEmail = user?.support_email || SUPPORT_FALLBACK;
  const latest = CHANGELOG[0];
  // La pantalla de soporte del inquilino sólo existe para quien administra un
  // negocio; un cliente llega a soporte por el chat de ayuda.
  const supportPage = role === 'business_admin' || role === 'owner' ? 'BusinessSupport' : 'Chat';

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Acerca de Puntos+</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Cómo se usa, qué cambió y a quién preguntarle.
          </p>
        </header>

        {/* ── Novedades de esta versión ─────────────────────────────────── */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100">
                <Tag className="h-5 w-5 text-violet-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-slate-900 dark:text-slate-50">
                    Novedades v{APP_VERSION}
                  </p>
                  <Badge variant="secondary">{RELEASE_DATE}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {latest?.resumen || latest?.summary}
                </p>

                <button
                  type="button"
                  onClick={() => setShowAllVersions((v) => !v)}
                  className="mt-3 text-sm font-medium text-violet-600 hover:underline"
                >
                  {showAllVersions ? 'Ocultar historial' : 'Ver historial de versiones'}
                </button>

                {showAllVersions && (
                  <ul className="mt-3 space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                    {CHANGELOG.slice(1).map((entry) => (
                      <li key={entry.version}>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          v{entry.version} <span className="font-normal text-slate-400 dark:text-slate-500">· {entry.date}</span>
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          {entry.resumen || entry.summary}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Manual de usuario ─────────────────────────────────────────── */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100">
                <BookOpen className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-50">Manual de usuario</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Lo que se puede hacer desde tu cuenta, en lenguaje llano.
                </p>
              </div>
            </div>

            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar: puntos, QR, tienda, equipo…"
                className="pl-9"
                aria-label="Buscar en el manual"
              />
            </div>

            {query && (
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                {hits === 0
                  ? 'Sin resultados. Prueba con otra palabra, o escríbenos abajo.'
                  : `${hits} resultado${hits === 1 ? '' : 's'}`}
              </p>
            )}

            {results.map((section) => (
              <div key={section.id} className="mb-2">
                <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                  {section.title}
                </p>
                <Accordion type="single" collapsible className="w-full">
                  {section.entries.map((entry) => (
                    <AccordionItem key={entry.q} value={entry.q}>
                      <AccordionTrigger className="text-left text-sm">{entry.q}</AccordionTrigger>
                      <AccordionContent className="text-sm text-slate-600 dark:text-slate-300">
                        {entry.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── Contacto ──────────────────────────────────────────────────── */}
        <Card className="mb-6">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-100">
                <LifeBuoy className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-50">¿Necesitas ayuda?</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Si el manual no lo resuelve, escríbenos — contesta una persona.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Link to={createPageUrl(supportPage)} className="flex-1">
                <Button className="w-full">
                  <LifeBuoy className="mr-2 h-4 w-4" /> Abrir soporte en la app
                </Button>
              </Link>
              <a href={`mailto:${supportEmail}`} className="flex-1">
                <Button variant="outline" className="w-full">
                  <Mail className="mr-2 h-4 w-4" /> {supportEmail}
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>

        {/* ── La línea que dice de quién es esta app ─────────────────────── */}
        <div className="pb-8 text-center">
          <div className="mb-2 flex items-center justify-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-pink-500 shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="gradient-text text-sm font-semibold">Puntos+</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Hecho con ♥ para los negocios que premian a quien vuelve.
          </p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            © 2026 ACACIA Consultoría en Informática y Cómputo. Todos los Derechos Reservados.
          </p>
          <p className="mt-1 text-xs text-slate-300 dark:text-slate-600">
            Versión {APP_VERSION} · {RELEASE_DATE}
          </p>
        </div>
      </div>
    </div>
  );
}
