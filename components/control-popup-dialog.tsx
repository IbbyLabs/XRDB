'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { useOptionalConfiguratorContext } from '@/lib/configuratorProvider';
import { useFocusTrap } from '@/lib/useFocusTrap';

export function ControlPopupDialog({
  open,
  title,
  description,
  closeLabel,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  closeLabel?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const ctx = useOptionalConfiguratorContext();
  const popupModeClass = ctx?.experienceMode === 'advanced' ? 'xrdb-dialog-panel-advanced' : 'xrdb-dialog-panel-simple';

  useFocusTrap(dialogRef, open);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="xrdb-dialog-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`xrdb-dialog-panel ${popupModeClass}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="xrdb-control-popup-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="xrdb-dialog-header">
          <div>
            <h2 id="xrdb-control-popup-title" className="xrdb-dialog-title">{title}</h2>
            {description ? <p className="xrdb-dialog-desc">{description}</p> : null}
          </div>
          <button
            className="xrdb-dialog-close"
            onClick={onClose}
            type="button"
            aria-label={closeLabel ?? `Close ${title}`}
          >
            {closeLabel ?? 'Close'}
          </button>
        </div>

        <div className="xrdb-dialog-body">
          {children}
        </div>
      </div>
    </div>
  );
}