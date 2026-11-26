import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { RequireAuth, RequirePermission } from '@/auth/guards';
import { LoginPage } from '@/auth/LoginPage';
import { AppShell } from '@/layout/AppShell';
import { Alert, EmptyState, Spinner } from '@/components/ui';
import { DashboardPage } from '@/modules/dashboard/DashboardPage';
import type { Specialty } from '@/data/types';

// Route-level code splitting keeps the initial bundle small on mobile.
const PatientsListPage = lazy(() => import('@/modules/patients/PatientsListPage').then((m) => ({ default: m.PatientsListPage })));
const PatientDetailPage = lazy(() => import('@/modules/patients/PatientDetailPage').then((m) => ({ default: m.PatientDetailPage })));
const PatientFormPage = lazy(() => import('@/modules/patients/PatientFormPage').then((m) => ({ default: m.PatientFormPage })));
const SpecialtyPage = lazy(() => import('@/modules/specialty/SpecialtyPage').then((m) => ({ default: m.SpecialtyPage })));
const ObstetricsPage = lazy(() => import('@/modules/obstetrics/ObstetricsPage').then((m) => ({ default: m.ObstetricsPage })));
const AntenatalCardPage = lazy(() => import('@/modules/obstetrics/AntenatalCardPage').then((m) => ({ default: m.AntenatalCardPage })));
const ResearchPage = lazy(() => import('@/modules/research/ResearchPage').then((m) => ({ default: m.ResearchPage })));
const StaffPage = lazy(() => import('@/modules/admin/StaffPage').then((m) => ({ default: m.StaffPage })));
const RolesPage = lazy(() => import('@/modules/admin/RolesPage').then((m) => ({ default: m.RolesPage })));
const AuditLogPage = lazy(() => import('@/modules/admin/AuditLogPage').then((m) => ({ default: m.AuditLogPage })));
const SettingsPage = lazy(() => import('@/modules/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));

const specialtyRoutes: Array<{ path: string; specialty: Specialty }> = [
  { path: 'gynecology', specialty: 'gynecology' },
  { path: 'infertility', specialty: 'infertility' },
  { path: 'fetal-medicine', specialty: 'fetal_medicine' },
];

function AccountGate({ children }: { children: React.ReactNode }) {
  const { access } = useAuth();
  const { t } = useTranslation();
  if (access && !access.is_active) return <div className="mx-auto max-w-lg p-6"><Alert tone="error">{t('auth.inactive')}</Alert></div>;
  if (access && !access.is_super_admin && access.memberships.length === 0) {
    return <Alert tone="warning">{t('auth.noMemberships')}</Alert>;
  }
  return <>{children}</>;
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <EmptyState title={t('errors.notFound')}>
      <Link to="/" className="font-medium text-brand-700 hover:underline">{t('errors.backHome')}</Link>
    </EmptyState>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          {/* print view: no app shell */}
          <Route path="patients/:id/antenatal-card/:pregnancyId"
            element={<RequireAuth><RequirePermission perm="clinical.read"><Suspense fallback={<Spinner />}><AntenatalCardPage /></Suspense></RequirePermission></RequireAuth>} />
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route index element={<AccountGate><DashboardPage /></AccountGate>} />
            <Route path="patients" element={<P perm="patient.read"><PatientsListPage /></P>} />
            <Route path="patients/new" element={<P perm="patient.create"><PatientFormPage /></P>} />
            <Route path="patients/:id" element={<P perm={['patient.read', 'clinical.read']}><PatientDetailPage /></P>} />
            <Route path="patients/:id/edit" element={<P perm="patient.update"><PatientFormPage /></P>} />
            <Route path="obstetrics" element={<P perm="clinical.read"><ObstetricsPage /></P>} />
            {specialtyRoutes.map((r) => (
              <Route key={r.path} path={r.path} element={<P perm="clinical.read"><SpecialtyPage specialty={r.specialty} /></P>} />
            ))}
            <Route path="research" element={<P perm={['research.access', 'research.manage']}><ResearchPage /></P>} />
            <Route path="admin/staff" element={<P perm="admin.users"><StaffPage /></P>} />
            <Route path="admin/roles" element={<P perm="admin.users"><RolesPage /></P>} />
            <Route path="admin/audit" element={<P perm="audit.read"><AuditLogPage /></P>} />
            <Route path="settings" element={<Suspense fallback={<Spinner />}><SettingsPage /></Suspense>} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

/** Permission-guarded, lazily loaded route element. */
function P({ perm, children }: { perm: Parameters<typeof RequirePermission>[0]['perm']; children: React.ReactNode }) {
  return (
    <AccountGate>
      <RequirePermission perm={perm}>
        <Suspense fallback={<Spinner />}>{children}</Suspense>
      </RequirePermission>
    </AccountGate>
  );
}
