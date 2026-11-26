# Obstetrics module — clinical specification

This document lists every clinical rule the obstetrics module applies, with its source, so it can be reviewed and adapted by the clinical lead. All rules live in pure, unit-tested functions:

| Rules | Code | Tests |
|---|---|---|
| Dating, GA, EDD, BMI | `src/clinical/obstetrics.ts` | `obstetrics.test.ts`, `obstetricRisk.test.ts` |
| Risk assessment & alerts | `src/clinical/obstetricRisk.ts` | `obstetricRisk.test.ts` |
| Care schedule | `src/clinical/antenatalSchedule.ts` | `obstetricRisk.test.ts`, `obstetricExtended.test.ts` |
| High-risk classification | `src/clinical/highRisk.ts` | `obstetricExtended.test.ts` |
| Fetal growth, EFW, multiples | `src/clinical/fetalGrowth.ts` | `obstetricExtended.test.ts` |
| Postnatal alerts | `src/clinical/postnatal.ts` | `obstetricExtended.test.ts` |
| Partogram | `src/clinical/partogram.ts` | `obstetricExtended.test.ts` |

> **Decision support, not decision making.** Alerts and recommendations are guideline defaults that prompt review. They never change a record automatically, and the UI states that clinical judgement and local protocols prevail.

## 1. Dating

| Method | EDD |
|---|---|
| LMP | LMP + 280 days, adjusted by (cycle length − 28) — Naegele's rule |
| Ultrasound | scan date + (280 − GA at scan) |
| IVF transfer | transfer date + (266 − embryo age): day-5 → +261, day-3 → +263 |

**LMP vs ultrasound reconciliation** — ACOG Committee Opinion 700. The pregnancy is re-dated by ultrasound when the difference exceeds:

| GA at scan | Re-date if difference > |
|---|---|
| ≤ 8+6 | 5 days |
| 9+0 – 15+6 | 7 days |
| 16+0 – 21+6 | 10 days |
| 22+0 – 27+6 | 14 days |
| ≥ 28+0 | 21 days |

The final EDD and its basis are stored. **Gestational age is always computed from the stored EDD** — by the database for visits and deliveries (`private.pregnancy_ga_days`) and by the identical TypeScript function in the UI — so every GA shown or stored is consistent.

## 2. Pre-eclampsia — aspirin criteria (NICE NG133)

Low-dose aspirin from 12 weeks until birth is recommended with **≥ 1 high** or **≥ 2 moderate** risk factors.

- **High:** hypertensive disease in a previous pregnancy · chronic kidney disease · autoimmune disease (SLE, antiphospholipid syndrome) · type 1 or 2 diabetes · chronic hypertension.
- **Moderate:** nulliparity (para = 0) · age ≥ 40 · pregnancy interval > 10 years · BMI ≥ 35 at booking · family history of pre-eclampsia · multifetal pregnancy.

Age, parity, BMI and plurality are derived from the record; the rest are coded risk factors.

## 3. Gestational diabetes — screening indication (NICE NG3)

OGTT at 24–28 weeks if any of: BMI > 30 · previous baby ≥ 4.5 kg · previous GDM · first-degree relative with diabetes · family origin with high diabetes prevalence. Previous GDM additionally prompts early testing at booking. Pre-existing diabetes is excluded from screening (managed as diabetes in pregnancy).
*Many services screen universally (WHO 2013 / IADPSG); the UI says to follow local policy.*

## 4. Visit alerts

| Alert | Rule | Severity |
|---|---|---|
| Severe hypertension | SBP ≥ 160 or DBP ≥ 110 | critical |
| Suspected pre-eclampsia | SBP ≥ 140 or DBP ≥ 90 **and** proteinuria ≥ 1+ at ≥ 20 weeks | critical |
| Hypertension | SBP ≥ 140 or DBP ≥ 90 (below severe range) | warning |
| Proteinuria | ≥ 2+ without the pre-eclampsia pattern | warning |
| Glycosuria | ≥ 2+ | warning |
| Absent / reduced fetal movements | from 24 weeks | critical / warning |
| Abnormal FHR | < 110 or > 160 bpm | warning |
| Fundal height discrepancy | singleton, ≥ 24 weeks, SFH outside GA (weeks) ± 2 cm | warning |
| Anaemia | Hb < 11.0 g/dL (< 14 weeks) or < 10.5 g/dL (later) — NICE | warning |
| Severe anaemia | Hb < 7.0 g/dL — WHO | critical |
| Malpresentation | non-cephalic at ≥ 36 weeks | warning |
| Severe oedema | recorded as severe | info |
| Rh negative | patient Rh factor negative | info |
| Post-dates / post-term | GA ≥ 41+0 / ≥ 42+0 | warning / critical |

## 5. High-risk pregnancy assessment (clinic follow-up card, section 2)

Risk factors are recorded in two groups, exactly as on the clinic's antenatal follow-up card:

- **A. Past obstetric & medical history:** prior pre-eclampsia/HTN · prior GDM / pre-existing DM · prior preterm birth · prior FGR · prior stillbirth · recurrent miscarriage · cervical insufficiency/cerclage · prior fetal anomaly/genetic · chronic HTN · renal · thyroid · thrombophilia · autoimmune/APS · prior PPH · prior uterine surgery · previous CS · cardiac · epilepsy.
- **B. Ongoing pregnancy high-risk factors:** gestational HTN/pre-eclampsia · GDM · current FGR/abnormal Doppler · short cervix/threatened PTL · multiple pregnancy (automatic from plurality) · Rh isoimmunisation · placenta praevia/accreta spectrum · oligo/polyhydramnios · suspected fetal anomaly · anticoagulants/low-dose aspirin.
- Plus the CS count, an **active high-risk plan** and **ongoing medications**.

**Suggested risk level** (shown beside the clinician's choice, never applied automatically):
- *High* — any B factor, multiple pregnancy, or a major A factor (prior pre-eclampsia, pre-existing DM, prior preterm birth, prior FGR, prior stillbirth, cervical insufficiency, chronic HTN, renal disease, thrombophilia, autoimmune disease, cardiac disease, prior fetal anomaly).
- *Moderate* — any other recorded factor, or aspirin criteria met.
- *Low* — none.

**Detected from records:** B factors evidenced by data but not ticked are offered with an *Add* button — hypertension at a visit ≥ 20 weeks → GHTN/pre-eclampsia; EFW < 10th centile or absent/reversed UA EDF → FGR/abnormal Doppler; abnormal DVP/AFI → oligo/polyhydramnios; placenta praevia on scan.

## 6. Fetal growth & multiple pregnancy

- **EFW** — Hadlock 4 (HC, AC, FL), computed by the database (`private.hadlock_efw`) and identically in the UI.
- **Centiles** — Hadlock 1991 in-utero weight standard: ln(median) = 0.578 + 0.332·t − 0.00354·t² (t weeks), SD 12.7 % of median, valid 10–40 weeks. Can be swapped for INTERGROWTH-21st / WHO charts in one function.
- **Alerts** — EFW < 3rd (suspected FGR, critical) · < 10th (SGA) · > 90th (LGA) · absent/reversed UA end-diastolic flow (critical) · DVP < 2 cm or AFI < 5 cm · DVP ≥ 8 cm or AFI ≥ 25 cm · low-lying placenta / praevia.
- **Multiples** — biometry per fetus (A, B, C…), per-fetus FHR and presentation at visits, chorionicity on the pregnancy. Twin EFW discordance ≥ 20 % and monochorionic surveillance (fortnightly scans from 16 weeks) follow NICE NG137; missing chorionicity in a multiple pregnancy is flagged.

## 7. Postnatal care

Structured postnatal visits linked to the delivery (BP, temperature, uterus, lochia, wound, feeding, breasts, EPDS, Hb, contraception). Alerts (NICE NG194 / NG133): BP ≥ 160/110 critical, ≥ 140/90 warning · temperature ≥ 38 °C · heavy lochia · offensive lochia or tender uterus · wound infection/dehiscence · mastitis · EPDS ≥ 13 (probable depression), 10–12 (possible) · **any positive EPDS item 10 (self-harm) is critical** · Hb < 10 g/dL.

## 8. Labour & partogram

Append-only labour observations (dilation, descent in fifths, contractions, FHR, liquor, moulding, maternal vitals, oxytocin); errors are flagged *entered in error*, never edited. Classic WHO partograph: active phase from the first dilation ≥ 4 cm, alert line 1 cm/h, action line 4 h to its right (constants `ACTIVE_PHASE_CM`, `ACTION_LINE_OFFSET_H` — change for the WHO 2020 Labour Care Guide). Alerts: action line reached (critical), behind alert line, FHR < 110 / > 160, thick meconium, > 5 contractions per 10 min, temperature ≥ 38 °C, hypertension.

## 9. Printable antenatal card

A4, bilingual, mirroring the clinic card: demographics & obstetric history (G P A L CS), high-risk assessment A/B with tick boxes, risk level, plan and medications, the scan and laboratory protocol with recorded results filled in, the tracking log (with blank rows for handwritten entries), emergency warning signs and patient-care instructions. Every print is written to the audit log (`PRINT`).

## 10. Care schedule (defaults — adapt to local protocol)

| Item | Window | Condition |
|---|---|---|
| Booking visit | by 10+0 | — |
| First-trimester bloods (CBC, group & Rh, FBG, TSH, serology) | by 13+6 | — |
| Early glucose testing | by 14+0 | previous GDM |
| Dating / NT scan | 11+0 – 13+6 | — |
| Start low-dose aspirin | 12+0 – 16+0 | aspirin criteria met |
| Cervical length (TVS) | 16+0 – 24+0 | — |
| Anomaly scan | 18+0 – 22+0 | — |
| Fetal echocardiography | 20+0 – 24+0 | diabetes, prior/suspected anomaly, monochorionic twins, IVF/ICSI |
| OGTT | 24+0 – 28+0 | GDM indication |
| Repeat CBC / Hb | 24+0 – 28+0 | — |
| Tdap vaccine | 27+0 – 36+0 | — |
| Anti-D prophylaxis (after indirect Coombs) | 28+0 – 28+6 | Rh negative |
| Growth & Doppler scans | 28+0 – 38+0 | high-risk pregnancy |
| Pre-delivery bloods (CBC, platelets, coagulation, LFT/KFT) | 34+0 – 37+0 | — |
| Confirm presentation | 36+0 – 36+6 | — |
| GBS screening | 36+0 – 37+6 | — |
| Term review | 40+0 – 40+6 | — |
| Post-dates review / discuss induction | 41+0 – 41+6 | — |

Status is `done` when a matching record exists (recorded NT/dating or anomaly scan), otherwise `due`, `upcoming` or `window passed` relative to today's GA. "Window passed" asks the clinician to confirm — the system does not assume an item was missed.

## 11. Data integrity (enforced by the database)

- One ongoing pregnancy per patient; an ongoing pregnancy must be dated; P + A ≤ G.
- A visit is an obstetric encounter + typed vitals created atomically; it inherits the encounter's privacy and becomes read-only once signed (corrections are amendments). Only roles with `clinical.sign` sign.
- Plausibility ranges on every measurement (e.g. SBP 50–260, SBP > DBP, Apgar 0–10, birth weight 200–7000 g); visit and delivery dates cannot be in the future.
- A delivery record requires GA ≥ 20+0 (earlier losses are recorded as miscarriage/ectopic/termination), the number of newborns must equal the plurality, a pre-labour CS must be a caesarean mode, and recording it closes the pregnancy. One delivery per pregnancy.
- Registering a pregnancy tags the patient with the obstetrics specialty.
- Biometry per scan cannot exceed the plurality; fetus labels are unique per scan; chorionicity only for multiples; CS count ≤ parity; next visit after the visit date.
- Postnatal visits cannot precede the delivery and are immutable once signed. Labour observations require GA ≥ 20 weeks and are append-only.
- All obstetric tables are covered by RLS and the audit log; 72 dedicated database tests in `supabase/tests/obstetrics_tests.sql` and `obstetrics_ext_tests.sql`.

## Not yet included

Configurable schedule per clinic (admin UI) · INTERGROWTH-21st charts as an alternative standard · structured lab results (the lab rows on the printed card are for handwriting until the lab module exists) · CTG/NST and BPP recording · amendment UI for signed visits.
