import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { KeyRound, Languages, ShieldCheck, FlaskRound } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { api } from '@/data';
import { DEMO_LOGIN_ORDER, DEMO_USERS } from '@/data/demoData';
import { Alert, Button, Field, Input } from '@/components/ui';
import { setLanguage, type Lang } from '@/i18n';
import { profileName } from '@/lib/format';
import { formatCodeInput, isCompleteCode } from '@/lib/loginCode';
import { codeErrorMessage } from './codeErrors';

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Lang;
  const { user, signIn, signInWithCode, loading } = useAuth();
  const location = useLocation();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = (location.state as { from?: string } | null)?.from ?? '/';
  if (user && !loading) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isCompleteCode(code)) { setError(t('team.code.format')); return; }
    setBusy(true);
    try { await signInWithCode(code); } catch (err) { setError(codeErrorMessage(err, t, lang)); } finally { setBusy(false); }
  };

  const codeForm = (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label={t('team.code.label')} htmlFor="login-code" help={t('team.code.help')}>
        <Input id="login-code" name="login-code" dir="ltr" autoComplete="one-time-code" autoCapitalize="characters" autoCorrect="off"
          spellCheck={false} inputMode="text" placeholder={t('team.code.placeholder')} value={code}
          className="font-mono text-lg tracking-wider" onChange={(e) => setCode(formatCodeInput(e.target.value))} />
      </Field>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" className="w-full" loading={busy} icon={<KeyRound className="h-4 w-4" />}>
        {busy ? t('auth.signingIn') : t('team.code.signIn')}
      </Button>
    </form>
  );

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
              <div className="border-t border-slate-200 pt-4">
                <p className="mb-3 text-sm font-medium text-slate-700">{t('team.code.demoOr')}</p>
                {codeForm}
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              {codeForm}
              <Link to="/setup" className="block text-center text-xs text-slate-400 hover:text-slate-600">{t('team.setup.link')}</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
