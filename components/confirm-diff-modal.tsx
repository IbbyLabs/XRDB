'use client';

import type { ParamDiffEntry } from '@/lib/crossTypeSync';

export type ConfirmDiffSection = {
  label?: string;
  entries: ParamDiffEntry[];
  totalChanged: number;
};

const MAX_VISIBLE = 20;

export function ConfirmDiffModal({
  title,
  description,
  confirmLabel,
  sections,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  sections: ConfirmDiffSection[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const totalAllChanged = sections.reduce((sum, s) => sum + s.totalChanged, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl flex flex-col max-h-[80vh]">
        <div className="p-5 border-b border-white/10 shrink-0">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-[12px] text-zinc-400 mt-1">{description}</p>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {totalAllChanged === 0 ? (
            <p className="text-[12px] text-zinc-500 italic text-center py-4">
              Already in sync. No changes to apply.
            </p>
          ) : (
            sections.map((section, idx) => (
              <div key={idx}>
                {section.label ? (
                  <div className="mb-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wide">
                    {section.label}
                  </div>
                ) : null}
                {section.entries.length === 0 ? (
                  <p className="text-[12px] text-zinc-500 italic py-1">No changes</p>
                ) : (
                  <div className="space-y-2">
                    {section.entries.map((entry) => (
                      <div
                        key={entry.key}
                        className="rounded-xl border border-white/10 bg-zinc-900/60 p-3 space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-wide">
                            change
                          </span>
                          <span className="text-[12px] font-mono text-zinc-300">{entry.key}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                              old
                            </div>
                            <div className="rounded-lg bg-red-950/40 border border-red-500/20 px-2 py-1.5 font-mono text-[11px] text-red-300 break-all">
                              {entry.oldValue || (
                                <span className="italic text-zinc-500">default</span>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                              new
                            </div>
                            <div className="rounded-lg bg-green-950/40 border border-green-500/20 px-2 py-1.5 font-mono text-[11px] text-green-300 break-all">
                              {entry.newValue || (
                                <span className="italic text-zinc-500">default</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {section.totalChanged > MAX_VISIBLE ? (
                      <p className="text-[12px] text-zinc-500 text-center py-1">
                        and {section.totalChanged - MAX_VISIBLE} more changes
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        <div className="p-4 border-t border-white/10 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-xs font-semibold border border-white/15 text-zinc-300 hover:text-white transition-colors"
          >
            Cancel
          </button>
          {totalAllChanged > 0 ? (
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-full px-4 py-2 text-xs font-semibold bg-violet-600 text-white hover:bg-violet-500 transition-colors"
            >
              {confirmLabel ?? 'Confirm'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
