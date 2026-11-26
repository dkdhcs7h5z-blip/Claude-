/**
 * Gynecology decision support — pure functions, no I/O.
 *
 * Guideline defaults (adapt to local protocol; the clinician confirms every step):
 *  - Cervical screening next step: simplified from ASCCP 2019 risk-based management
 *    consensus guidelines; routine intervals per USPSTF 2018 (cytology 3 y from 21;
 *    HPV primary / co-test 5 y from 30 to 65). WHO 2021 HPV-based screening is an
 *    alternative many programmes use.
 *  - Adnexal masses: IOTA Simple Rules (Timmerman et al. 2008).
 *  - Endometrium: postmenopausal bleeding with endometrial thickness > 4 mm needs
 *    sampling (ACOG CO 734); asymptomatic postmenopausal ET > 11 mm — consider sampling;
 *    AUB at age ≥ 45 — endometrial sampling (ACOG PB 128; NICE NG88).
 *  - PCOS: Rotterdam criteria (2 of 3); PCOM per 2023 International Evidence-based
 *    Guideline: ≥ 20 follicles per ovary or ovarian volume ≥ 10 mL (transvaginal).
 *  - AUB aetiology: FIGO PALM-COEIN (Munro 2018).
 */
import type { ClinicalAlert } from './obstetricRisk';

// ---------------------------------------------------------------------------
// Cervical screening
// ---------------------------------------------------------------------------
export type TestType = 'cytology' | 'hpv_primary' | 'cotest';
export type HpvResult = 'negative' | 'hpv16' | 'hpv18' | 'hpv16_18' | 'other_hr' | 'positive_untyped';
export type CytologyResult = 'nilm' | 'asc_us' | 'lsil' | 'asc_h' | 'hsil' | 'agc' | 'scc' | 'adenocarcinoma' | 'unsatisfactory';

export type ScreeningAction =
  | 'routine_3y' | 'routine_5y' | 'repeat_3y' | 'repeat_1y' | 'repeat_short' | 'reflex_hpv'
  | 'colposcopy' | 'colposcopy_expedited' | 'colposcopy_endometrial' | 'urgent_referral'
  | 'not_indicated_under_21' | 'exit_over_65' | 'stop_post_hysterectomy';

export interface ScreeningRecommendation {
  action: ScreeningAction;
  /** months until the next test, or null when no recall applies */
  months: number | null;
  urgency: 'routine' | 'soon' | 'urgent';
}

const HIGH_GRADE: CytologyResult[] = ['asc_h', 'hsil'];

export function recommendScreening(input: {
  ageYears: number; testType: TestType; hpv?: HpvResult | null; cytology?: CytologyResult | null;
  hysterectomy?: 'none' | 'subtotal' | 'total' | null;
}): ScreeningRecommendation {
  const { ageYears: age, testType, hpv = null, cytology = null } = input;
  const hpvPos = hpv != null && hpv !== 'negative';
  const hpv1618 = hpv === 'hpv16' || hpv === 'hpv18' || hpv === 'hpv16_18';

  if (cytology === 'scc' || cytology === 'adenocarcinoma') return { action: 'urgent_referral', months: null, urgency: 'urgent' };
  if (cytology === 'unsatisfactory') return { action: 'repeat_short', months: 3, urgency: 'soon' };
  if (cytology === 'agc') return { action: age >= 35 ? 'colposcopy_endometrial' : 'colposcopy', months: null, urgency: 'soon' };
  if (cytology && HIGH_GRADE.includes(cytology)) {
    return { action: cytology === 'hsil' && age >= 25 ? 'colposcopy_expedited' : 'colposcopy', months: null, urgency: 'soon' };
  }
  if (hpv1618) return { action: 'colposcopy', months: null, urgency: 'soon' };
  if (cytology === 'lsil') {
    return hpv === 'negative' ? { action: 'repeat_1y', months: 12, urgency: 'routine' } : { action: 'colposcopy', months: null, urgency: 'soon' };
  }
  if (cytology === 'asc_us') {
    if (hpv === 'negative') return { action: 'repeat_3y', months: 36, urgency: 'routine' };
    if (hpvPos) return { action: 'colposcopy', months: null, urgency: 'soon' };
    return { action: 'reflex_hpv', months: 12, urgency: 'soon' };
  }
  if (hpvPos) {
    // hrHPV other than 16/18 with NILM (or HPV-primary without triage cytology)
    return testType === 'hpv_primary' && cytology == null
      ? { action: 'reflex_hpv', months: 12, urgency: 'soon' }   // reflex cytology triage
      : { action: 'repeat_1y', months: 12, urgency: 'routine' };
  }
  // negative result
  if (input.hysterectomy === 'total') return { action: 'stop_post_hysterectomy', months: null, urgency: 'routine' };
  if (age < 21) return { action: 'not_indicated_under_21', months: null, urgency: 'routine' };
  if (age >= 65) return { action: 'exit_over_65', months: null, urgency: 'routine' };
  if (testType === 'cytology') return { action: 'routine_3y', months: 36, urgency: 'routine' };
  return { action: age >= 30 ? 'routine_5y' : 'routine_3y', months: age >= 30 ? 60 : 36, urgency: 'routine' };
}

export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, last));
  return dt.toISOString().slice(0, 10);
}

export type ScreeningStatus = 'not_applicable' | 'never' | 'action_needed' | 'overdue' | 'due_soon' | 'up_to_date' | 'pending_result';

export function screeningStatus(input: {
  ageYears: number; hysterectomy?: string | null; lastSampleDate?: string | null; lastStatus?: 'pending' | 'resulted' | null;
  nextDue?: string | null; recommendation?: string | null; colposcopyAfterSample?: boolean; today?: string;
}): ScreeningStatus {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const colpo = input.recommendation?.startsWith('colposcopy') || input.recommendation === 'urgent_referral';
  if (colpo && !input.colposcopyAfterSample) return 'action_needed';
  if (input.lastStatus === 'pending') return 'pending_result';
  if (input.hysterectomy === 'total' || input.ageYears < 21 || (input.ageYears > 65 && !input.nextDue)) return 'not_applicable';
  if (!input.lastSampleDate) return 'never';
  const due = input.nextDue ?? addMonths(input.lastSampleDate, 36);
  if (due < today) return 'overdue';
  if (due <= addDaysIso(today, 60)) return 'due_soon';
  return 'up_to_date';
}

function addDaysIso(d: string, n: number): string {
  const t = Date.parse(`${d}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// IOTA Simple Rules
// ---------------------------------------------------------------------------
export const IOTA_B = ['B1', 'B2', 'B3', 'B4', 'B5'] as const;
export const IOTA_M = ['M1', 'M2', 'M3', 'M4', 'M5'] as const;
export type IotaResult = 'benign' | 'malignant' | 'inconclusive';

/** Any M and no B → malignant; any B and no M → benign; otherwise inconclusive. */
export function iotaSimpleRules(b: string[], m: string[]): IotaResult {
  if (m.length && !b.length) return 'malignant';
  if (b.length && !m.length) return 'benign';
  return 'inconclusive';
}

// ---------------------------------------------------------------------------
// PCOS — Rotterdam
// ---------------------------------------------------------------------------
export interface RotterdamResult {
  ovulatoryDysfunction: boolean;
  hyperandrogenism: boolean;
  pcom: boolean;
  met: number;
  criteriaMet: boolean;
}

export function rotterdam(input: {
  cycleRegularity?: string | null; cycleLengthDays?: number | null;
  clinicalHyperandrogenism?: boolean | null; biochemicalHyperandrogenism?: boolean | null;
  follicleCounts?: Array<number | null | undefined>; ovaryVolumesMl?: Array<number | null | undefined>;
}): RotterdamResult {
  const ovulatoryDysfunction = input.cycleRegularity === 'irregular' || input.cycleRegularity === 'absent'
    || (input.cycleLengthDays != null && (input.cycleLengthDays > 35 || input.cycleLengthDays < 21));
  const hyperandrogenism = !!input.clinicalHyperandrogenism || !!input.biochemicalHyperandrogenism;
  const pcom = (input.follicleCounts ?? []).some((c) => c != null && c >= 20)
    || (input.ovaryVolumesMl ?? []).some((v) => v != null && v >= 10);
  const met = [ovulatoryDysfunction, hyperandrogenism, pcom].filter(Boolean).length;
  return { ovulatoryDysfunction, hyperandrogenism, pcom, met, criteriaMet: met >= 2 };
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------
export interface GynAlertInput {
  ageYears: number;
  menopauseStatus?: string | null;
  complaints?: string[];
  endometrialThicknessMm?: number | null;
  iota?: IotaResult | null;
  rotterdam?: RotterdamResult | null;
  popStage?: number | null;
  painScore?: number | null;
  bp?: { systolic: number | null; diastolic: number | null } | null;
  screening?: ScreeningStatus | null;
  pendingHistology?: number;
}

export function gynAlerts(i: GynAlertInput): ClinicalAlert[] {
  const out: ClinicalAlert[] = [];
  const c = new Set(i.complaints ?? []);
  const post = i.menopauseStatus === 'postmenopausal' || i.menopauseStatus === 'surgical';
  const et = i.endometrialThicknessMm;
  if (c.has('pmb') || (post && c.has('aub'))) {
    if (et != null && et > 4) out.push({ code: 'pmb_thick_endometrium', severity: 'critical', values: { et } });
    else if (et != null) out.push({ code: 'pmb_thin_endometrium', severity: 'info', values: { et } });
    else out.push({ code: 'pmb_needs_assessment', severity: 'warning' });
  } else if (post && et != null && et > 11) {
    out.push({ code: 'asymptomatic_thick_endometrium', severity: 'warning', values: { et } });
  }
  if (c.has('aub') && !post && i.ageYears >= 45) out.push({ code: 'aub_45_sampling', severity: 'warning' });
  if (c.has('postcoital_bleeding')) out.push({ code: 'postcoital_bleeding', severity: 'warning' });
  if (i.iota === 'malignant') out.push({ code: 'iota_malignant', severity: 'critical' });
  else if (i.iota === 'inconclusive') out.push({ code: 'iota_inconclusive', severity: 'warning' });
  if (i.screening === 'action_needed') out.push({ code: 'screening_action', severity: 'warning' });
  else if (i.screening === 'overdue' || i.screening === 'never') out.push({ code: 'screening_overdue', severity: 'info' });
  if (i.pendingHistology) out.push({ code: 'histology_pending', severity: 'info', values: { n: i.pendingHistology } });
  if (i.rotterdam?.criteriaMet) out.push({ code: 'pcos_criteria', severity: 'info', values: { n: i.rotterdam.met } });
  if (i.popStage != null && i.popStage >= 2) out.push({ code: 'prolapse_stage', severity: 'info', values: { stage: i.popStage } });
  if (i.painScore != null && i.painScore >= 7) out.push({ code: 'severe_pain', severity: 'warning', values: { score: i.painScore } });
  if (i.bp?.systolic != null && i.bp.diastolic != null && (i.bp.systolic >= 140 || i.bp.diastolic >= 90)) {
    out.push({ code: 'gyn_hypertension', severity: 'warning', values: { bp: `${i.bp.systolic}/${i.bp.diastolic}` } });
  }
  return out;
}

export const PALM_COEIN = ['P', 'A', 'L-SM', 'L-O', 'M', 'C', 'O', 'E', 'I', 'N'] as const;
export const FIGO_FIBROID_TYPES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '2-5'] as const;
export const GYN_COMPLAINTS = [
  'aub', 'pmb', 'amenorrhea', 'pelvic_pain', 'dysmenorrhea', 'discharge', 'pelvic_mass', 'prolapse', 'incontinence',
  'menopause_symptoms', 'hirsutism_acne', 'contraception', 'screening', 'infertility', 'dyspareunia', 'postcoital_bleeding',
  'breast', 'other',
] as const;
