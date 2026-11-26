/** Keep only safe filename characters (Arabic letters allowed) and cap length. */
export function sanitizeFileName(input: string): string {
  const name = input.split(/[\\/]/).pop() ?? '';
  const dot = name.lastIndexOf('.');
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'file';
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) : '';
  return ext ? `${base}.${ext}` : base;
}

export function buildStoragePath(clinicId: string, patientId: string, fileName: string, id: string): string {
  return `${clinicId}/${patientId}/${id}-${sanitizeFileName(fileName)}`;
}

export async function sha256Hex(file: Blob): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
