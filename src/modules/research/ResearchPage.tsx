import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FlaskConical, ShieldCheck } from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { formatDate, profileName } from '@/lib/format';
import { useLang, useProfiles } from '@/lib/queries';

export function ResearchPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { user } = useAuth();
  const { byId } = useProfiles();
  const q = useQuery({ queryKey: ['research', user?.id], queryFn: () => api.listResearchProjects() });
  return (
    <div className="space-y-6">
      <PageHeader title={t('research.title')} subtitle={t('research.subtitle')} />
      <Alert tone="info" title={<span className="inline-flex items-center gap-1"><ShieldCheck className="h-4 w-4" />De-identification</span>}>
        {t('research.notice')}
      </Alert>
      <Card title={t('research.projects')} bodyClassName="p-0">
        {q.isLoading ? <Spinner /> : !q.data?.length ? <EmptyState icon={<FlaskConical className="h-10 w-10" />} title={t('research.none')} /> : (
          <ul className="divide-y divide-slate-100">
            {q.data.map((r) => (
              <li key={r.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-slate-800">{r.title}</p>
                  <div className="flex gap-1">
                    {r.specialty && <Badge tone="brand">{t(`specialty.${r.specialty}`)}</Badge>}
                    <Badge tone={r.status === 'active' ? 'green' : 'slate'}>{t(`research.status.${r.status}`)}</Badge>
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {t('research.pi')}: {profileName(byId.get(r.principal_investigator_id), lang)}
                  {r.irb_reference && <> · {t('research.irb')}: <span className="ltr-num">{r.irb_reference}</span> ({formatDate(r.irb_approved_at, lang)} → {formatDate(r.irb_expires_at, lang)})</>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
