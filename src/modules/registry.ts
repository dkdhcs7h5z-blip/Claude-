import {
  LayoutDashboard, Users, Baby, Flower2, Microscope, HeartPulse, FlaskConical, UserCog, ShieldCheck,
  ScrollText, Settings, type LucideIcon,
} from 'lucide-react';
import type { Permission } from '@/rbac/permissions';
import type { Specialty } from '@/data/types';
import type { Tone } from '@/components/ui';

export interface NavItem {
  key: string;
  path: string;
  icon: LucideIcon;
  /** i18n key */
  label: string;
  section: 'clinical' | 'specialties' | 'management';
  /** visible if the user holds ANY of these (omit = everyone) */
  perms?: Permission[];
  specialty?: Specialty;
  tone?: Tone;
}

/**
 * Single source of truth for navigation and route-level permissions.
 * New modules (e.g. pharmacy, lab integrations, AI decision support) register here.
 */
export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', path: '/', icon: LayoutDashboard, label: 'nav.dashboard', section: 'clinical' },
  { key: 'patients', path: '/patients', icon: Users, label: 'nav.patients', section: 'clinical', perms: ['patient.read'] },
  { key: 'obstetrics', path: '/obstetrics', icon: Baby, label: 'nav.obstetrics', section: 'specialties',
    perms: ['clinical.read'], specialty: 'obstetrics', tone: 'pink' },
  { key: 'gynecology', path: '/gynecology', icon: Flower2, label: 'nav.gynecology', section: 'specialties',
    perms: ['clinical.read'], specialty: 'gynecology', tone: 'violet' },
  { key: 'infertility', path: '/infertility', icon: Microscope, label: 'nav.infertility', section: 'specialties',
    perms: ['clinical.read'], specialty: 'infertility', tone: 'teal' },
  { key: 'fetal_medicine', path: '/fetal-medicine', icon: HeartPulse, label: 'nav.fetal_medicine', section: 'specialties',
    perms: ['clinical.read'], specialty: 'fetal_medicine', tone: 'blue' },
  { key: 'research', path: '/research', icon: FlaskConical, label: 'nav.research', section: 'management',
    perms: ['research.access', 'research.manage'] },
  { key: 'staff', path: '/admin/staff', icon: UserCog, label: 'nav.staff', section: 'management', perms: ['admin.users'] },
  { key: 'roles', path: '/admin/roles', icon: ShieldCheck, label: 'nav.roles', section: 'management', perms: ['admin.users'] },
  { key: 'audit', path: '/admin/audit', icon: ScrollText, label: 'nav.audit', section: 'management', perms: ['audit.read'] },
  { key: 'settings', path: '/settings', icon: Settings, label: 'nav.settings', section: 'management' },
];

export const SPECIALTY_NAV = NAV_ITEMS.filter((n) => n.specialty);

export const SPECIALTY_TONE: Record<Specialty, Tone> = {
  obstetrics: 'pink', gynecology: 'violet', infertility: 'teal', fetal_medicine: 'blue',
};
