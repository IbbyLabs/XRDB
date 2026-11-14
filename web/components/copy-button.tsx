'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { copyText } from '@/lib/clipboard';
import { useT } from '@/lib/i18n';

export function CopyButton({ text, label }: { text: string; label: string }) {
  const t = useT();
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const flash = (next: 'copied' | 'failed') => {
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };

  const handleCopy = async () => {
    flash(await copyText(text) ? 'copied' : 'failed');
  };

  const icon = state === 'copied' ? <Check size={13} aria-hidden />
    : state === 'failed' ? <X size={13} aria-hidden />
    : <Copy size={13} aria-hidden />;
  const caption = state === 'copied' ? t('Copied')
    : state === 'failed' ? t('Copy failed')
    : t('Copy');

  return (
    <button
      className={`btn btn-ghost btn-sm${state === 'failed' ? ' btn-danger' : ''}`}
      onClick={() => void handleCopy()}
      aria-label={label}
    >
      {icon}
      {caption}
    </button>
  );
}
