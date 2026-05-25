'use client';

export function ColorSwatchControl({
  value,
  onChange,
  ariaLabel,
  title,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  title: string;
}) {
  return (
    <div className="xrdb-color-control">
      <input
        type="color"
        className="xrdb-color-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        title={title}
      />
      <span className="xrdb-color-value">{value}</span>
    </div>
  );
}