'use client';

import {
  ChevronRight,
  Cpu,
  Layers,
  Settings2,
  Sparkles,
} from 'lucide-react';

import {
  CONFIGURATOR_PRESETS,
  CONFIGURATOR_WIZARD_QUESTION_ORDER,
  type ConfiguratorPresetDefinition,
  type ConfiguratorPresetId,
  type ConfiguratorWizardAnswers,
  type ConfiguratorWizardQuestionId,
} from '@/lib/configuratorPresets';
import { hexToRgbaCss } from '@/lib/hexToRgbaCss';

type WizardOptionValue = ConfiguratorWizardAnswers[ConfiguratorWizardQuestionId];

type WizardQuestion = {
  id: ConfiguratorWizardQuestionId;
  title: string;
  description: string;
  options: ReadonlyArray<{
    value: WizardOptionValue;
    label: string;
    description: string;
  }>;
};

export function ConfiguratorPresetStudio({
  isOpen,
  onToggle,
  isWizardActive,
  selectedPresetId,
  selectedPresetMeta,
  wizardQuestionIndex,
  wizardAnswers,
  wizardRecommendedPreset,
  wizardActiveQuestion,
  onBeginWizard,
  onExitWizard,
  onWizardBack,
  onWizardAnswer,
  onApplyPreset,
}: {
  isOpen: boolean;
  onToggle: () => void;
  isWizardActive: boolean;
  selectedPresetId: ConfiguratorPresetId | null;
  selectedPresetMeta: ConfiguratorPresetDefinition | null;
  wizardQuestionIndex: number;
  wizardAnswers: Partial<ConfiguratorWizardAnswers>;
  wizardRecommendedPreset: ConfiguratorPresetDefinition | null;
  wizardActiveQuestion: WizardQuestion | null;
  onBeginWizard: () => void;
  onExitWizard: () => void;
  onWizardBack: () => void;
  onWizardAnswer: (questionId: ConfiguratorWizardQuestionId, value: WizardOptionValue) => void;
  onApplyPreset: (presetId: ConfiguratorPresetId) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-3">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between gap-4 text-left">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Guided Setup
          </div>
          <h4 className="mt-1 text-lg font-semibold text-white">Preset Studio</h4>
          <p className="mt-1 max-w-2xl text-[12px] leading-6 text-zinc-400">
            Start from a preset, or answer a few questions and let XRDB recommend one for you.
            Presets only touch rendering and proxy defaults. Your keys and manifest URL stay intact.
          </p>
        </div>
        <ChevronRight className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${isOpen ? 'rotate-90 text-violet-300' : ''}`} />
      </button>
      <div className="xrdb-accordion-body" data-open={isOpen}>
        <div className="xrdb-accordion-inner">
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={isWizardActive ? onExitWizard : onBeginWizard}
              className="shrink-0 rounded-full border border-white/10 bg-zinc-950 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-200 hover:bg-zinc-900"
            >
              {isWizardActive ? 'Exit Guide' : 'Open Guide'}
            </button>
          </div>

          {isWizardActive ? (
            <div
              id="preset-studio-guide"
              className="mt-4 rounded-[28px] border border-violet-500/30 bg-[linear-gradient(180deg,rgba(22,16,36,0.96),rgba(7,7,11,0.98))] p-4 shadow-[0_28px_120px_rgba(0,0,0,0.35)] md:p-5"
            >
              {wizardRecommendedPreset ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-violet-500/30 bg-[linear-gradient(145deg,rgba(76,29,149,0.18),rgba(9,9,11,0.88))] p-4">
                    <div className="flex flex-col items-start gap-3">
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200/80">
                          Wizard Recommendation
                        </div>
                        <div className="mt-2 text-xl font-semibold text-white">
                          {wizardRecommendedPreset.label}
                        </div>
                        <p className="mt-2 text-[12px] leading-6 text-zinc-400">
                          {wizardRecommendedPreset.description}
                        </p>
                      </div>
                      <span
                        className="shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white"
                        style={{
                          borderColor: hexToRgbaCss(wizardRecommendedPreset.accentColor, 0.55),
                          backgroundColor: hexToRgbaCss(wizardRecommendedPreset.accentColor, 0.16),
                        }}
                      >
                        {wizardRecommendedPreset.badge}
                      </span>
                    </div>
                    <div className="mt-4 grid gap-2 md:grid-cols-3">
                      {wizardRecommendedPreset.bullets.map((bullet) => (
                        <div
                          key={`${wizardRecommendedPreset.id}-${bullet}`}
                          className="rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-[11px] leading-5 text-zinc-300"
                        >
                          {bullet}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onApplyPreset(wizardRecommendedPreset.id)}
                        className="rounded-lg bg-violet-500 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-400"
                      >
                        Apply {wizardRecommendedPreset.label}
                      </button>
                      <button
                        type="button"
                        onClick={onBeginWizard}
                        className="rounded-lg border border-white/10 bg-zinc-950 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-900"
                      >
                        Restart Guide
                      </button>
                    </div>
                  </div>
                </div>
              ) : wizardActiveQuestion ? (
                <div className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        Question {wizardQuestionIndex + 1} of {CONFIGURATOR_WIZARD_QUESTION_ORDER.length}
                      </div>
                      <div className="mt-2 text-lg font-semibold text-white">
                        {wizardActiveQuestion.title}
                      </div>
                      <p className="mt-2 text-[12px] leading-6 text-zinc-400">
                        {wizardActiveQuestion.description}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {wizardActiveQuestion.options.map((option) => {
                      const isSelected = wizardAnswers[wizardActiveQuestion.id] === option.value;
                      return (
                        <button
                          key={`${wizardActiveQuestion.id}-${option.value}`}
                          type="button"
                          onClick={() => onWizardAnswer(wizardActiveQuestion.id, option.value)}
                          className={`rounded-2xl border p-4 text-left transition-colors ${
                            isSelected
                              ? 'border-violet-500/60 bg-violet-500/12 text-white'
                              : 'border-white/10 bg-black/30 text-zinc-300 hover:border-white/20 hover:bg-black/40'
                          }`}
                        >
                          <div className="text-sm font-semibold">{option.label}</div>
                          <div className="mt-1 text-[11px] leading-5 text-zinc-500">
                            {option.description}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={onWizardBack}
                      disabled={wizardQuestionIndex === 0}
                      className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                        wizardQuestionIndex === 0
                          ? 'cursor-not-allowed bg-zinc-900 text-zinc-600'
                          : 'border border-white/10 bg-zinc-950 text-zinc-300 hover:bg-zinc-900'
                      }`}
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={onExitWizard}
                      className="rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-900"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="mt-3 grid gap-2">
                {CONFIGURATOR_PRESETS.map((preset) => {
                  const isSelected = selectedPresetId === preset.id;
                  const presetIcon =
                    preset.id === 'starter'
                      ? Settings2
                      : preset.id === 'balanced'
                        ? Sparkles
                        : preset.id === 'public-fast'
                          ? Cpu
                          : Layers;
                  const PresetIcon = presetIcon;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => onApplyPreset(preset.id)}
                      className={`min-w-0 rounded-2xl border p-3 text-left transition-colors ${
                        isSelected
                          ? 'bg-zinc-900/80 text-white'
                          : 'border-white/10 bg-zinc-950/60 text-zinc-300 hover:border-white/20 hover:bg-zinc-950'
                      }`}
                      style={
                        isSelected
                          ? {
                              borderColor: hexToRgbaCss(preset.accentColor, 0.65),
                              boxShadow: `inset 0 0 0 1px ${hexToRgbaCss(preset.accentColor, 0.18)}`,
                            }
                          : undefined
                      }
                    >
                      <div className="flex flex-col items-start gap-2">
                        <div className="flex min-w-0 items-start gap-3">
                          <div
                            className="shrink-0 rounded-2xl border border-white/10 p-2.5"
                            style={{
                              backgroundColor: hexToRgbaCss(preset.accentColor, 0.16),
                            }}
                          >
                            <PresetIcon className="h-4 w-4" style={{ color: preset.accentColor }} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="break-words text-sm font-semibold text-white">{preset.label}</div>
                            <div className="mt-1 text-[11px] leading-5 text-zinc-500">
                              {preset.description}
                            </div>
                          </div>
                        </div>
                        <span
                          className="max-w-full shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white"
                          style={{
                            borderColor: hexToRgbaCss(preset.accentColor, 0.45),
                            backgroundColor: hexToRgbaCss(preset.accentColor, 0.16),
                          }}
                        >
                          {preset.badge}
                        </span>
                      </div>
                      <div className="mt-2 grid gap-1.5">
                        {preset.bullets.map((bullet) => (
                          <div
                            key={`${preset.id}-${bullet}`}
                            className="break-words rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-[11px] leading-5 text-zinc-400"
                          >
                            {bullet}
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 rounded-2xl border border-dashed border-white/10 bg-zinc-950/40 p-3">
                <div className="text-sm font-semibold text-white">Not sure what to pick?</div>
                <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                  The guide recommends a preset based on deployment, density, and how much manual tuning
                  you expect to do afterwards.
                </p>
                <button
                  type="button"
                  onClick={onBeginWizard}
                  className="mt-2 rounded-lg border border-white/10 bg-black/40 px-4 py-2 text-xs font-semibold text-white hover:bg-black/60"
                >
                  Find a preset
                </button>
              </div>
            </>
          )}

          <div className="mt-3 rounded-xl border border-white/10 bg-zinc-950/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Wizard Summary
              </div>
              <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
                {selectedPresetMeta ? selectedPresetMeta.badge : 'Custom'}
              </span>
            </div>
            <div className="mt-3 text-sm font-semibold text-white">
              {selectedPresetMeta ? selectedPresetMeta.label : 'No preset applied yet'}
            </div>
            <p className="mt-2 text-[11px] leading-5 text-zinc-500">
              {selectedPresetMeta
                ? `${selectedPresetMeta.description} ${
                    selectedPresetMeta.recommendedExperienceMode === 'advanced'
                      ? 'This preset pairs best with advanced mode once you want to tune it further.'
                      : 'This preset is designed to work well in simple mode too.'
                  }`
                : 'Apply a preset to get a curated starting point, then keep tuning from there.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
