import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Minus } from 'lucide-react';
import { Card, PageHeader } from '@/components/ui';
import { PERMISSIONS, ROLES, ROLE_PERMISSIONS } from '@/rbac/permissions';

export function RolesPage() {
  const { t } = useTranslation();
  const groups = [...new Set(PERMISSIONS.map((p) => p.split('.')[0]))];
  return (
    <div>
      <PageHeader title={t('admin.rolesTitle')} subtitle={t('admin.rolesSubtitle')} />
      <Card bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-th sticky start-0 bg-slate-50">&nbsp;</th>
                {ROLES.map((r) => <th key={r} className="table-th whitespace-nowrap text-center">{t(`roles.${r}`)}</th>)}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g}>
                  <tr className="bg-slate-50/60">
                    <td colSpan={ROLES.length + 1} className="px-4 py-1.5 text-xs font-semibold text-brand-800">{t(`permissionGroups.${g}`)}</td>
                  </tr>
                  {PERMISSIONS.filter((p) => p.startsWith(`${g}.`)).map((p) => (
                    <tr key={p} className="border-t border-slate-100">
                      <td className="sticky start-0 whitespace-nowrap bg-white px-4 py-2 text-slate-700">{t(`permissions.${p}`)}
                        <span className="ms-2 font-mono text-[10px] text-slate-400">{p}</span></td>
                      {ROLES.map((r) => (
                        <td key={r} className="px-4 py-2 text-center">
                          {ROLE_PERMISSIONS[r].includes(p)
                            ? <Check className="mx-auto h-4 w-4 text-emerald-600" aria-label="yes" />
                            : <Minus className="mx-auto h-4 w-4 text-slate-200" aria-label="no" />}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
