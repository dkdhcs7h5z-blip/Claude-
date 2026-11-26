import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Alert, Button, Card, Checkbox, Field, Input, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { SPECIALTIES, type PatientInput, type Specialty } from '@/data/types';
import { clinicName } from '@/lib/format';
import { useLang } from '@/lib/queries';
import { patientCan } from '@/rbac/access';

const empty = (clinicId: string): PatientInput => ({
  clinic_id: clinicId, mrn: '', first_name_en: '', last_name_en: '', first_name_ar: '', last_name_ar: '',
  date_of_birth: '', national_id: '', phone: '', email: '', address: '', nationality: '', marital_status: null,
  blood_group: null, rh_factor: null, emergency_contact_name: '', emergency_contact_phone: '', specialties: [],
  visibility: 'clinic', primary_physician_id: null, research_consent: false, research_consent_at: null, notes: '',
});

/** Empty strings → null so the database stores real NULLs. */
function normalize(v: PatientInput): PatientInput {
  const out = { ...v } as Record<string, unknown>;
  for (const [k, val] of Object.entries(out)) if (typeof val === 'string' && val.trim() === '') out[k] = null;
  return out as unknown as PatientInput;
}

function generateMrn(code: string): string {
  return `${code}-${String(Date.now()).slice(-6)}`;
}

export function PatientFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { access, activeClinicId, user, can } = useAuth();

  const creatable = (access?.memberships ?? []).filter((m) => access?.is_super_admin || m.permissions.includes('patient.create'));
  const defaultClinic = creatable.find((m) => m.clinic_id === activeClinicId)?.clinic_id ?? creatable[0]?.clinic_id ?? '';

  const existing = useQuery({ queryKey: ['patient', id], queryFn: () => api.getPatient(id!), enabled: editing });
  const [form, setForm] = useState<PatientInput>(() => empty(defaultClinic));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing.data) {
      const { id: _i, created_at: _c, updated_at: _u, deleted_at: _d, created_by: _b, ...rest } = existing.data;
      setForm({ ...empty(rest.clinic_id), ...rest });
    }
  }, [existing.data]);

  useEffect(() => {
    if (!editing && !form.mrn && form.clinic_id) {
      const code = creatable.find((m) => m.clinic_id === form.clinic_id)?.clinic_code ?? 'MRN';
      setForm((f) => ({ ...f, mrn: generateMrn(code) }));
    }
  }, [editing, form.clinic_id, form.mrn, creatable]);

  const set = <K extends keyof PatientInput>(k: K, v: PatientInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const canShare = editing && existing.data
    ? patientCan(access, existing.data, [], 'patient.share') || existing.data.primary_physician_id === user?.id
    : true;

  const save = useMutation({
    mutationFn: async () => {
      const v = normalize(form);
      if (v.visibility === 'private' && !v.primary_physician_id) v.primary_physician_id = user!.id;
      if (v.research_consent && !v.research_consent_at) v.research_consent_at = new Date().toISOString();
      if (!v.research_consent) v.research_consent_at = null;
      return editing ? api.updatePatient(id!, v) : api.createPatient(v);
    },
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['patients'] });
      void qc.invalidateQueries({ queryKey: ['patient', p.id] });
      navigate(`/patients/${p.id}`);
    },
    onError: (e) => setError((e as Error).message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const hasFirst = form.first_name_en?.trim() || form.first_name_ar?.trim();
    const hasLast = form.last_name_en?.trim() || form.last_name_ar?.trim();
    if (!hasFirst || !hasLast) { setError(t('patients.nameRequired')); return; }
    save.mutate();
  };

  if (editing && existing.isLoading) return <Spinner />;
  if (editing && !existing.data) return <Alert tone="error">{t('patients.notFound')}</Alert>;
  if (!editing && !can('patient.create')) return <Alert tone="error">{t('errors.forbidden')}</Alert>;

  const toggleSpecialty = (s: Specialty) =>
    set('specialties', form.specialties.includes(s) ? form.specialties.filter((x) => x !== s) : [...form.specialties, s]);

  return (
    <form onSubmit={submit} className="space-y-6">
      <PageHeader title={editing ? t('patients.edit') : t('patients.new')}
        actions={<>
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>{t('common.cancel')}</Button>
          <Button type="submit" loading={save.isPending} icon={<Save className="h-4 w-4" />}>{t('common.save')}</Button>
        </>} />

      {error && <Alert tone="error">{error}</Alert>}

      <Card title={t('patients.sections.identity')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('common.clinic')} required>
            <Select value={form.clinic_id} onChange={(e) => setForm((f) => ({ ...f, clinic_id: e.target.value, mrn: editing ? f.mrn : '' }))}
              disabled={editing} required>
              {(editing ? access?.memberships ?? [] : creatable).map((m) => (
                <option key={m.clinic_id} value={m.clinic_id}>{clinicName({ name_en: m.clinic_name_en, name_ar: m.clinic_name_ar }, lang)}</option>
              ))}
              {editing && !access?.memberships.some((m) => m.clinic_id === form.clinic_id) && <option value={form.clinic_id}>—</option>}
            </Select>
          </Field>
          <Field label={t('patients.mrn')} required>
            <Input value={form.mrn} onChange={(e) => set('mrn', e.target.value)} required dir="ltr" maxLength={40} />
          </Field>
          <Field label={t('patients.dob')} required>
            <Input type="date" value={form.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} required
              max={new Date().toISOString().slice(0, 10)} dir="ltr" />
          </Field>
          <Field label={t('patients.firstNameAr')}>
            <Input value={form.first_name_ar ?? ''} onChange={(e) => set('first_name_ar', e.target.value)} dir="rtl" lang="ar" />
          </Field>
          <Field label={t('patients.lastNameAr')}>
            <Input value={form.last_name_ar ?? ''} onChange={(e) => set('last_name_ar', e.target.value)} dir="rtl" lang="ar" />
          </Field>
          <Field label={t('patients.nationalId')}>
            <Input value={form.national_id ?? ''} onChange={(e) => set('national_id', e.target.value)} dir="ltr" autoComplete="off" />
          </Field>
          <Field label={t('patients.firstNameEn')}>
            <Input value={form.first_name_en ?? ''} onChange={(e) => set('first_name_en', e.target.value)} dir="ltr" lang="en" />
          </Field>
          <Field label={t('patients.lastNameEn')}>
            <Input value={form.last_name_en ?? ''} onChange={(e) => set('last_name_en', e.target.value)} dir="ltr" lang="en" />
          </Field>
          <Field label={t('patients.nationality')}>
            <Input value={form.nationality ?? ''} onChange={(e) => set('nationality', e.target.value)} />
          </Field>
          <Field label={t('patients.maritalStatus')}>
            <Select value={form.marital_status ?? ''} onChange={(e) => set('marital_status', (e.target.value || null) as PatientInput['marital_status'])}>
              <option value="">—</option>
              {(['single', 'married', 'divorced', 'widowed'] as const).map((m) => <option key={m} value={m}>{t(`patients.marital.${m}`)}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      <Card title={t('patients.sections.contact')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('patients.phone')}><Input type="tel" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} dir="ltr" /></Field>
          <Field label={t('patients.email')}><Input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} dir="ltr" /></Field>
          <Field label={t('patients.address')}><Input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
          <Field label={t('patients.emergencyName')}><Input value={form.emergency_contact_name ?? ''} onChange={(e) => set('emergency_contact_name', e.target.value)} /></Field>
          <Field label={t('patients.emergencyPhone')}><Input type="tel" value={form.emergency_contact_phone ?? ''} onChange={(e) => set('emergency_contact_phone', e.target.value)} dir="ltr" /></Field>
        </div>
      </Card>

      <Card title={t('patients.sections.medical')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('patients.bloodGroup')}>
            <Select value={form.blood_group ?? ''} onChange={(e) => set('blood_group', (e.target.value || null) as PatientInput['blood_group'])}>
              <option value="">—</option>{(['A', 'B', 'AB', 'O'] as const).map((b) => <option key={b}>{b}</option>)}
            </Select>
          </Field>
          <Field label={t('patients.rh')}>
            <Select value={form.rh_factor ?? ''} onChange={(e) => set('rh_factor', (e.target.value || null) as PatientInput['rh_factor'])}>
              <option value="">—</option>
              <option value="positive">{t('patients.rhValue.positive')}</option>
              <option value="negative">{t('patients.rhValue.negative')}</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <p className="label">{t('patients.specialties')}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {SPECIALTIES.map((s) => (
              <Checkbox key={s} label={t(`specialty.${s}`)} checked={form.specialties.includes(s)} onChange={() => toggleSpecialty(s)} />
            ))}
          </div>
        </div>
      </Card>

      <Card title={t('patients.sections.access')}>
        <div className="space-y-4">
          <Field label={t('patients.visibility')}
            help={form.visibility === 'private' ? t('patients.visibilityPrivateHelp') : t('patients.visibilityClinicHelp')}>
            <Select value={form.visibility} disabled={!canShare}
              onChange={(e) => {
                const v = e.target.value as PatientInput['visibility'];
                setForm((f) => ({ ...f, visibility: v, primary_physician_id: v === 'private' ? f.primary_physician_id ?? user!.id : f.primary_physician_id }));
              }}>
              <option value="clinic">{t('patients.visibilityClinic')}</option>
              <option value="private">{t('patients.visibilityPrivate')}</option>
            </Select>
          </Field>
          <Checkbox label={t('patients.researchConsent')} help={t('patients.researchConsentHelp')}
            checked={form.research_consent} onChange={(v) => set('research_consent', v)} />
          <Field label={t('patients.notes')}>
            <Textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
      </Card>
    </form>
  );
}
