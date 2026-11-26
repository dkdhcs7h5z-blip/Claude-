import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock, Languages, ShieldCheck, FlaskRound } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { api } from '@/data';
import { DEMO_LOGIN_ORDER, DEMO_USERS } from '@/data/demoData';
import { Alert, Button, Field, Input } from '@/components/ui';
import { setLanguage, type Lang } from '@/i18n';
import { profileName } from '@/lib/format';

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Lang;
  const { user, signIn, loading } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (user && !loading) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try { await signIn(email.trim(), password); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  };

  const reset = async () => {
    if (!email) return;
    await api.sendPasswordReset(email.trim());
    setInfo(t('auth.resetSent'));
  };

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-11 w-11 rounded-xl ring-1 ring-white/20" />
          <span className="text-lg font-semibold">{t('app.short')}</span>
        </div>
        <div>
          <h1 className="max-w-lg text-3xl font-semibold leading-tight">{t('app.name')}</h1>
          <p className="mt-4 text-brand-100">{t('app.tagline')}</p>
        </div>
        <p className="flex items-center gap-2 text-sm text-brand-200"><ShieldCheck className="h-4 w-4" />{t('auth.secureNotice')}</p>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-2 lg:hidden">
              <img src="/icon.svg" alt="" className="h-9 w-9 rounded-lg" />
              <span className="font-semibold text-brand-800">{t('app.short')}</span>
            </div>
            <button onClick={() => void setLanguage(lang === 'ar' ? 'en' : 'ar')}
              className="ms-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
              <Languages className="h-4 w-4" />{lang === 'ar' ? 'English' : 'العربية'}
            </button>
          </div>

          <h2 className="text-2xl font-semibold text-slate-900">{t('auth.signIn')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('auth.secureNotice')}</p>

          {api.mode === 'demo' ? (
            <div className="mt-6 space-y-4">
              <Alert tone="warning" title={t('auth.demoMode')}>{t('auth.demoHint')}</Alert>
              <p className="text-sm font-medium text-slate-700">{t('auth.chooseUser')}</p>
              <div className="grid gap-2">
                {DEMO_LOGIN_ORDER.map((id) => {
                  const u = DEMO_USERS.find((x) => x.id === id)!;
                  const role = u.is_super_admin ? 'super_admin' : u.memberships[0].role;
                  return (
                    <button key={id} disabled={busy} onClick={async () => {
                      setBusy(true);
                      try { await signIn(id, ''); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
                    }}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-start text-sm shadow-sm transition hover:border-brand-300 hover:bg-brand-50 disabled:opacity-60">
                      <span className="font-medium text-slate-800">{profileName(u, lang)}</span>
                      <span className="flex items-center gap-1 text-xs text-slate-500"><FlaskRound className="h-3.5 w-3.5" />{t(`roles.${role}`)}</span>
                    </button>
                  );
                })}
              </div>
              {error && <Alert tone="error">{error}</Alert>}
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <Field label={t('auth.email')} htmlFor="email">
                <Input id="email" type="email" autoComplete="username" required value={email}
                  onChange={(e) => setEmail(e.target.value)} dir="ltr" />
              </Field>
              <Field label={t('auth.password')} htmlFor="password">
                <Input id="password" type="password" autoComplete="current-password" required value={password}
                  onChange={(e) => setPassword(e.target.value)} dir="ltr" />
              </Field>
              {error && <Alert tone="error">{error}</Alert>}
              {info && <Alert tone="success">{info}</Alert>}
              <Button type="submit" className="w-full" loading={busy} icon={<Lock className="h-4 w-4" />}>
                {busy ? t('auth.signingIn') : t('auth.signIn')}
              </Button>
              <button type="button" onClick={() => void reset()} className="text-sm font-medium text-brand-700 hover:underline">
                {t('auth.forgot')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
