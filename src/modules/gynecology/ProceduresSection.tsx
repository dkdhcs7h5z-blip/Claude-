import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { api } from '@/data';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Textarea } from '@/components/ui';
import type { GynProcedure, Patient } from '@/data/types';
import { todayIso } from '@/clinical/obstetrics';
import { formatDate, profileName } from '@/lib/format';
import { useLang, useProfiles } from '@/lib/queries';
import { num, orNull } from '@/modules/obstetrics/formUtils';
import { EnumField, NumField } from './fields';

const PROCEDURES = ['diagnostic_hysteroscopy', 'operative_hysteroscopy', 'polypectomy', 'endometrial_biopsy', 'd_and_c', 'iud_insertion', 'iud_removal',
  'diagnostic_laparoscopy', 'ovarian_cystectomy', 'oophorectomy', 'salpingectomy', 'myomectomy', 'hysterectomy', 'lletz', 'cone_biopsy', 'colporrhaphy',
  'sling', 'endometriosis_excision', 'other'];
const histTone = { not_sent: 'slate', pending: 'violet', received: 'green' } as const;

export function ProceduresSection({ patient, procedures, canWrite }: { patient: Patient; procedures: GynProcedure[]; canWrite: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { byId } = useProfiles();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [histFor, setHistFor] = useState<GynProcedure | null>(null);
  const [hist, setHist] = useState('');
  const [error, setError] = useState<string | null>(null);
  const saveHist = useMutation({
    mutationFn: () => api.updateGynProcedure(histFor!.id, { histology_status: 'received', histology_result: hist }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['gyn', patient.id] }); void qc.invalidateQueries({ queryKey: ['gyn-worklist'] }); setHistFor(null); setHist(''); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Card title={t('gyn.procedure.title')} bodyClassName="p-0"
      actions={canWrite && <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>{t('gyn.procedure.new')}</Button>}>
      {!procedures.length ? <EmptyState title={t('gyn.procedure.none')} /> : (
        <ul className="divide-y divide-slate-100">
          {[...procedures].reverse().map((p) => (
            <li key={p.id} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">
                  {t(`gyn.procedureV.${p.procedure_code}`)}{p.approach && <span className="font-normal text-slate-500"> · {t(`gyn.approachV.${p.approach}`)}</span>}
                </p>
                <div className="flex items-center gap-2">
                  {p.clavien_dindo && p.clavien_dindo !== 'none' && <Badge tone="amber">Clavien-Dindo {p.clavien_dindo}</Badge>}
                  <Badge tone={histTone[p.histology_status]}>{t('gyn.procedure.histologyStatus')}: {t(`gyn.histologyStatusV.${p.histology_status}`)}</Badge>
                </div>
              </div>
              <p className="text-xs text-slate-500">{formatDate(p.performed_at, lang)} · {t('gyn.procedure.surgeon')}: {profileName(byId.get(p.surgeon_id ?? ''), lang)}</p>
              {p.indication && <p className="mt-1 text-sm text-slate-700"><span className="text-slate-500">{t('gyn.procedure.indication')}:</span> {p.indication}</p>}
              {p.findings && <p className="text-sm text-slate-700"><span className="text-slate-500">{t('gyn.procedure.findings')}:</span> {p.findings}</p>}
              {p.histology_result && <p className="text-sm font-medium text-slate-800"><span className="font-normal text-slate-500">{t('gyn.procedure.histologyResult')}:</span> {p.histology_result}</p>}
              {canWrite && p.histology_status === 'pending' && (
                <Button className="mt-2" size="sm" variant="secondary" onClick={() => { setError(null); setHistFor(p); }}>{t('gyn.procedure.updateHistology')}</Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && <ProcedureModal patient={patient} onClose={() => setOpen(false)} />}
      {histFor && (
        <Modal open onClose={() => setHistFor(null)} title={t('gyn.procedure.updateHistology')}
          footer={<><Button variant="secondary" onClick={() => setHistFor(null)}>{t('common.cancel')}</Button><Button loading={saveHist.isPending} disabled={!hist.trim()} onClick={() => saveHist.mutate()}>{t('common.save')}</Button></>}>
          {error && <Alert tone="error">{error}</Alert>}
          <p className="text-sm text-slate-600">{t(`gyn.procedureV.${histFor.procedure_code}`)} · {formatDate(histFor.performed_at, lang)}</p>
          <Field label={t('gyn.procedure.histologyResult')}><Textarea value={hist} onChange={(e) => setHist(e.target.value)} /></Field>
        </Modal>
      )}
    </Card>
  );
}

function ProcedureModal({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ date: todayIso(), code: '', approach: '', indication: '', findings: '', anesthesia: '', ebl: '', complications: '', clavien: 'none', histology: 'not_sent', assistant: '', notes: '' });
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: () => api.recordGynProcedure(patient.id, {
      performed_at: f.date, procedure_code: f.code, approach: orNull(f.approach), indication: orNull(f.indication), findings: orNull(f.findings),
      surgeon_id: null, assistant: orNull(f.assistant), anesthesia: orNull(f.anesthesia), blood_loss_ml: num(f.ebl), complications: orNull(f.complications),
      clavien_dindo: orNull(f.clavien), histology_status: f.histology as GynProcedure['histology_status'], histology_result: null, notes: orNull(f.notes),
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['gyn', patient.id] }); void qc.invalidateQueries({ queryKey: ['gyn-worklist'] }); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Modal wide open onClose={onClose} title={t('gyn.procedure.new')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.isPending} disabled={!f.code} onClick={() => { setError(null); save.mutate(); }}>{t('common.save')}</Button></>}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label={t('gyn.procedure.date')}><Input type="date" dir="ltr" value={f.date} max={todayIso()} onChange={(e) => set('date')(e.target.value)} /></Field>
        <EnumField label={t('gyn.procedure.procedure')} value={f.code} onChange={set('code')} values={PROCEDURES} ns="gyn.procedureV" />
        <EnumField label={t('gyn.procedure.approach')} value={f.approach} onChange={set('approach')} values={['office', 'hysteroscopic', 'laparoscopic', 'robotic', 'open', 'vaginal']} ns="gyn.approachV" />
        <EnumField label={t('gyn.procedure.anesthesia')} value={f.anesthesia} onChange={set('anesthesia')} values={['none', 'local', 'sedation', 'regional', 'general']} ns="gyn.anesthesiaV" />
        <NumField label={t('gyn.procedure.ebl')} value={f.ebl} onChange={set('ebl')} max={20000} />
        <EnumField label={t('gyn.procedure.histologyStatus')} value={f.histology} onChange={set('histology')} values={['not_sent', 'pending']} ns="gyn.histologyStatusV" empty={false} />
      </div>
      <Field label={t('gyn.procedure.indication')}><Input value={f.indication} onChange={(e) => set('indication')(e.target.value)} /></Field>
      <Field label={t('gyn.procedure.findings')}><Textarea value={f.findings} onChange={(e) => set('findings')(e.target.value)} /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2"><Field label={t('gyn.procedure.complications')}><Input value={f.complications} onChange={(e) => set('complications')(e.target.value)} /></Field></div>
        <EnumField label={t('gyn.procedure.clavien')} value={f.clavien} onChange={set('clavien')} values={['none', 'I', 'II', 'IIIa', 'IIIb', 'IVa', 'IVb', 'V']} ns="gyn.clavienV" empty={false} />
      </div>
      <Field label={t('gyn.procedure.assistant')}><Input value={f.assistant} onChange={(e) => set('assistant')(e.target.value)} /></Field>
    </Modal>
  );
}
