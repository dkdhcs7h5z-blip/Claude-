# Gynecology module — clinical specification

Every rule the gynecology module applies, with its source, for review by the clinical lead. All logic lives in `src/clinical/gynecology.ts` (pure functions, unit-tested in `gynecology.test.ts`); data integrity is enforced in `supabase/migrations/…0009_gynecology.sql` and tested in `supabase/tests/gynecology_tests.sql`.

> **Decision support, not decision making.** Every recommendation is a prompt the clinician confirms; nothing is changed automatically. Screening intervals differ between national programmes — adapt the defaults below.

## 1. Records

| Record | Contents |
|---|---|
| Gynecological history (1 per patient) | menarche, cycle length/duration/regularity, flow, dysmenorrhoea, menopausal status & age, HRT, contraception, sexual activity, HPV vaccination, hysterectomy, previous surgery |
| Visit (signed like all encounters) | complaints, **FIGO PALM-COEIN** AUB classification, LMP, pain score, BP/weight/height, abdominal/speculum/bimanual findings, uterus size, adnexal & cervical-motion tenderness, **POP-Q stage**, clinical/biochemical hyperandrogenism, diagnosis, assessment & plan |
| Pelvic ultrasound | route, uterine dimensions & position, endometrial thickness & appearance, **fibroids by FIGO type (0–8, 2–5)**, ovarian volumes & follicle counts, adnexal mass with **IOTA B/M features**, free fluid |
| Cervical screening | cytology / primary HPV / co-test, HPV genotype, **Bethesda** cytology, pending → resulted, confirmed next step & due date |
| Colposcopy | transformation zone type, findings (IFCPC grade), biopsy, histology (CIN 1–3, AIS, invasive), treatment |
| Procedures | 18 gynecological procedures, approach, anaesthesia, blood loss, complications with **Clavien-Dindo** grade, histology tracking (not sent → pending → received) |

## 2. Cervical screening — next step

Simplified from the ASCCP 2019 risk-based management guidelines with USPSTF 2018 intervals:

| Result | Suggested next step |
|---|---|
| Squamous cell carcinoma / adenocarcinoma | Urgent gynae-oncology referral |
| Unsatisfactory | Repeat in 2–4 months |
| AGC | Colposcopy (+ endometrial sampling if ≥ 35) |
| HSIL | Colposcopy — consider expedited treatment (≥ 25) |
| ASC-H | Colposcopy |
| HPV 16 and/or 18 (any cytology) | Colposcopy |
| LSIL, HPV negative | Repeat co-test in 1 year |
| LSIL, HPV positive or untested | Colposcopy |
| ASC-US, HPV negative / positive / untested | Repeat in 3 years / colposcopy / reflex HPV or repeat in 1 year |
| Other hrHPV, NILM | Repeat co-test in 1 year (HPV-primary without cytology → triage) |
| Negative, cytology | Routine recall 3 years |
| Negative, HPV-primary / co-test, age ≥ 30 | Routine recall 5 years |
| Negative, < 21 · ≥ 65 · total hysterectomy | Not indicated · may exit · stop |

**Screening status** (worklist and patient tab): *action needed* (colposcopy recommended and none done since the sample), *result pending*, *overdue* (due date passed, or > 3 years with no due date), *never screened*, *due soon* (≤ 60 days), *up to date*, *not applicable* (< 21, > 65 without recall, total hysterectomy).

## 3. Decision-support alerts

| Alert | Rule | Source |
|---|---|---|
| PMB with ET > 4 mm | endometrial sampling (critical) | ACOG CO 734 |
| PMB with ET ≤ 4 mm | low risk; sample if bleeding persists | ACOG CO 734 |
| PMB, no ultrasound yet | TVUS and/or sampling | — |
| Asymptomatic postmenopausal ET > 11 mm | consider sampling | SRU consensus |
| AUB at ≥ 45 (premenopausal) | endometrial sampling | ACOG PB 128, NICE NG88 |
| Postcoital bleeding | cervical assessment | — |
| IOTA Simple Rules | any M & no B → malignant (critical, gynae-oncology); any B & no M → benign; otherwise inconclusive → expert US / O-RADS | Timmerman 2008 |
| PCOS (Rotterdam, 2 of 3) | oligo/anovulation (irregular/absent cycles or cycle < 21 / > 35 d) · clinical or biochemical hyperandrogenism · PCOM ≥ 20 follicles per ovary or volume ≥ 10 mL; shown with the exclusion reminder | 2023 International PCOS Guideline |
| Screening action / overdue, pending histology, POP-Q ≥ 2, pain ≥ 7/10, BP ≥ 140/90 | as labelled | — |

## 4. Laboratory results (shared with all specialties)

`lab_results` stores each value **with the reporting laboratory's reference range** (pre-filled from typical adult female ranges, editable). Flags (low / high / normal) come from the stored range. Panels: reproductive hormones, PCOS/androgens, thyroid, metabolic, tumour markers, anaemia.

| Derived / interpretation | Rule | Source |
|---|---|---|
| Free androgen index | testosterone (nmol/L) × 100 / SHBG (nmol/L), SHBG within 30 days | — |
| LH : FSH ratio | same-day LH / FSH | — |
| Biochemical hyperandrogenism | testosterone above range or FAI ≥ 5 (default) — **feeds the Rotterdam PCOS criteria** | 2023 PCOS guideline |
| Premature ovarian insufficiency | age < 40, FSH > 25 IU/L twice ≥ 4 weeks apart (single value → repeat) | ESHRE 2016 |
| Hyperprolactinaemia · TSH high/low | above / outside the lab range | — |
| Diabetes / prediabetes range | HbA1c ≥ 6.5 % or FPG ≥ 7.0 · HbA1c 5.7–6.4 % or FPG 5.6–6.9 mmol/L | ADA |
| Anaemia · iron deficiency | Hb < 12 g/dL (< 8 critical) · ferritin < 30 µg/L | WHO · NICE NG88 |
| CA-125 raised | > 35 U/mL (used in RMI / ROMA) | — |

## 5. Questionnaires

- **Menopause Rating Scale** (Heinemann 2004): 11 items 0–4, total & subscales computed by the database. Total 0–4 none/little · 5–8 mild · 9–16 moderate · ≥ 17 severe; somatic, psychological and urogenital bands per the MRS manual. Alerts: severe total; severe psychological subscale → mood assessment.
- **ICIQ-UI Short Form** (Avery 2004): frequency 0–5 + amount 0/2/4/6 + interference 0–10 = 0–21 (computed by the database). Severity (Klovning 2009): 1–5 slight · 6–12 moderate · 13–18 severe · 19–21 very severe. Type from Q6: stress (cough/sneeze, activity), urge (before reaching the toilet), mixed. *Leaks all the time* → consider fistula.

## 6. Ovarian-mass risk

| Tool | Implementation |
|---|---|
| **RMI I** (Jacobs 1990) | U × M × CA-125; U = 0/1/3 for 0/1/≥ 2 of multilocular, solid areas, bilateral, ascites, metastases; M = 1 pre / 3 postmenopausal. **RMI ≥ 200 → gynae-oncology** (RCOG GTG 34/62). Computed live from the ultrasound and the latest CA-125. |
| **ROMA** (Moore 2009) | logistic equations for pre/postmenopausal women from HE4 and CA-125. Cut-offs are **assay-specific**; defaults are Abbott ARCHITECT (7.4 % / 25.3 %) and can be changed in `ROMA_CUTOFFS`. |
| **O-RADS US** (ACR v2022) | category 0–5 **assigned by the clinician** from the lexicon; the system shows the risk band (0 %, < 1 %, 1–< 10 %, 10–< 50 %, ≥ 50 %) and management. Automatic O-RADS classification is deliberately not implemented — the rule set has many lesion-specific branches and a silent misclassification would be worse than a manual category. |

Alerts: O-RADS 5 (critical), O-RADS 4, RMI ≥ 200 (critical), ROMA above cut-off.

## 7. Data integrity (database)

Visit links immutable and **signed visits read-only**; PALM-COEIN, complaint, IOTA, FIGO, Bethesda and HPV values restricted to valid codes; LMP not after the visit; menopause age only with a postmenopausal status (NULL-safe); IOTA features only when a mass is recorded; screening result must match the test type before it can be marked resulted; dates not in the future; colposcopy may only link to the same patient's screening; histology requires a biopsy or excision; procedure histology result only when received; surgeon defaults to the recording clinician; recording history or a visit tags the patient with *gynecology*. Every table is under RLS (clinical permissions, private visits hidden with their encounter) and the audit log.

Labs, MRS and ICIQ records are under the same RLS and audit; lab values must be non-negative with an ordered reference range and a non-future date; MRS needs all 11 items 0–4; ICIQ amount must be 0/2/4/6; O-RADS and RMI features only with a recorded adnexal mass.

## Not yet included

Automatic O-RADS classification · PFDI-20 / PISQ questionnaires · lab import from analysers (HL7) · per-programme screening configuration.
