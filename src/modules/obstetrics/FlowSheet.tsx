import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Lock, Pencil, PenLine } from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import type { AntenatalVisitRow, Pregnancy } from '@/data/types';
import { formatGADays } from '@/clinical/obstetrics';
import { visitAlerts } from '@/clinical/obstetricRisk';
import { formatDate, profileName } from '@/lib/format';
import { useLang, useProfiles } from '@/lib/queries';
import { AlertCountBadge } from './AlertList';

export function FlowSheet({ pregnancy, visits, canWrite, onEdit, onNew }: {
  pregnancy: Pregnancy; visits: AntenatalVisitRow[]; canWrite: boolean;
  onEdit: (v: AntenatalVisitRow) => void; onNew?: () => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const { can, user } = useAuth();
  const { byId } = useProfiles();
  const sign = useMutation({
    mutationFn: (encounterId: string) => api.signEncounter(encounterId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pregnancy', pregnancy.id] }),
  });
  const dash = <span className="text-slate-300">—</span>;
  const rows = [...visits].reverse();
  const statusTone = { draft: 'amber', signed: 'green', amended: 'slate' } as const;

  return (
    <Card title={t('ob.visit.flowSheet')} bodyClassName="p-0"
      actions={onNew && <Button size="sm" icon={<PenLine className="h-3.5 w-3.5" />} onClick={onNew}>{t('ob.visit.new')}</Button>}>
      {sign.error && <p className="px-4 py-2 text-sm text-red-700">{(sign.error as Error).message}</p>}
      {!rows.length ? <EmptyState title={t('ob.visit.noVisits')} /> : (
        <div className="relative overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-th">{t('common.date')}</th>
                <th className="table-th">{t('ob.visit.ga')}</th>
                <th className="table-th">{t('ob.visit.bp')}</th>
                <th className="table-th">{t('ob.visit.weight')}</th>
                <th className="table-th">{t('ob.visit.urineProtein')}</th>
                <th className="table-th">{t('ob.visit.urineGlucose')}</th>
                <th className="table-th">{t('ob.visit.sfh')}</th>
                <th className="table-th">{t('ob.visit.fhr')}</th>
                <th className="table-th">{t('ob.visit.movements')}</th>
                <th className="table-th">{t('ob.visit.hb')}</th>
                <th className="table-th">{t('ob.nextVisit')}</th>
                <th className="table-th">{t('ob.alerts.title')}</th>
                <th className="table-th">{t('common.status')}</th>
                <th className="table-th"><span className="sr-only">{t('common.actions')}</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((v) => {
                const alerts = visitAlerts(v, v.ga_days, pregnancy.plurality);
                const e = v.encounter;
                const editable = canWrite && e.status === 'draft' && (!e.is_private || e.provider_id === user?.id);
                const signable = e.status === 'draft' && can('clinical.sign', v.clinic_id);
                return (
                  <tr key={v.id} className="align-top">
                    <td className="table-td whitespace-nowrap">
                      {formatDate(v.visit_date, lang)}
                      <p className="text-[11px] text-slate-400">{profileName(byId.get(e.provider_id), lang)}</p>
                    </td>
                    <td className="table-td ltr-num whitespace-nowrap font-medium tabular-nums">{formatGADays(v.ga_days)}</td>
                    <td className="table-td ltr-num whitespace-nowrap tabular-nums">{v.bp_systolic != null ? `${v.bp_systolic}/${v.bp_diastolic}` : dash}</td>
                    <td className="table-td tabular-nums">{v.weight_kg ?? dash}</td>
                    <td className="table-td">{v.urine_protein ? t(`ob.dipV.${v.urine_protein}`) : dash}</td>
                    <td className="table-td">{v.urine_glucose ? t(`ob.dipV.${v.urine_glucose}`) : dash}</td>
                    <td className="table-td tabular-nums">{v.fundal_height_cm ?? dash}</td>
                    <td className="table-td ltr-num whitespace-nowrap tabular-nums">{v.fhr_by_fetus?.length ? v.fhr_by_fetus.join(' / ') : v.fetal_heart_rate ?? dash}</td>
                    <td className="table-td">{v.fetal_movements ? t(`ob.movementsV.${v.fetal_movements}`) : dash}</td>
                    <td className="table-td tabular-nums">{v.hemoglobin_g_dl ?? dash}</td>
                    <td className="table-td whitespace-nowrap">{v.next_visit_date ? formatDate(v.next_visit_date, lang) : dash}</td>
                    <td className="table-td"><AlertCountBadge alerts={alerts} /></td>
                    <td className="table-td">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={statusTone[e.status]}>{t(`ob.visit.${e.status}`)}</Badge>
                        {e.is_private && <Badge tone="amber" icon={<Lock className="h-3 w-3" />}>{t('patients.private')}</Badge>}
                      </div>
                    </td>
                    <td className="table-td whitespace-nowrap">
                      <div className="flex gap-1">
                        {editable && <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => onEdit(v)} aria-label={t('common.edit')} />}
                        {signable && (
                          <Button size="sm" variant="secondary" loading={sign.isPending && sign.variables === e.id}
                            onClick={() => confirm(t('ob.visit.signConfirm')) && sign.mutate(e.id)}>{t('ob.visit.sign')}</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
