# Fetal medicine module — clinical specification

Every rule the module applies, with its source, for review by the fetal medicine lead. Logic lives in `src/clinical/fetalMedicine.ts` (pure functions, unit-tested in `fetalMedicine.test.ts`); data integrity is enforced in `supabase/migrations/…0012_fetal_medicine.sql` and tested in `supabase/tests/fetal_medicine_tests.sql`.

> **Decision support, not decision making.** Alerts are prompts for the clinician. Screening risks are **entered from the clinic's validated software** (e.g. the FMF algorithm) and are never recalculated by this system. Doppler centiles are entered as reported by the machine or reference chart.

## 1. Records

All scans share the scan header used by obstetrics (`fetal_assessments`), so a fetal medicine scan also appears in the obstetric record. Each scan has one typed record per fetus (A, B, …, limited to the pregnancy's plurality). GA at the scan is derived from the pregnancy dating.

| Record | Contents |
|---|---|
| 11–14 week scan | CRL, NT, nasal bone, ductus venosus a-wave, tricuspid regurgitation, FHR, PAPP-A and free β-hCG MoM, T21/T18/T13 risks (1:N) with method and software, early anatomy |
| cfDNA | sample date, laboratory, pending → resulted/failed, fetal fraction, T21/T18/T13/sex-chromosome calls, fetal sex |
| Mid-trimester anomaly scan | ISUOG survey of 29 structures in 5 regions (each normal / abnormal / not seen), ventricular atrium, TCD, cisterna magna, nuchal fold, renal pelvis, cervical length, placental site and distance to the os, cord vessels, amniotic fluid, 11 soft markers, sex, anomaly description, conclusion |
| Doppler & surveillance | UA PI (+ centile) and EDF, MCA PI (+ centile) and PSV, **CPR (generated)**, CPR centile, left/right UtA PI, **mean UtA PI (generated)**, UtA centile and notching, DV PI (+ centile) and a-wave, UV pulsations, deepest pocket, bladder, hydrops, demise, CTG; **MCA PSV MoM computed by the database** |
| Procedures | CVS, amniocentesis, cordocentesis, intrauterine transfusion, amnioreduction/-infusion, laser, shunt, FETO, selective reduction; indication, approach, needle, passes, transplacental, anti-D, volume, fetal Hb before/after, complications, tests sent, result (pending → normal/abnormal/failed) |

Integrity rules (database-enforced): a risk needs its method; a "normal" anomaly conclusion requires a complete survey without markers; a suspected anomaly must name a structure or describe it; a structure cannot be both abnormal and not seen; a pending cfDNA carries no results and a resulted one needs T21 and a date; diagnostic sampling must order a test; the transcervical route is for CVS only; fetal Hb only for transfusion or cordocentesis; an abnormal procedure result needs a summary; "none" cannot be combined with complications; records cannot be moved between patients, pregnancies or fetuses.

## 2. First-trimester screening

| Rule | Default | Source |
|---|---|---|
| Maternal-age T21 risk at term | 1 / (1 + e^(7.330 − 4.211 / (1 + e^(−0.282 (age − 37.23))))) | Morris 2002 |
| GA from CRL | 8.052 √CRL + 23.73 days | Robinson & Fleming 1975 |
| Valid CRL for combined screening | 45–84 mm | FMF |
| NT 95th centile | 2.1 mm (CRL 45) → 2.7 mm (CRL 84) | FMF |
| Increased NT | ≥ 3.5 mm → offer diagnostic testing, detailed scan, fetal echo | FMF / ISUOG |
| Higher chance | ≤ 1:150 → offer cfDNA or diagnostic testing | UK NHS FASP |
| Intermediate | 1:151–1:1000 → offer cfDNA (contingent) | Contingent screening |
| Low PAPP-A | < 0.415 MoM → serial growth scans | RCOG GTG 31 |

cfDNA: a high-chance call must be confirmed by CVS/amniocentesis before any irreversible decision; a no-call or failed test prompts counselling (repeat or diagnostic test); a result outstanding > 14 days is flagged.

## 3. Mid-trimester anomaly scan

| Finding | Alert |
|---|---|
| Ventricular atrium ≥ 10 mm | mild 10–12, moderate 12.1–15, severe > 15 (moderate/severe critical) |
| Cisterna magna > 10 mm | posterior fossa assessment |
| Nuchal fold ≥ 6 mm | information |
| Renal pelvis ≥ 4 mm | repeat at 32 weeks (UTD 2014); ≥ 10 mm warning |
| Cervical length ≤ 25 mm before 24+0 | vaginal progesterone or cerclage (NICE NG25) |
| Placental edge < 20 mm from the os | rescan at 32 weeks; covering the os = praevia (RCOG GTG 27a) |
| Single umbilical artery | check kidneys/heart, serial growth |
| Views not obtained | rescan within 2–3 weeks |
| Anomaly suspected | fetal medicine review and counselling |

The form suggests a conclusion from the findings (abnormal → anomaly suspected; not seen → incomplete; markers → soft markers); the clinician confirms.

## 4. Doppler, FGR and TTTS

- **Fetal anaemia:** MCA PSV ≥ 1.5 MoM against Mari 2000 medians (median = e^(2.31 + 0.046 × GA weeks), valid 16–40 weeks).
- **Critical:** UA absent/reversed EDF, DV a-wave absent/reversed, hydrops, pathological CTG, demise.
- **CPR:** low if the CPR centile < 5; when no centile is entered, CPR < 1 is used.
- **FGR definition (Delphi consensus, Gordijn 2016):**
  - Early (< 32 weeks): EFW < 3rd, or UA AEDF, or EFW < 10th with UtA or UA PI > 95th.
  - Late (≥ 32 weeks): EFW < 3rd, or two of the following: EFW < 10th, a fall of more than 2 quartiles (≥ 50 centile points), CPR < 5th or UA PI > 95th.
  - EFW is the latest obstetric biometry for that fetus within 3 weeks (Hadlock). Without it, FGR is "not assessable" unless Doppler alone defines it.
- **Stage and delivery timing (Barcelona, Figueras & Gratacós 2014):**

  | Stage | Criteria | Deliver by |
  |---|---|---|
  | I | FGR with none of the findings below | 37 weeks |
  | II | UA AEDF | 34 weeks |
  | III | UA REDF or DV PI > 95th | 30 weeks |
  | IV | DV a-wave absent/reversed or pathological CTG | 26 weeks |

  An SGA fetus with normal Doppler: 2-weekly growth scans, deliver by 40 weeks.
- **TTTS (Quintero 1999), monochorionic diamniotic only:** donor deepest pocket < 2 cm and recipient > 8 cm. The stage is the highest that applies:

  | Stage | Criteria |
  |---|---|
  | I | Oligo/polyhydramnios sequence only |
  | II | Donor bladder not seen |
  | III | Critically abnormal Doppler in either twin (UA AEDF/REDF, reversed DV a-wave, UV pulsations) |
  | IV | Hydrops |
  | V | Demise |

## 5. Procedures

- Rh-negative, non-sensitised mother: anti-D within 72 h is prompted, and the anti-D field appears only when relevant. A mother with Rh alloimmunisation recorded is shown as sensitised, and anti-D is not prompted.
- CVS before 10+0 or amniocentesis before 15+0 weeks is flagged (RCOG GTG 8).
- Results pending > 21 days and abnormal results are flagged.

## 6. Worklist

Active pregnancies with any fetal medicine record, ranked by urgency:
1. Critical Doppler or TTTS.
2. Higher-chance screening or cfDNA.
3. Suspected anomaly.
4. Abnormal Doppler.
5. Pending results.

Filters: higher chance, abnormal Doppler, anomaly suspected, pending results, multiples.

## Sources

- Morris JK et al. *J Med Screen* 2002.
- Robinson HP, Fleming JE. *BJOG* 1975.
- Nicolaides KH. *The 11–13+6 weeks scan* (FMF).
- UK NHS Fetal Anomaly Screening Programme.
- ISUOG Practice Guidelines: mid-trimester scan (2022).
- Nguyen HT et al. (UTD) 2014.
- NICE NG25.
- RCOG GTG 8, 27a and 31.
- Mari G et al. *NEJM* 2000.
- Gordijn SJ et al. *UOG* 2016.
- Figueras F, Gratacós E. *Fetal Diagn Ther* 2014.
- Quintero RA et al. *J Perinatol* 1999.
