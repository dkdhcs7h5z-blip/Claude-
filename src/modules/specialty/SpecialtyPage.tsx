import { useTranslation } from 'react-i18next';
import { CheckCircle2, Clock } from 'lucide-react';
import type { Specialty } from '@/data/types';
import { NAV_ITEMS } from '@/modules/registry';
import { Badge, Card, PageHeader } from '@/components/ui';
import { PatientsListPage } from '@/modules/patients/PatientsListPage';
import { useAuth } from '@/auth/AuthProvider';

/**
 * Generic specialty module shell. Each specialty gets its own detailed
 * workflows in Phase 2 by replacing/extending this page in its own folder.
 */
export function SpecialtyPage({ specialty }: { specialty: Specialty }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const nav = NAV_ITEMS.find((n) => n.specialty === specialty)!;
  const features = t(`modules.features.${specialty}`, { returnObjects: true }) as string[];
  return (
    <div className="space-y-6">
      <PageHeader title={t(`specialty.${specialty}`)}
        icon={<Badge tone={nav.tone}><nav.icon className="h-6 w-6" /></Badge>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('modules.patientsInModule')}</h2>
          {can('patient.read') && <PatientsListPage specialty={specialty} />}
        </div>
        <Card title={<span className="flex items-center gap-2"><Clock className="h-4 w-4 text-slate-400" />{t('modules.phase2')}</span>}>
          <p className="mb-3 text-sm text-slate-500">{t('modules.phase2Help')}</p>
          <ul className="space-y-2">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />{f}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
