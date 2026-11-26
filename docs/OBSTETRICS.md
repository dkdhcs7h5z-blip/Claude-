# Obstetrics module — clinical specification

This document lists every clinical rule the obstetrics module applies, with its source, so it can be reviewed and adapted by the clinical lead. All rules live in pure, unit-tested functions:

| Rules | Code | Tests |
|---|---|---|
| Dating, GA, EDD, BMI | `src/clinical/obstetrics.ts` | `obstetrics.test.ts`, `obstetricRisk.test.ts` |
| Risk assessment & alerts | `src/clinical/obstetricRisk.ts` | `obstetricRisk.test.ts` |
| Care schedule | `src/clinical/antenatalSchedule.ts` | `obstetricRisk.test.ts` |

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

## 5. Care schedule (defaults — adapt to local protocol)

| Item | Window | Condition |
|---|---|---|
| Booking visit | by 10+0 | — |
| Early glucose testing | by 14+0 | previous GDM |
| Dating / NT scan | 11+0 – 13+6 | — |
| Start low-dose aspirin | 12+0 – 16+0 | aspirin criteria met |
| Anomaly scan | 18+0 – 22+0 | — |
| OGTT | 24+0 – 28+0 | GDM indication |
| Tdap vaccine | 27+0 – 36+0 | — |
| Anti-D prophylaxis | 28+0 – 28+6 | Rh negative |
| Confirm presentation | 36+0 – 36+6 | — |
| GBS screening | 36+0 – 37+6 | — |
| Term review | 40+0 – 40+6 | — |
| Post-dates review / discuss induction | 41+0 – 41+6 | — |

Status is `done` when a matching record exists (recorded NT/dating or anomaly scan), otherwise `due`, `upcoming` or `window passed` relative to today's GA. "Window passed" asks the clinician to confirm — the system does not assume an item was missed.

## 6. Data integrity (enforced by the database)

- One ongoing pregnancy per patient; an ongoing pregnancy must be dated; P + A ≤ G.
- A visit is an obstetric encounter + typed vitals created atomically; it inherits the encounter's privacy and becomes read-only once signed (corrections are amendments). Only roles with `clinical.sign` sign.
- Plausibility ranges on every measurement (e.g. SBP 50–260, SBP > DBP, Apgar 0–10, birth weight 200–7000 g); visit and delivery dates cannot be in the future.
- A delivery record requires GA ≥ 20+0 (earlier losses are recorded as miscarriage/ectopic/termination), the number of newborns must equal the plurality, a pre-labour CS must be a caesarean mode, and recording it closes the pregnancy. One delivery per pregnancy.
- Registering a pregnancy tags the patient with the obstetrics specialty.
- All obstetric tables are covered by RLS and the audit log; 35 dedicated database tests in `supabase/tests/obstetrics_tests.sql`.

## Not yet included (next obstetrics iteration)

Customised / population growth charts (e.g. INTERGROWTH-21st) and EFW from biometry · per-fetus measurements for multiples · structured postnatal visits · partogram · printable antenatal card and discharge summary · configurable schedule per clinic.
