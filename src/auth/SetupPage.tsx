import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { api } from '@/data';
import { Alert, Button, Field, Input } from '@/components/ui';
import { CodeReveal } from './CodeReveal';

/** First-run: create the owner (super administrator) and the first clinic. */
export function SetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [f, setF] = useState({ secret: '', nameEn: '', nameAr: '', title: '', clinicCode: '', clinicEn: '', clinicAr: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      setCode(await api.bootstrapOwner({
        setup_secret: f.secret, full_name_en: f.nameEn.trim() || null, full_name_ar: f.nameAr.trim() || null, title: f.title.trim() || null,
        clinic_code: f.clinicCode.trim().toUpperCase(), clinic_name_en: f.clinicEn.trim(), clinic_name_ar: f.clinicAr.trim() || null,
      }));
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <form onSubmit={submit} className="card w-full max-w-lg space-y-4 p-6">
        <div className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-brand-700" /><h1 className="text-xl font-semibold">{t('team.setup.title')}</h1></div>
        <p className="text-sm text-slate-600">{t('team.setup.intro')}</p>
        <Field label={t('team.setup.secret')} required><Input type="password" autoComplete="off" value={f.secret} onChange={set('secret')} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('team.setup.personTitle')}><Input value={f.title} onChange={set('title')} placeholder="Dr." /></Field>
          <Field label={t('team.setup.nameEn')}><Input dir="ltr" value={f.nameEn} onChange={set('nameEn')} /></Field>
          <Field label={t('team.setup.nameAr')}><Input dir="rtl" value={f.nameAr} onChange={set('nameAr')} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('team.setup.clinicCode')} help={t('team.setup.clinicCodeHelp')}><Input dir="ltr" value={f.clinicCode} onChange={set('clinicCode')} /></Field>
          <Field label={t('team.setup.clinicNameEn')}><Input dir="ltr" value={f.clinicEn} onChange={set('clinicEn')} /></Field>
          <Field label={t('team.setup.clinicNameAr')}><Input dir="rtl" value={f.clinicAr} onChange={set('clinicAr')} /></Field>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" className="w-full" loading={busy}>{t('team.setup.submit')}</Button>
        <Link to="/login" className="block text-center text-sm text-brand-700 hover:underline">{t('team.setup.backToLogin')}</Link>
      </form>
      {code && <CodeReveal code={code} title={t('team.setup.done')} onClose={() => navigate('/login')} />}
    </div>
  );
}
