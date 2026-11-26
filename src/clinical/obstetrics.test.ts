import { describe, expect, it } from 'vitest';
import { ageInYears, eddFromLmp, eddFromTransfer, formatGA, gestationalAge, gpal, lmpFromEdd } from './obstetrics';

describe('obstetric dating', () => {
  it("applies Naegele's rule", () => {
    expect(eddFromLmp('2026-01-01')).toBe('2026-10-08');
    expect(eddFromLmp('2024-02-29')).toBe('2024-12-05');
  });

  it('adjusts EDD for cycle length', () => {
    expect(eddFromLmp('2026-01-01', 35)).toBe('2026-10-15');
  });

  it('round-trips EDD ↔ LMP', () => {
    expect(lmpFromEdd(eddFromLmp('2026-03-15'))).toBe('2026-03-15');
  });

  it('dates IVF pregnancies from transfer', () => {
    // day-5 blastocyst transfer → GA 2w5d on transfer day
    const edd = eddFromTransfer('2026-01-10', 5);
    expect(edd).toBe('2026-09-28');
    expect(formatGA(gestationalAge({ edd }, '2026-01-10'))).toBe('2+5');
  });

  it('computes gestational age and trimester', () => {
    const ga = gestationalAge({ lmp: '2026-01-01' }, '2026-04-10');
    expect(ga).toEqual({ totalDays: 99, weeks: 14, days: 1, trimester: 2 });
    expect(gestationalAge({ lmp: '2026-01-01' }, '2026-01-01')?.trimester).toBe(1);
    expect(gestationalAge({ lmp: '2026-01-01' }, '2026-08-01')?.trimester).toBe(3);
  });

  it('prefers EDD over LMP when both are given', () => {
    const ga = gestationalAge({ lmp: '2026-01-01', edd: '2026-10-15' }, '2026-04-10');
    expect(ga?.totalDays).toBe(92);
  });

  it('rejects impossible gestational ages', () => {
    expect(gestationalAge({ lmp: '2026-05-01' }, '2026-04-01')).toBeNull();
    expect(gestationalAge({ lmp: '2025-01-01' }, '2026-04-01')).toBeNull();
    expect(gestationalAge({})).toBeNull();
  });

  it('formats GPAL', () => {
    expect(gpal({ gravida: 3, para: 2, abortus: 0, living: 2 })).toBe('G3 P2 A0 L2');
    expect(gpal({ gravida: 1, para: null, abortus: null, living: null })).toBe('G1 P– A– L–');
  });

  it('computes age', () => {
    expect(ageInYears('1990-06-15', '2026-06-14')).toBe(35);
    expect(ageInYears('1990-06-15', '2026-06-15')).toBe(36);
  });
});
