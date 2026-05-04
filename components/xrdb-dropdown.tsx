'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type XrdbDropdownOption = {
  value: string;
  label: string;
};

type XrdbDropdownProps = {
  value: string;
  options: XrdbDropdownOption[];
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  optionClassName?: string;
};

export function XrdbDropdown({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
  className,
  triggerClassName,
  menuClassName,
  optionClassName,
}: XrdbDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selectedLabel = useMemo(() => {
    const selected = options.find((option) => option.value === value);
    if (selected) {
      return selected.label;
    }
    return options[0]?.label || '';
  }, [options, value]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (!root) {
        return;
      }
      if (!root.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const containerClassName = ['xrdb-dropdown', className].filter(Boolean).join(' ');
  const triggerClasses = ['xrdb-dropdown-trigger', triggerClassName].filter(Boolean).join(' ');
  const menuClasses = ['xrdb-dropdown-menu', menuClassName].filter(Boolean).join(' ');

  return (
    <div ref={rootRef} className={containerClassName}>
      <button
        type="button"
        className={triggerClasses}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) {
            return;
          }
          setOpen((previous) => !previous);
        }}
        disabled={disabled}
      >
        <span className="xrdb-dropdown-trigger-label">{selectedLabel}</span>
        <span className={`xrdb-dropdown-caret${open ? ' xrdb-dropdown-caret-open' : ''}`} aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className={menuClasses} role="listbox" aria-label={ariaLabel}>
          {options.map((option) => {
            const isSelected = option.value === value;
            const classes = [
              'xrdb-dropdown-option',
              isSelected ? 'xrdb-dropdown-option-active' : '',
              optionClassName,
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={classes}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
