import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, KeyRound, Save, ShieldCheck } from 'lucide-react';
import { CodeReveal } from '@/auth/CodeReveal';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select } from '@/components/ui';
import { setLanguage, type Lang } from '@/i18n';
import { clinicName } from '@/lib/format';
import { useLang } from '@/lib/queries';

export function SettingsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { profile, access, refresh } = useAuth();
  const [form, setForm] = useState({ full_name_en: '', full_name_ar: '', title: '' });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [myCode, setMyCode] = useState<string | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const [backup, setBackup] = useState<{ busy: boolean; msg: string | null; err: string | null }>({ busy: false, msg: null, err: null });

  const newCode = async () => {
    if (!access || !window.confirm(t('team.code.resetMineConfirm'))) return;
    setCodeBusy(true); setError(null);
    try { setMyCode(await api.resetLoginCode(access.user_id)); await refresh(); } catch (e) { setError((e as Error).message); } finally { setCodeBusy(false); }
  };

  const exportAll = async () => {
    setBackup({ busy: true, msg: null, err: null });
    try {
      const data = await api.exportAllData();
      const tables = Object.keys(data).length;
      const records = Object.values(data).reduce((n, rows) => n + rows.length, 0);
      const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), format: 'whrmis-backup-v1', tables: data }, null, 1)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `whrmis-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setBackup({ busy: false, msg: t('team.backup.done', { n: records, t: tables }), err: null });
    } catch (e) { setBackup({ busy: false, msg: null, err: (e as Error).message }); }
  };

  useEffect(() => {
    if (profile) setForm({ full_name_en: profile.full_name_en ?? '', full_name_ar: profile.full_name_ar ?? '', title: profile.title ?? '' });
  }, [profile]);

  const changeLang = async (l: Lang) => {
    await setLanguage(l);
    try { await api.updateMyProfile({ preferred_language: l }); } catch { /* preference only */ }
  };

  const save = async () => {
    setBusy(true); setError(null); setSaved(false);
    try {
      await api.updateMyProfile({ full_name_en: form.full_name_en || null, full_name_ar: form.full_name_ar || null, title: form.title || null });
      await refresh();
      setSaved(true);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('settings.title')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('settings.preferences')}>
          <Field label={t('settings.interfaceLanguage')} help={t('settings.languageHelp')}>
            <Select value={lang} onChange={(e) => void changeLang(e.target.value as Lang)}>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </Select>
          </Field>
        </Card>

        <Card title={t('settings.myRoles')}>
          {access?.is_super_admin && <div className="mb-3"><Badge tone="red" icon={<ShieldCheck className="h-3 w-3" />}>{t('settings.superAdmin')}</Badge></div>}
          <ul className="space-y-2">
            {access?.memberships.map((m) => (
              <li key={m.clinic_id} className="flex items-center justify-between text-sm">
                <span>{clinicName({ name_en: m.clinic_name_en, name_ar: m.clinic_name_ar }, lang)}</span>
                <Badge tone="brand">{t(`roles.${m.role}`)}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={t('team.code.mine')}>
          <p className="text-sm text-slate-600">{t('team.code.mineHelp')}</p>
          {access?.login_handle && <p className="mt-2 text-sm">{t('team.code.myHandle')}<span dir="ltr" className="font-mono font-semibold">{access.login_handle}-••••</span></p>}
          <Button className="mt-3" variant="secondary" loading={codeBusy} icon={<KeyRound className="h-4 w-4" />} onClick={() => void newCode()}>{t('team.code.resetMine')}</Button>
        </Card>

        {access?.is_super_admin && (
          <Card title={t('team.backup.title')}>
            <p className="text-sm text-slate-600">{t('team.backup.note')}</p>
            {api.mode !== 'demo' && <Alert tone="warning">{t('team.backup.freePlan')}</Alert>}
            <Button className="mt-3" loading={backup.busy} icon={<Download className="h-4 w-4" />} onClick={() => void exportAll()}>
              {backup.busy ? t('team.backup.exporting') : t('team.backup.export')}
            </Button>
            {backup.msg && <p className="mt-2 text-sm text-emerald-700">{backup.msg}</p>}
            {backup.err && <div className="mt-2"><Alert tone="error">{backup.err}</Alert></div>}
          </Card>
        )}

        <Card title={t('settings.profile')} className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('settings.title_')}><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label={t('admin.fullNameEn')}><Input dir="ltr" value={form.full_name_en} onChange={(e) => setForm({ ...form, full_name_en: e.target.value })} /></Field>
            <Field label={t('admin.fullNameAr')}><Input dir="rtl" value={form.full_name_ar} onChange={(e) => setForm({ ...form, full_name_ar: e.target.value })} /></Field>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button loading={busy} icon={<Save className="h-4 w-4" />} onClick={() => void save()}>{t('common.save')}</Button>
            {saved && <span className="text-sm text-emerald-700">{t('common.saved')}</span>}
          </div>
          {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}
          {profile?.email && <p className="mt-4 text-xs text-slate-500" dir="ltr">{profile.email}</p>}
        </Card>
      </div>
      {myCode && <CodeReveal code={myCode} title={t('team.code.mine')} onClose={() => setMyCode(null)} />}
    </div>
  );
}
