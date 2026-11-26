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
- **Infertility & IVF:** couple records (partner as linked person), stimulation monitoring charts, oocyte retrieval, embryology lab, transfer, cryostorage inventory with chain of custody.
- **Fetal medicine:** first-trimester combined screening, anomaly scan reporting, growth/Doppler surveillance with centile charts, invasive procedures, multiple pregnancy, fetal therapy.
- Encounter editor with sign/amend workflow UI.

## Phase 3 — Operations
Appointments and scheduling · lab & imaging orders/results (HL7 FHIR) · DICOM viewer for ultrasound · e-prescribing · printable bilingual reports · notifications.

## Phase 4 — Research & intelligence
Cohort builder with k-anonymity checks · governed dataset export · outcome dashboards · clinical decision support and AI models (validated, explainable, human-in-the-loop) · registry submissions.

## Cross-cutting
MFA enforcement UI · offline-capable PWA with encrypted local cache · FHIR API · field-level encryption for national IDs · data retention automation.
