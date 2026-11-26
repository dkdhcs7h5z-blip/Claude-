import type { TFunction } from 'i18next';
import { formatDateTime } from '@/lib/format';

/** Maps code-login errors (from the code-login function or demo backend) to a message. */
export function codeErrorMessage(err: unknown, t: TFunction, lang: 'en' | 'ar'): string {
  const m = (err as Error)?.message ?? '';
  if (m.startsWith('locked:')) return t('team.code.locked', { time: formatDateTime(m.slice(7), lang) });
  if (m === 'invalid_code') return t('team.code.invalid');
  if (m === 'invalid_format') return t('team.code.format');
  if (m === 'account_disabled') return t('team.code.disabled');
  return m || t('team.code.invalid');
}
