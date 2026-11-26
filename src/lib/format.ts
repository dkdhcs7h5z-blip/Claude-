import type { Lang } from '@/i18n';
import type { Patient, Profile, Clinic } from '@/data/types';

/** Arabic UI with Latin digits — the norm in clinical documentation. */
const locale = (lang: Lang) => (lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB');

export function formatDate(value: string | null | undefined, lang: Lang): string {
  if (!value) return '—';
  const d = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return new Intl.DateTimeFormat(locale(lang), { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
}

export function formatDateTime(value: string | null | undefined, lang: Lang): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export function formatRelative(value: string, lang: Lang): string {
  const diff = (new Date(value).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: 'auto' });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

/** Patient display name in the active language, falling back to the other script. */
export function patientName(p: Pick<Patient, 'first_name_en' | 'last_name_en' | 'first_name_ar' | 'last_name_ar'>, lang: Lang): string {
  const en = [p.first_name_en, p.last_name_en].filter(Boolean).join(' ');
  const ar = [p.first_name_ar, p.last_name_ar].filter(Boolean).join(' ');
  return (lang === 'ar' ? ar || en : en || ar) || '—';
}

export function profileName(p: Pick<Profile, 'full_name_en' | 'full_name_ar' | 'title'> | null | undefined, lang: Lang): string {
  if (!p) return '—';
  const name = (lang === 'ar' ? p.full_name_ar || p.full_name_en : p.full_name_en || p.full_name_ar) || '—';
  return p.title && lang === 'en' ? `${p.title} ${name}` : name;
}

export function clinicName(c: Pick<Clinic, 'name_en' | 'name_ar'> | null | undefined, lang: Lang): string {
  if (!c) return '—';
  return lang === 'ar' ? c.name_ar : c.name_en;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
