import { useDeferredValue, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Lock, Plus, Search, Users } from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Badge, Button, EmptyState, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { SPECIALTIES, type Specialty } from '@/data/types';
import { SPECIALTY_TONE } from '@/modules/registry';
import { clinicName, formatDate, patientName } from '@/lib/format';
import { useClinics, useLang } from '@/lib/queries';
import { ageInYears } from '@/clinical/obstetrics';

export function PatientsListPage({ specialty: fixedSpecialty }: { specialty?: Specialty } = {}) {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const { activeClinicId, can, user } = useAuth();
  const clinics = useClinics();
  const [search, setSearch] = useState('');
  const [specialty, setSpecialty] = useState<Specialty | 'all'>(fixedSpecialty ?? 'all');
  const deferred = useDeferredValue(search);

  const q = useQuery({
    queryKey: ['patients', user?.id, activeClinicId, deferred, specialty],
    queryFn: () => api.listPatients({ search: deferred, specialty, clinicId: activeClinicId }),
    placeholderData: (prev) => prev,
  });
  const clinicById = new Map((clinics.data ?? []).map((c) => [c.id, c]));

  return (
    <div>
      {!fixedSpecialty && (
        <PageHeader
          title={t('patients.title')}
          actions={can('patient.create') && (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/patients/new')}>{t('patients.new')}</Button>
          )}
        />
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-3 sm:flex-row sm:p-4">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('patients.searchPlaceholder')}
              className="ps-9" aria-label={t('common.search')} />
          </div>
          {!fixedSpecialty && (
            <Select value={specialty} onChange={(e) => setSpecialty(e.target.value as Specialty | 'all')} className="sm:w-56">
              <option value="all">{t('common.all')}</option>
              {SPECIALTIES.map((s) => <option key={s} value={s}>{t(`specialty.${s}`)}</option>)}
            </Select>
          )}
        </div>

        {q.isLoading ? <Spinner /> : !q.data?.length ? (
          <EmptyState icon={<Users className="h-10 w-10" />} title={t('patients.none')} />
        ) : (
          <>
            {/* Mobile: cards */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {q.data.map((p) => (
                <li key={p.id}>
                  <Link to={`/patients/${p.id}`} className="block px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-slate-800">{patientName(p, lang)}</p>
                      {p.visibility === 'private' && <Lock className="h-4 w-4 text-amber-600" />}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      <span className="ltr-num">{p.mrn}</span> · {t('patients.years', { count: ageInYears(p.date_of_birth) })}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.specialties.map((s) => <Badge key={s} tone={SPECIALTY_TONE[s]}>{t(`specialty.${s}`)}</Badge>)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {/* Desktop: table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="table-th">{t('patients.mrn')}</th>
                    <th className="table-th">{t('patients.name')}</th>
                    <th className="table-th">{t('patients.age')}</th>
                    <th className="table-th">{t('patients.specialties')}</th>
                    <th className="table-th">{t('common.clinic')}</th>
                    <th className="table-th">{t('patients.visibility')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {q.data.map((p) => (
                    <tr key={p.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/patients/${p.id}`)}>
                      <td className="table-td font-mono text-xs"><span className="ltr-num">{p.mrn}</span></td>
                      <td className="table-td">
                        <Link to={`/patients/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700" onClick={(e) => e.stopPropagation()}>
                          {patientName(p, lang)}
                        </Link>
                        <p className="text-xs text-slate-500">{formatDate(p.date_of_birth, lang)}</p>
                      </td>
                      <td className="table-td tabular-nums">{ageInYears(p.date_of_birth)}</td>
                      <td className="table-td">
                        <div className="flex flex-wrap gap-1">
                          {p.specialties.map((s) => <Badge key={s} tone={SPECIALTY_TONE[s]}>{t(`specialty.${s}`)}</Badge>)}
                        </div>
                      </td>
                      <td className="table-td text-xs">{clinicName(clinicById.get(p.clinic_id), lang)}</td>
                      <td className="table-td">
                        {p.visibility === 'private'
                          ? <Badge tone="amber" icon={<Lock className="h-3 w-3" />}>{t('patients.private')}</Badge>
                          : <Badge>{t('patients.shared')}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
