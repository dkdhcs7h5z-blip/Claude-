import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import type { Lang } from '@/i18n';

export function useLang(): Lang {
  return useTranslation().i18n.language === 'ar' ? 'ar' : 'en';
}

export function useClinics() {
  const { user } = useAuth();
  return useQuery({ queryKey: ['clinics', user?.id], queryFn: () => api.listClinics(), enabled: !!user, staleTime: 5 * 60_000 });
}

export function useProfiles() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['profiles', user?.id], queryFn: () => api.listProfiles(), enabled: !!user, staleTime: 5 * 60_000 });
  const byId = new Map((q.data ?? []).map((p) => [p.id, p]));
  return { ...q, byId };
}
