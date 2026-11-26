import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from './en';
import ar from './ar';

type Tree = { [k: string]: unknown };
function flatten(o: unknown, prefix = '', out = new Map<string, unknown>()): Map<string, unknown> {
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    for (const [k, v] of Object.entries(o as Tree)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else out.set(prefix, o);
  return out;
}
const enKeys = flatten(en), arKeys = flatten(ar);
/** i18next plural forms (key_one, key_other…) resolve the base key */
const has = (m: Map<string, unknown>, k: string) => m.has(k) || [...m.keys()].some((x) => x.startsWith(`${k}.`) || x.startsWith(`${k}_`));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.tsx?$/.test(f) && !f.endsWith('.test.ts') ? [p] : [];
  });
}

describe('translations', () => {
  it('Arabic and English define the same keys', () => {
    const missingAr = [...enKeys.keys()].filter((k) => !arKeys.has(k));
    const extraAr = [...arKeys.keys()].filter((k) => !enKeys.has(k));
    expect({ missingAr, extraAr }).toEqual({ missingAr: [], extraAr: [] });
  });

  it('every literal t() key used in the source exists', () => {
    const missing = new Set<string>();
    for (const file of sourceFiles(join(__dirname, '..'))) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z][\w]*(?:\.[\w]+)+)'/g)) {
        if (!has(enKeys, m[1])) missing.add(`${m[1]}  (${file.split('/src/')[1]})`);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('interpolation placeholders match between languages', () => {
    const vars = (s: unknown) => (typeof s === 'string' ? [...s.matchAll(/\{\{(\w+)/g)].map((m) => m[1]).sort().join(',') : '');
    const mismatched = [...enKeys.keys()].filter((k) => arKeys.has(k) && vars(enKeys.get(k)) !== vars(arKeys.get(k)));
    expect(mismatched).toEqual([]);
  });
});
