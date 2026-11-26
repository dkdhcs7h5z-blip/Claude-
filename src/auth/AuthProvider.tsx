import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/data';
import type { AuthUser } from '@/data/service';
import type { MyAccess, Profile, Specialty } from '@/data/types';
import type { Permission } from '@/rbac/permissions';
import { hasPermission, specialtyScope } from '@/rbac/access';
import { hasStoredLanguage, setLanguage } from '@/i18n';

interface AuthState {
  loading: boolean;
  user: AuthUser | null;
  profile: Profile | null;
  access: MyAccess | null;
  /** Clinic filter chosen in the top bar (null = all clinics the user belongs to). */
  activeClinicId: string | null;
  setActiveClinicId: (id: string | null) => void;
  /** UI gate. Pass a clinicId for a clinic-specific check; otherwise "in any clinic". */
  can: (perm: Permission, clinicId?: string | null) => boolean;
  /** Specialties this person works in (null = all). */
  specialties: Specialty[] | null;
  inScope: (s: Specialty) => boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithCode: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);
const CLINIC_KEY = 'whrmis.activeClinic';

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [access, setAccess] = useState<MyAccess | null>(null);
  const [activeClinicId, setActiveClinicIdState] = useState<string | null>(() => {
    try { return localStorage.getItem(CLINIC_KEY); } catch { return null; }
  });

  const load = useCallback(async (u: AuthUser | null) => {
    setUser(u);
    if (!u) {
      setProfile(null);
      setAccess(null);
      setLoading(false);
      return;
    }
    try {
      const [p, a] = await Promise.all([api.getMyProfile(), api.getMyAccess()]);
      setProfile(p);
      setAccess(a);
      // A choice made on this device wins; otherwise follow the profile preference.
      if (p?.preferred_language && !hasStoredLanguage()) void setLanguage(p.preferred_language);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void api.getCurrentUser().then(load);
    return api.onAuthChange((u) => {
      qc.clear(); // never keep another user's PHI in the cache
      void load(u);
    });
  }, [load, qc]);

  // Drop a stale clinic filter if the user no longer belongs to that clinic.
  useEffect(() => {
    if (access && activeClinicId && !access.is_super_admin
      && !access.memberships.some((m) => m.clinic_id === activeClinicId)) {
      setActiveClinicIdState(null);
    }
  }, [access, activeClinicId]);

  const setActiveClinicId = useCallback((id: string | null) => {
    setActiveClinicIdState(id);
    try { if (id) localStorage.setItem(CLINIC_KEY, id); else localStorage.removeItem(CLINIC_KEY); } catch { /* ignore */ }
  }, []);

  const value = useMemo<AuthState>(() => ({
    loading, user, profile, access, activeClinicId, setActiveClinicId,
    can: (perm, clinicId) => hasPermission(access, perm, clinicId ?? null),
    specialties: specialtyScope(access),
    inScope: (s) => { const sc = specialtyScope(access); return sc == null || sc.includes(s); },
    signIn: async (email, password) => { setLoading(true); try { await api.signInWithPassword(email, password); } finally { setLoading(false); } },
    signInWithCode: async (code) => { await api.signInWithCode(code); },
    signOut: async () => { await api.signOut(); qc.clear(); },
    refresh: async () => { await load(await api.getCurrentUser()); },
  }), [loading, user, profile, access, activeClinicId, setActiveClinicId, load, qc]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
