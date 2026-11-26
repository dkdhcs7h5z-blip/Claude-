# Infertility & reproductive medicine module — clinical specification

Every rule the module applies, with its source, for review by the clinical and laboratory leads. Logic lives in `src/clinical/fertility.ts` (pure functions, unit-tested in `fertility.test.ts`); data integrity is enforced in `supabase/migrations/…0011_fertility.sql` and tested in `supabase/tests/fertility_tests.sql`.

> **Decision support, not decision making.** Alerts are prompts; nothing is triggered, frozen or transferred automatically. Thresholds below are guideline defaults — laboratories should calibrate them to their own assays and KPIs.

## 1. Records

| Record | Contents |
|---|---|
| Couple work-up (1 per patient) | primary/secondary, duration, female factors, male factor, tubal assessment & method (HSG/HyCoSy/laparoscopy), partner name/DOB/phone/blood group, previous treatments |
| Semen analysis | sample type, abstinence, volume, concentration, progressive & total motility, morphology, vitality, pH, leukocytes, DNA fragmentation; **total count and TMSC are generated columns** |
| Treatment cycle | type (natural, OI, IUI, IVF, ICSI, FET, oocyte freezing), auto-numbered per patient, protocol, starting dose, gonadotropin, insemination, sperm source, trigger type & time, retrieval (oocytes, MII, 2PN), freeze-all & reason, cancellation reason, status |
| Stimulation monitoring | date, stimulation day, follicle sizes per ovary (2–40 mm), E2, LH, P4, endometrium, FSH dose, antagonist given |
| Embryo | number, day, stage, cleavage (cells, fragmentation 1–4) or **Gardner** blastocyst grade (expansion 1–6, ICM, TE — only for blastocysts), PGT result, status, vitrification date, storage location, storage-consent expiry |
| Embryo transfer | date, fresh/frozen, selected embryos (must belong to the patient and be available; they become *transferred*), embryo day, endometrium, difficulty, β-hCG, sacs, hearts, outcome, linked obstetric pregnancy |

Integrity rules (database-enforced): MII ≤ oocytes, 2PN ≤ MII; a frozen embryo needs a date and location; fetal hearts ≤ sacs; clinical/ongoing pregnancy needs ≥ 1 sac; β-hCG after the transfer; embryo links are immutable once recorded.

## 2. Semen analysis — WHO 2021 (6th edition) lower reference limits

| Parameter | Limit | Finding below limit |
|---|---|---|
| Volume | 1.4 mL | low volume |
| Concentration / total count | 16 ×10⁶/mL / 39 ×10⁶ | oligozoospermia (0 = azoospermia) |
| Progressive / total motility | 30 % / 42 % | asthenozoospermia |
| Normal forms | 4 % | teratozoospermia |
| Vitality | 54 % | low vitality |
| Leukocytes | ≥ 1 ×10⁶/mL | leukocytospermia |
| DNA fragmentation | > 30 % | high DFI |

**TMSC** = volume × concentration × progressive %. IUI suitability: ≥ 10 M suitable, 5–10 M borderline, < 5 M unlikely (consider IVF/ICSI).

## 3. Ovarian reserve and expected response

- AMH (ng/mL): < 0.5 very low · < 1.1 low · 1.1–3.5 normal · > 3.5 high. AMH is taken from the latest lab result.
- AFC: < 5 very low · 5–7 low · 8–15 normal · ≥ 16 high. AFC = follicles 2–10 mm on the latest baseline scan (stim day ≤ 2).
- **Bologna criteria** (ESHRE 2011): poor responder if ≥ 2 of: age ≥ 40 (or other risk factor), previous poor response (≤ 3 oocytes), abnormal reserve (AFC < 7 or AMH < 1.1).
- Expected response: hyper if AMH > 3.5 or AFC ≥ 16 (OHSS risk); poor if AMH < 1.1 or AFC < 7.

## 4. Stimulation monitoring alerts

| Alert | Rule |
|---|---|
| OHSS risk (critical) | ≥ 18 follicles ≥ 11 mm or E2 ≥ 12,850 pmol/L (≈ 3,500 pg/mL) — consider agonist trigger / freeze-all (ESHRE 2019) |
| Trigger criteria met | ≥ 3 follicles ≥ 17 mm, not yet triggered |
| Start antagonist | antagonist protocol, leading follicle ≥ 14 mm, antagonist not given |
| Premature LH rise | LH ≥ 10 IU/L before trigger in non-down-regulated protocols |
| Elevated progesterone | P4 > 4.77 nmol/L (1.5 ng/mL) — consider freeze-all |
| Thin endometrium | < 7 mm with leading follicle ≥ 14 mm |

Charts: leading and 3rd-largest follicle (17 mm reference line) and E2 by stimulation day.

## 5. Embryology

- Grade: Gardner `expansion + ICM + TE` (e.g. 4AA) for blastocysts; `cells c F fragmentation` for cleavage embryos.
- Quality: blastocyst good = expansion ≥ 3 with A in ICM or TE, poor = any C; Day-3 cleavage good = 7–9 cells with fragmentation ≤ 2.
- **Laboratory KPIs (ESHRE/Alpha Vienna consensus 2017)** per cycle, with competence / benchmark: MII rate 75 / 90 %; fertilisation ICSI 65 / 80 %, IVF 60 / 75 %; blastocyst development 40 / 60 %; implantation 35 / 60 %.

## 6. Transfer and outcome

- β-hCG due 9 days after a Day 5–6 transfer, 11 days after an earlier one.
- A clinical or ongoing pregnancy can be registered in obstetrics in one step: the pregnancy form opens pre-filled with IVF dating (transfer date + embryo age), plurality and conception type, and the transfer is linked to the new pregnancy.

## 7. Cryostorage

Inventory of all vitrified embryos the user may see, sorted by consent expiry. Alerts: consent expired, or expiring within 90 days — contact the couple.

## 8. Worklist

Active cycles with stimulation day, follicles ≥ 17 / ≥ 14 mm, E2 and next step (ready to trigger, β-hCG date). Filters: stimulation, ready to trigger, awaiting β-hCG, IUI.

## Sources

WHO laboratory manual for the examination and processing of human semen, 6th ed. (2021) · ESHRE consensus on poor ovarian response — Bologna criteria (Ferraretti 2011) · ESHRE guideline: ovarian stimulation for IVF/ICSI (2019, updated 2025) · Gardner & Schoolcraft blastocyst grading (1999) · ESHRE/Alpha Vienna consensus on IVF laboratory KPIs (2017).
