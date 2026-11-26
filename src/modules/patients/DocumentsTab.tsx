import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileText, Lock, Upload, ExternalLink, Archive, ShieldCheck } from 'lucide-react';
import { api } from '@/data';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Select, Spinner } from '@/components/ui';
import { DOCUMENT_CATEGORIES, type DocumentCategory, type Patient } from '@/data/types';
import { formatBytes, MAX_UPLOAD_BYTES } from '@/lib/files';
import { formatDate, profileName } from '@/lib/format';
import { useLang, useProfiles } from '@/lib/queries';

export function DocumentsTab({ patient, canUpload, canArchive }: { patient: Patient; canUpload: boolean; canArchive: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const { byId } = useProfiles();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<DocumentCategory>('report');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const docs = useQuery({ queryKey: ['documents', patient.id], queryFn: () => api.listDocuments(patient.id) });

  const upload = useMutation({
    mutationFn: () => api.uploadDocument(patient, file!, { category, description, is_private: isPrivate }),
    onSuccess: () => {
      setFile(null); setDescription(''); setIsPrivate(false);
      if (fileRef.current) fileRef.current.value = '';
      void qc.invalidateQueries({ queryKey: ['documents', patient.id] });
    },
    onError: (e) => setError((e as Error).message),
  });

  const archive = useMutation({
    mutationFn: (id: string) => api.archiveDocument(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['documents', patient.id] }),
    onError: (e) => setError((e as Error).message),
  });

  const open = async (docId: string) => {
    const doc = docs.data?.find((d) => d.id === docId);
    if (!doc) return;
    try {
      const url = await api.getDocumentUrl(doc);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <Alert tone="info"><span className="inline-flex items-center gap-1"><ShieldCheck className="h-4 w-4" />{t('documents.secureNote')}</span></Alert>
      {error && <Alert tone="error">{error}</Alert>}

      {canUpload && (
        <Card title={t('documents.upload')}>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => {
            e.preventDefault(); setError(null);
            if (!file) return;
            if (file.size > MAX_UPLOAD_BYTES) { setError(t('documents.tooLarge')); return; }
            upload.mutate();
          }}>
            <Field label={t('documents.fileName')} required>
              <input ref={fileRef} type="file" required onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.tif,.tiff,.dcm,.txt,.doc,.docx"
                className="block w-full text-sm text-slate-600 file:me-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100" />
            </Field>
            <Field label={t('documents.category')}>
              <Select value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
                {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{t(`documents.categories.${c}`)}</option>)}
              </Select>
            </Field>
            <Field label={t('documents.description')}>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
            </Field>
            <div className="flex items-end">
              <Checkbox label={t('documents.private')} help={t('documents.privateHelp')} checked={isPrivate} onChange={setIsPrivate} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" loading={upload.isPending} disabled={!file} icon={<Upload className="h-4 w-4" />}>
                {upload.isPending ? t('documents.uploading') : t('documents.upload')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card title={t('documents.title')} bodyClassName="p-0">
        {docs.isLoading ? <Spinner /> : !docs.data?.length ? <EmptyState icon={<FileText className="h-10 w-10" />} title={t('documents.none')} /> : (
          <ul className="divide-y divide-slate-100">
            {docs.data.map((d) => (
              <li key={d.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex min-w-0 items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800" dir="auto">{d.file_name}</p>
                    <p className="text-xs text-slate-500">
                      {t(`documents.categories.${d.category}`)} · {formatBytes(d.size_bytes)} · {formatDate(d.uploaded_at, lang)} · {profileName(byId.get(d.uploaded_by), lang)}
                    </p>
                    {d.description && <p className="text-xs text-slate-600">{d.description}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {d.is_private && <Badge tone="amber" icon={<Lock className="h-3 w-3" />}>{t('patients.private')}</Badge>}
                  <Button size="sm" variant="secondary" icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => void open(d.id)}>{t('documents.open')}</Button>
                  {canArchive && (
                    <Button size="sm" variant="ghost" icon={<Archive className="h-3.5 w-3.5" />}
                      onClick={() => confirm(t('common.confirm') + '?') && archive.mutate(d.id)}>{t('common.archive')}</Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
