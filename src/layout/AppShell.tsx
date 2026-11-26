import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Menu, X, LogOut, Languages, Building2, FlaskRound } from 'lucide-react';
import { useEffect } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { NAV_ITEMS, type NavItem } from '@/modules/registry';
import { api } from '@/data';
import { setLanguage, type Lang } from '@/i18n';
import { clinicName, initials, profileName } from '@/lib/format';

function useVisibleNav(): NavItem[] {
  const { can, inScope } = useAuth();
  return NAV_ITEMS.filter((n) => (!n.perms || n.perms.some((p) => can(p))) && (!n.specialty || inScope(n.specialty)));
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const items = useVisibleNav();
  const sections = ['clinical', 'specialties', 'management'] as const;
  return (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-4">
      {sections.map((s) => {
        const list = items.filter((i) => i.section === s);
        if (!list.length) return null;
        return (
          <div key={s}>
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-brand-200/70">{t(`nav.${s}`)}</p>
            <ul className="space-y-0.5">
              {list.map((item) => (
                <li key={item.key}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    onClick={onNavigate}
                    className={({ isActive }) => clsx(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="truncate">{t(item.label)}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <img src="/icon.svg" alt="" className="h-9 w-9 rounded-lg ring-1 ring-white/20" />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold text-white">{t('app.short')}</p>
        <p className="truncate text-[11px] text-brand-200">EMR · Research</p>
      </div>
    </div>
  );
}

function ClinicSwitcher() {
  const { t, i18n } = useTranslation();
  const { access, activeClinicId, setActiveClinicId } = useAuth();
  const memberships = access?.memberships ?? [];
  if (memberships.length < 2 && !access?.is_super_admin) {
    const m = memberships[0];
    return m ? (
      <div className="hidden items-center gap-2 text-sm text-slate-600 md:flex">
        <Building2 className="h-4 w-4 text-slate-400" />
        {clinicName({ name_en: m.clinic_name_en, name_ar: m.clinic_name_ar }, i18n.language as Lang)}
      </div>
    ) : null;
  }
  return (
    <label className="flex min-w-0 items-center gap-2">
      <Building2 className="hidden h-4 w-4 shrink-0 text-slate-400 sm:block" />
      <span className="sr-only">{t('common.clinic')}</span>
      <select
        value={activeClinicId ?? ''}
        onChange={(e) => setActiveClinicId(e.target.value || null)}
        className="min-w-0 max-w-[170px] truncate rounded-lg border border-slate-200 bg-white py-1.5 pe-8 ps-2 text-sm sm:max-w-xs"
      >
        <option value="">{t('nav.allClinics')}</option>
        {memberships.map((m) => (
          <option key={m.clinic_id} value={m.clinic_id}>
            {clinicName({ name_en: m.clinic_name_en, name_ar: m.clinic_name_ar }, i18n.language as Lang)}
          </option>
        ))}
      </select>
    </label>
  );
}

function LanguageToggle() {
  const { i18n } = useTranslation();
  const next: Lang = i18n.language === 'ar' ? 'en' : 'ar';
  return (
    <button
      onClick={() => void setLanguage(next)}
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
      aria-label="Switch language"
    >
      <Languages className="h-4 w-4" />
      {next === 'ar' ? 'العربية' : 'English'}
    </button>
  );
}

function UserMenu() {
  const { t, i18n } = useTranslation();
  const { profile, access, signOut } = useAuth();
  const name = profileName(profile, i18n.language as Lang);
  const role = access?.is_super_admin ? 'super_admin' : access?.memberships[0]?.role;
  return (
    <div className="flex items-center gap-2">
      <div className="hidden text-end leading-tight lg:block">
        <p className="text-sm font-medium text-slate-800">{name}</p>
        {role && <p className="text-xs text-slate-500">{t(`roles.${role}`)}</p>}
      </div>
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
        {initials(profile?.full_name_en || profile?.full_name_ar || '?')}
      </div>
      <button onClick={() => void signOut()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title={t('auth.signOut')} aria-label={t('auth.signOut')}>
        <LogOut className="h-4 w-4 rtl:rotate-180" />
      </button>
    </div>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar (inline-start side, flips automatically in RTL) */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col bg-gradient-to-b from-brand-800 to-brand-900 lg:flex">
        <Brand />
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col bg-gradient-to-b from-brand-800 to-brand-900 shadow-xl">
            <div className="flex items-center justify-between pe-3">
              <Brand />
              <button onClick={() => setOpen(false)} className="rounded-md p-1.5 text-brand-100 hover:bg-white/10" aria-label={t('common.close')}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:ps-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/90 px-3 backdrop-blur sm:gap-3 sm:px-6">
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label={t('nav.menu')}>
            <Menu className="h-5 w-5" />
          </button>
          <ClinicSwitcher />
          <div className="flex-1" />
          {api.mode === 'demo' && (
            <span className="hidden items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 sm:inline-flex">
              <FlaskRound className="h-3.5 w-3.5" />{t('auth.demoMode')}
            </span>
          )}
          <LanguageToggle />
          <UserMenu />
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
