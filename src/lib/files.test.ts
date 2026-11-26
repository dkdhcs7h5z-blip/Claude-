import { describe, expect, it } from 'vitest';
import { buildStoragePath, formatBytes, sanitizeFileName } from './files';

describe('file helpers', () => {
  it('sanitizes file names and keeps Arabic letters', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd')
    expect(sanitizeFileName('C:\\\\x\\\\.hidden')).toBe('hidden');
    expect(sanitizeFileName('تقرير الموجات.PDF')).toBe('تقرير-الموجات.pdf');
    expect(sanitizeFileName('a b(1).jpeg')).toBe('a-b-1.jpeg');
  });
  it('builds the storage path convention', () => {
    expect(buildStoragePath('c', 'p', 'x y.pdf', 'id')).toBe('c/p/id-x-y.pdf');
  });
  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
  });
});
