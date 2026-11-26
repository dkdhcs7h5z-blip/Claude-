import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from './AuthProvider';
import type { Permission } from '@/rbac/permissions';
import { Spinner, EmptyState } from '@/components/ui';
import { Link } from 'react-router-dom';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex h-screen items-center justify-center"><Spinner /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/** Renders children only if the user holds ANY of the given permissions. */
export function RequirePermission({ perm, children }: { perm: Permission | Permission[]; children: ReactNode }) {
  const { can } = useAuth();
  const { t } = useTranslation();
  const perms = Array.isArray(perm) ? perm : [perm];
  if (!perms.some((p) => can(p))) {
    return (
      <EmptyState icon={<ShieldAlert className="h-12 w-12" />} title={t('errors.forbidden')}>
        <Link to="/" className="font-medium text-brand-700 hover:underline">{t('errors.backHome')}</Link>
      </EmptyState>
    );
  }
  return <>{children}</>;
}

/** Inline UI gate. RLS remains the real enforcement. */
export function Can({ perm, clinicId, children, fallback = null }: {
  perm: Permission; clinicId?: string | null; children: ReactNode; fallback?: ReactNode;
}) {
  const { can } = useAuth();
  return <>{can(perm, clinicId) ? children : fallback}</>;
}
