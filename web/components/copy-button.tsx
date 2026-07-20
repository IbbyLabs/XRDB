'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, Copy, X } from 'lucide-react';

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const flash = (next: 'copied' | 'failed') => {
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // The async Clipboard API is unavailable on insecure (http) origins —
        // common for a self-hosted instance on a LAN IP. Fall back to a
        // temporary selection + execCommand so copy still works there.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (!ok) throw new Error('copy command rejected');
      }
      flash('copied');
    } catch {
      flash('failed');
    }
  };

  const icon = state === 'copied' ? <Check size={13} aria-hidden />
    : state === 'failed' ? <X size={13} aria-hidden />
    : <Copy size={13} aria-hidden />;
  const caption = state === 'copied' ? 'Copied'
    : state === 'failed' ? 'Copy failed'
    : 'Copy';

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
