# Roadmap

## Phase 1 — Foundation ✅
Authentication · per-clinic RBAC with hybrid patient-level access · relational schema · RLS + tests · append-only audit · secure document storage · bilingual RTL/LTR UI · responsive shell · PWA scaffold · patient registry, profile and sharing · dashboard · research de-identification · staff management.

## Phase 2 — Specialty workflows
- **Obstetrics ✅ (first iteration):** dating with LMP/US reconciliation and IVF dating · antenatal flow sheet with sign workflow · BP/weight/SFH trends · pre-eclampsia (aspirin) and GDM risk assessment · visit alerts · care schedule · labour & delivery with newborns · pregnancy loss · antenatal worklist. See [OBSTETRICS.md](OBSTETRICS.md).
- **Obstetrics ✅ (second iteration):** high-risk assessment per the clinic card (past vs ongoing factors, suggested level, detection from records, plan & medications) · fetal biometry with Hadlock EFW and centile chart · per-fetus data & chorionicity for multiples · structured postnatal visits with EPDS · partogram · printable bilingual antenatal card.
  *Next:* per-clinic schedule configuration, CTG/NST & BPP, structured lab results.
- **Gynecology ✅:** structured history · visits with PALM-COEIN, POP-Q and hyperandrogenism · cervical screening with next-step support and status tracking · colposcopy & histology · pelvic ultrasound with FIGO fibroids and IOTA Simple Rules · PMB / AUB ≥ 45 / PCOS decision support · procedures with Clavien-Dindo and histology tracking · worklist. See [GYNECOLOGY.md](GYNECOLOGY.md).
- **Gynecology ✅ (second iteration):** shared laboratory results with FAI, LH:FSH and POI / prolactin / thyroid / glycaemia / anaemia interpretation · Menopause Rating Scale · ICIQ-UI SF · ovarian-mass risk (RMI I, ROMA, clinician-assigned O-RADS).
  *Next:* PFDI-20 / PISQ, lab import (HL7), automatic O-RADS once validated against the ACR tables.
- **Infertility & IVF ✅:** couple work-up · WHO 2021 semen analysis with TMSC · AMH/AFC reserve and Bologna criteria · stimulation monitoring with follicle/E2 charts and OHSS, trigger, antagonist, LH, P4 alerts · retrieval · embryology with Gardner grading, PGT and Vienna KPIs · transfer with β-hCG tracking and one-step obstetric registration · cryostorage with consent expiry · worklist. See [FERTILITY.md](FERTILITY.md).
  *Next:* partner as a linked person record, cryostorage chain-of-custody (witnessing, thaw/move log), cumulative live-birth analytics, donor programme.
- **Fetal medicine ✅:** 11–14 week scan with combined-screening risks from validated software, NT centiles and markers · cfDNA tracking · ISUOG anomaly scan with 29-structure checklist, soft markers, cervix and placenta · Doppler with MCA PSV MoM, CPR, FGR (Delphi) and Barcelona staging · TTTS Quintero staging · invasive procedures and fetal therapy with results and anti-D · worklist. See [FETAL_MEDICINE.md](FETAL_MEDICINE.md).
  *Next:* fetal echocardiography report, built-in Doppler centile references, printable scan reports, DICOM image attachment.
- Encounter editor with sign/amend workflow UI.

## Phase 3 — Operations
Appointments and scheduling · lab & imaging orders/results (HL7 FHIR) · DICOM viewer for ultrasound · e-prescribing · printable bilingual reports · notifications.

## Phase 4 — Research & intelligence
Cohort builder with k-anonymity checks · governed dataset export · outcome dashboards · clinical decision support and AI models (validated, explainable, human-in-the-loop) · registry submissions.

## Cross-cutting
MFA enforcement UI · offline-capable PWA with encrypted local cache · FHIR API · field-level encryption for national IDs · data retention automation.
