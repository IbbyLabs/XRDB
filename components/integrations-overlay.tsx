'use client';

import { useEffect, useRef } from 'react';

import { IntegrationsStep } from '@/components/integrations-step';
import { useFocusTrap } from '@/lib/useFocusTrap';

export function IntegrationsOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(panelRef, open);

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

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="xrdb-integrations-backdrop"
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        ref={panelRef}
        className="xrdb-integrations-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Integrations"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="xrdb-integrations-drawer-head">
          <h2 className="xrdb-integrations-drawer-title">Integrations</h2>
          <button
            type="button"
            className="xrdb-integrations-drawer-close"
            onClick={onClose}
            aria-label="Close integrations"
          >
            Close
          </button>
        </div>
        <div className="xrdb-integrations-drawer-body">
          <IntegrationsStep />
        </div>
      </div>
    </div>
  );
}
