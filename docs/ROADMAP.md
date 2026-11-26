# Roadmap

## Phase 1 — Foundation ✅
Authentication · per-clinic RBAC with hybrid patient-level access · relational schema · RLS + tests · append-only audit · secure document storage · bilingual RTL/LTR UI · responsive shell · PWA scaffold · patient registry, profile and sharing · dashboard · research de-identification · staff management.

## Phase 2 — Specialty workflows
- **Obstetrics ✅ (first iteration):** dating with LMP/US reconciliation and IVF dating · antenatal flow sheet with sign workflow · BP/weight/SFH trends · pre-eclampsia (aspirin) and GDM risk assessment · visit alerts · care schedule · labour & delivery with newborns · pregnancy loss · antenatal worklist. See [OBSTETRICS.md](OBSTETRICS.md).
  *Next:* growth charts & EFW, per-fetus data for multiples, structured postnatal visits, partogram, printable antenatal card.
- **Gynecology:** structured history/exam, cervical screening & colposcopy, AUB work-up, operative notes, menopause.
- **Infertility & IVF:** couple records (partner as linked person), stimulation monitoring charts, oocyte retrieval, embryology lab, transfer, cryostorage inventory with chain of custody.
- **Fetal medicine:** first-trimester combined screening, anomaly scan reporting, growth/Doppler surveillance with centile charts, invasive procedures, multiple pregnancy, fetal therapy.
- Encounter editor with sign/amend workflow UI.

## Phase 3 — Operations
Appointments and scheduling · lab & imaging orders/results (HL7 FHIR) · DICOM viewer for ultrasound · e-prescribing · printable bilingual reports · notifications.

## Phase 4 — Research & intelligence
Cohort builder with k-anonymity checks · governed dataset export · outcome dashboards · clinical decision support and AI models (validated, explainable, human-in-the-loop) · registry submissions.

## Cross-cutting
MFA enforcement UI · offline-capable PWA with encrypted local cache · FHIR API · field-level encryption for national IDs · data retention automation.
