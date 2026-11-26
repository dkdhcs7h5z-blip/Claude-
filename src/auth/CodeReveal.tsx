import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, KeyRound } from 'lucide-react';
import { Alert, Button, Modal } from '@/components/ui';

/** Shows a newly issued login code once, with a copy button. */
export function CodeReveal({ code, title, onClose }: { code: string; title: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      // clipboard refused: select the text so it can be copied by hand
      const sel = window.getSelection();
      if (ref.current && sel) { const r = document.createRange(); r.selectNodeContents(ref.current); sel.removeAllRanges(); sel.addRange(r); }
    }
  };
  return (
    <Modal open onClose={onClose} title={title}
      footer={<Button onClick={onClose}>{t('team.code.saved')}</Button>}>
      <div className="flex flex-col items-center gap-3 py-2">
        <KeyRound className="h-8 w-8 text-brand-700" aria-hidden />
        <p ref={ref} dir="ltr" className="select-all rounded-lg bg-slate-100 px-4 py-3 font-mono text-xl font-semibold tracking-wider text-slate-900 sm:text-2xl"
          data-testid="issued-code">{code}</p>
        <Button variant="secondary" icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} onClick={() => void copy()}>
          {copied ? t('team.code.copied') : t('team.code.copy')}
        </Button>
      </div>
      <Alert tone="warning">{t('team.code.shownOnce')}</Alert>
    </Modal>
  );
}
