import { Sparkles } from 'lucide-react';

import type { ConfiguratorExperienceMode } from '@/lib/configuratorPresets';

export function ExperienceModeModal({
  experienceModeDraft,
  onSelectMode,
  onContinue,
}: {
  experienceModeDraft: ConfiguratorExperienceMode;
  onSelectMode: (mode: ConfiguratorExperienceMode) => void;
  onContinue: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(32,20,54,0.98),rgba(16,10,28,0.98))] p-5 shadow-[0_40px_120px_-55px_rgba(0,0,0,0.95)] md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
              <Sparkles className="h-3.5 w-3.5 text-violet-300" />
              Welcome to XRDB
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              Choose how you want to configure it.
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-400">
              Simple keeps the main decisions visible. Advanced opens the full XRDB surface,
              including provider ordering, layout offsets, badge sizing, and custom source styling.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {([
            {
              id: 'simple',
              label: 'Simple',
              summary: 'Preset first workflow with just the everyday switches.',
              lines: [
                'Best if you want the fastest path to a working config.',
                'Keeps presets, keys, media targeting, and visible artwork choices upfront.',
              ],
            },
            {
              id: 'advanced',
              label: 'Advanced',
              summary: 'Every XRDB control, reorganized into sections.',
              lines: [
                'Best if you plan to tune provider order, badge styling, or manual layout details.',
                'Matches the full configurator behavior with a cleaner structure.',
              ],
            },
          ] as const).map((option) => (
            <button
              key={`modal-mode-${option.id}`}
              type="button"
              onClick={() => onSelectMode(option.id)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                experienceModeDraft === option.id
                  ? 'border-violet-500/60 bg-violet-500/12 text-white'
                  : 'border-white/10 bg-black/30 text-zinc-300 hover:border-white/20 hover:bg-black/40'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-xl font-semibold">{option.label}</div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                    experienceModeDraft === option.id
                      ? 'bg-violet-500/20 text-violet-100'
                      : 'bg-white/5 text-zinc-500'
                  }`}
                >
                  {experienceModeDraft === option.id ? 'Selected' : 'Choose'}
                </span>
              </div>
              <p className="mt-3 text-sm text-zinc-300">{option.summary}</p>
              <div className="mt-4 grid gap-2">
                {option.lines.map((line) => (
                  <div
                    key={`${option.id}-${line}`}
                    className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-[11px] leading-5 text-zinc-400"
                  >
                    {line}
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] leading-5 text-zinc-500">
            You can switch modes later from the configurator without changing your saved XRDB settings.
          </p>
          <button
            type="button"
            onClick={onContinue}
            className="rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-400"
          >
            Continue with {experienceModeDraft === 'simple' ? 'Simple' : 'Advanced'}
          </button>
        </div>
      </div>
    </div>
  );
}
