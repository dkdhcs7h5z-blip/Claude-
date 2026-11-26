/** Form helpers: inputs hold strings; the API takes numbers / nulls. */
export const num = (v: string): number | null => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v));
export const str = (v: number | string | null | undefined): string => (v == null ? '' : String(v));
export const orNull = <T extends string>(v: string): T | null => (v === '' ? null : (v as T));
