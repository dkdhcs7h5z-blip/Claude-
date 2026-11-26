import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Card, PageHeader, Spinner } from '@/components/ui';
import { AuditTable } from './AuditTable';

export function AuditLogPage() {
  const { t } = useTranslation();
  const { activeClinicId, user } = useAuth();
  const q = useQuery({ queryKey: ['audit', user?.id, activeClinicId], queryFn: () => api.listAudit({ clinicId: activeClinicId, limit: 200 }) });
  return (
    <div>
      <PageHeader title={t('audit.title')} subtitle={t('audit.subtitle')} />
      <Card bodyClassName="p-0">{q.isLoading ? <Spinner /> : <AuditTable events={q.data ?? []} />}</Card>
    </div>
  );
}
