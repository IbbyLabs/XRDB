type SliderDefaultValueOptions = {
  value: number;
  defaultValue: number;
  step?: number;
  snapSteps?: number;
};

type SliderValueLabelOptions = SliderDefaultValueOptions & {
  suffix?: string;
};

const DEFAULT_SLIDER_STEP = 1;
const DEFAULT_SLIDER_SNAP_STEPS = 1;
const SLIDER_DEFAULT_EPSILON = 1e-6;

const resolveSliderStep = (step?: number) =>
  Number.isFinite(step) && step && step > 0 ? step : DEFAULT_SLIDER_STEP;

const countStepDecimals = (step: number) => {
  const normalizedStep = resolveSliderStep(step);
  const asText = String(normalizedStep);
  if (asText.includes('e-')) {
    const [, exponent = '0'] = asText.split('e-');
    return Number(exponent);
  }
  const [, decimals = ''] = asText.split('.');
  return decimals.length;
};

export const isSliderDefaultValue = ({
  value,
  defaultValue,
}: Pick<SliderDefaultValueOptions, 'value' | 'defaultValue'>) =>
  Math.abs(value - defaultValue) <= SLIDER_DEFAULT_EPSILON;

export const snapSliderValueToDefault = ({
  value,
  defaultValue,
  step,
  snapSteps = DEFAULT_SLIDER_SNAP_STEPS,
}: SliderDefaultValueOptions) => {
  const resolvedStep = resolveSliderStep(step);
  const threshold = resolvedStep * Math.max(snapSteps, 0);
  return Math.abs(value - defaultValue) <= threshold ? defaultValue : value;
};

export const getSliderValueLabel = ({
  value,
  defaultValue,
  step,
  suffix = '',
}: SliderValueLabelOptions) => {
  if (isSliderDefaultValue({ value, defaultValue })) {
    return 'Default';
  }

  const resolvedStep = resolveSliderStep(step);
  const fractionDigits = countStepDecimals(resolvedStep);
  const formattedValue =
    fractionDigits === 0 ? String(Math.round(value)) : value.toFixed(fractionDigits);

  return `${formattedValue}${suffix}`;
};