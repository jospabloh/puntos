import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Check, Minus, Info } from 'lucide-react';
import { toast } from 'sonner';
import {
  PERMISSIONS,
  PERMISSION_MODULES,
  ROLES,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
} from '@/lib/rbac';
import { useRequirePage } from '@/lib/useCurrentUser';
import {
  PageShell,
  PageHeader,
  SectionCard,
  EmptyState,
  PageLoader,
} from '@/components/backoffice/Kit';
import { Switch } from '@/components/ui/switch';

/* The four roles, in display order, with their accent colors. */
const ROLE_COLUMNS = [
  { key: ROLES.OWNER, accent: 'amber' },
  { key: ROLES.BUSINESS_ADMIN, accent: 'violet' },
  { key: ROLES.STAFF, accent: 'sky' },
  { key: ROLES.CUSTOMER, accent: 'slate' },
];

const ROLE_CARD_TONES = {
  amber: 'border-amber-200 bg-amber-50/60',
  violet: 'border-violet-200 bg-violet-50/60',
  sky: 'border-sky-200 bg-sky-50/60',
  slate: 'border-slate-200 bg-slate-50/60',
};

const ROLE_DOT_TONES = {
  amber: 'bg-amber-400',
  violet: 'bg-violet-500',
  sky: 'bg-sky-500',
  slate: 'bg-slate-400',
};

const ROLE_HEAD_TONES = {
  amber: 'text-amber-700',
  violet: 'text-violet-700',
  sky: 'text-sky-700',
  slate: 'text-slate-600',
};

/* Human-readable labels for the action half of a '<module>:<action>' key. */
const ACTION_LABELS = {
  view: 'Ver',
  create: 'Crear',
  update: 'Editar',
  delete: 'Eliminar',
  manage: 'Gestionar',
  suspend: 'Suspender',
  assign: 'Asignar',
  activate: 'Activar',
  invite: 'Invitar',
  adjust_points: 'Ajustar puntos',
  export: 'Exportar',
  earn: 'Acumular',
  burn: 'Canjear',
  redeem: 'Canjear',
  access: 'Acceder',
  reply_all: 'Responder',
  internal_note: 'Nota interna',
  impersonate: 'Suplantar',
  request_upgrade: 'Solicitar mejora',
  view_console: 'Ver consola',
  view_billing: 'Ver facturación',
  update_settings: 'Editar ajustes',
  create_ticket: 'Crear ticket',
  view_own_tickets: 'Ver propios',
  reply_own: 'Responder propios',
  view_own: 'Ver propio',
  generate_pass: 'Generar pase',
  edit_own: 'Editar propio',
  use: 'Usar',
  update_role: 'Editar rol',
  remove: 'Quitar',
};

function titleCase(raw) {
  return raw
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function actionLabel(action) {
  return ACTION_LABELS[action] || titleCase(action);
}

/* Default (code-level) allow check for a capability key + role. Owner always. */
function defaultAllows(permissionKey, roleKey) {
  if (roleKey === ROLES.OWNER) return true;
  const allowed = PERMISSIONS[permissionKey];
  return Array.isArray(allowed) && allowed.includes(roleKey);
}

export default function Permissions() {
  const { user, role, ready } = useRequirePage('Permissions');
  const queryClient = useQueryClient();

  const isBusinessAdmin = role === ROLES.BUSINESS_ADMIN;
  const canEdit = isBusinessAdmin; // business_admin edits staff/customer overrides

  // Per-tenant permission overrides (business_admin only — owner uses defaults).
  const { data: profiles } = useQuery({
    queryKey: ['permissionProfiles', user?.business_id],
    queryFn: () =>
      base44.entities.PermissionProfile.filter({ business_id: user.business_id }),
    enabled: !!user && isBusinessAdmin && !!user.business_id,
  });

  // Map role_key -> permissions override object.
  const overridesByRole = useMemo(() => {
    const map = {};
    (profiles || []).forEach((p) => {
      if (p.role_key) map[p.role_key] = p.permissions || {};
    });
    return map;
  }, [profiles]);

  const upsertMutation = useMutation({
    mutationFn: async ({ roleKey, permissionKey, value }) => {
      const existing = (profiles || []).find((p) => p.role_key === roleKey);
      const nextPermissions = { ...(existing?.permissions || {}), [permissionKey]: value };
      if (existing) {
        return base44.entities.PermissionProfile.update(existing.id, {
          permissions: nextPermissions,
          updated_by: user.email,
        });
      }
      return base44.entities.PermissionProfile.create({
        business_id: user.business_id,
        role_key: roleKey,
        label: ROLE_LABELS[roleKey],
        permissions: nextPermissions,
        updated_by: user.email,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['permissionProfiles']);
      toast.success('Permiso actualizado');
    },
    onError: () => {
      toast.error('No se pudo actualizar el permiso');
    },
  });

  // Resolve the effective allow for a cell, honoring per-tenant overrides.
  const cellAllows = (permissionKey, roleKey) => {
    if (roleKey === ROLES.OWNER) return true;
    const override = overridesByRole[roleKey];
    if (override && Object.prototype.hasOwnProperty.call(override, permissionKey)) {
      return Boolean(override[permissionKey]);
    }
    return defaultAllows(permissionKey, roleKey);
  };

  // A role column is editable (for business_admin) only for staff/customer rows.
  const isEditableColumn = (roleKey) =>
    roleKey === ROLES.STAFF || roleKey === ROLES.CUSTOMER;

  if (!ready) return <PageLoader />;

  // Group permission keys by module.
  const moduleGroups = PERMISSION_MODULES.map((module) => ({
    module,
    keys: Object.keys(PERMISSIONS).filter((k) => k.split(':')[0] === module.key),
  })).filter((g) => g.keys.length > 0);

  return (
    <PageShell>
      <PageHeader
        icon={ShieldCheck}
        eyebrow="Seguridad"
        title="Matriz de permisos"
        description="Capacidades por rol en Puntos+. El dueño de plataforma tiene acceso total; el resto se ajusta por capacidad."
        accent="violet"
      />

      {/* Role legend */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ROLE_COLUMNS.map(({ key, accent }) => (
          <div
            key={key}
            className={`rounded-2xl border p-4 ${ROLE_CARD_TONES[accent]}`}
          >
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${ROLE_DOT_TONES[accent]}`} />
              <span className="font-display text-sm font-semibold text-slate-900">
                {ROLE_LABELS[key]}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              {ROLE_DESCRIPTIONS[key]}
            </p>
          </div>
        ))}
      </div>

      {canEdit && (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-violet-200 bg-violet-50/60 p-4 text-sm text-violet-800">
          <Info className="mt-0.5 h-4.5 w-4.5 shrink-0 text-violet-500" />
          <p>
            Como administrador del negocio puedes ajustar los permisos de tu equipo y
            clientes. Los cambios se guardan por negocio (PermissionProfile) y solo
            aplican a los roles <strong>Equipo</strong> y <strong>Cliente</strong>. Las
            capacidades del dueño de plataforma no se pueden modificar.
          </p>
        </div>
      )}
      {!canEdit && role !== ROLES.OWNER && (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <Info className="mt-0.5 h-4.5 w-4.5 shrink-0 text-slate-400" />
          <p>
            Esta es una vista de solo lectura de las capacidades por rol. La edición de
            permisos está disponible para el administrador del negocio.
          </p>
        </div>
      )}

      {moduleGroups.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Sin capacidades"
          description="No hay capacidades definidas en la matriz de permisos."
        />
      ) : (
        <div className="space-y-5">
          {moduleGroups.map(({ module, keys }) => (
            <SectionCard key={module.key} title={module.label} bodyClassName="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                        Capacidad
                      </th>
                      {ROLE_COLUMNS.map(({ key, accent }) => (
                        <th
                          key={key}
                          className={`px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide ${ROLE_HEAD_TONES[accent]}`}
                        >
                          {ROLE_LABELS[key]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((permissionKey) => {
                      const action = permissionKey.split(':')[1] || permissionKey;
                      return (
                        <tr
                          key={permissionKey}
                          className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60"
                        >
                          <td className="px-5 py-3">
                            <div className="font-medium text-slate-800">
                              {actionLabel(action)}
                            </div>
                            <div className="font-mono text-[11px] text-slate-400">
                              {permissionKey}
                            </div>
                          </td>
                          {ROLE_COLUMNS.map(({ key: roleKey }) => {
                            const allowed = cellAllows(permissionKey, roleKey);
                            const editableHere =
                              canEdit && isEditableColumn(roleKey);
                            return (
                              <td key={roleKey} className="px-3 py-3 text-center">
                                {editableHere ? (
                                  <div className="flex justify-center">
                                    <Switch
                                      checked={allowed}
                                      disabled={upsertMutation.isPending}
                                      onCheckedChange={(value) =>
                                        upsertMutation.mutate({
                                          roleKey,
                                          permissionKey,
                                          value,
                                        })
                                      }
                                      aria-label={`${actionLabel(action)} para ${ROLE_LABELS[roleKey]}`}
                                    />
                                  </div>
                                ) : allowed ? (
                                  <Check className="mx-auto h-4 w-4 text-emerald-500" />
                                ) : (
                                  <Minus className="mx-auto h-4 w-4 text-slate-300" />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          ))}
        </div>
      )}
    </PageShell>
  );
}
