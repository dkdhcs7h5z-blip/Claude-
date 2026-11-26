import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import type { AuditEvent } from '@/data/types';
import { Badge, EmptyState, type Tone } from '@/components/ui';
import { formatDateTime, profileName } from '@/lib/format';
import { useLang, useProfiles } from '@/lib/queries';

const actionTone: Partial<Record<AuditEvent['action'], Tone>> = {
  INSERT: 'green', UPDATE: 'blue', DELETE: 'red', VIEW: 'slate', DOWNLOAD: 'violet', EXPORT: 'violet',
  EMERGENCY_ACCESS: 'red', RESEARCH_QUERY: 'teal', SIGN_IN: 'slate', SIGN_OUT: 'slate',
};

export function AuditTable({ events, showPatient = true }: { events: AuditEvent[]; showPatient?: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { byId } = useProfiles();
  if (!events.length) return <EmptyState icon={<ScrollText className="h-10 w-10" />} title={t('audit.none')} />;
  return (
    <div className="relative overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-100">
        <thead className="bg-slate-50">
          <tr>
            <th className="table-th">{t('audit.when')}</th>
            <th className="table-th">{t('audit.actor')}</th>
            <th className="table-th">{t('audit.action')}</th>
            <th className="table-th">{t('audit.object')}</th>
            <th className="table-th">{t('audit.fields')}</th>
            {showPatient && <th className="table-th">{t('audit.patient')}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {events.map((e) => (
            <tr key={e.id}>
              <td className="table-td whitespace-nowrap text-xs">{formatDateTime(e.occurred_at, lang)}</td>
              <td className="table-td whitespace-nowrap">{e.actor_id ? profileName(byId.get(e.actor_id), lang) : t('audit.system')}</td>
              <td className="table-td"><Badge tone={actionTone[e.action] ?? 'slate'}>{t(`audit.actions.${e.action}`)}</Badge></td>
              <td className="table-td font-mono text-xs">{e.table_name ?? '—'}</td>
              <td className="table-td text-xs text-slate-500">{e.changed_fields?.join(', ') || '—'}</td>
              {showPatient && (
                <td className="table-td text-xs">
                  {e.patient_id ? <Link className="text-brand-700 hover:underline" to={`/patients/${e.patient_id}`}>{t('common.view')}</Link> : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
