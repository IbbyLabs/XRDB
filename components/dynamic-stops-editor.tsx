'use client';

import { useState } from 'react';

type Stop = { threshold: number; color: string };

function parseStops(raw: string): Stop[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((s) => {
      const idx = s.indexOf(':');
      if (idx === -1) return [];
      const t = Number(s.slice(0, idx));
      const c = s.slice(idx + 1).trim();
      if (isNaN(t) || !/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(c)) return [];
      return [{ threshold: t, color: c }];
    })
    .sort((a, b) => a.threshold - b.threshold);
}

function normalizeHex(raw: string): string {
  let h = raw.trim();
  if (!h.startsWith('#')) h = '#' + h;
  if (/^#[0-9a-fA-F]{3}$/.test(h)) {
    h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  }
  return h.toLowerCase();
}

function isValidHex(h: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(h);
}

function stringifyStops(stops: Stop[]): string {
  return stops
    .slice()
    .sort((a, b) => a.threshold - b.threshold)
    .map((s) => `${s.threshold}:${s.color}`)
    .join(',');
}

function buildGradient(stops: Stop[]): string {
  if (stops.length === 0) return 'var(--bg-surface)';
  const sorted = [...stops].sort((a, b) => a.threshold - b.threshold);
  const parts: string[] = [];
  if (sorted[0].threshold > 0) parts.push(`${sorted[0].color} 0%`);
  for (const s of sorted) parts.push(`${s.color} ${s.threshold}%`);
  if (sorted[sorted.length - 1].threshold < 100) {
    parts.push(`${sorted[sorted.length - 1].color} 100%`);
  }
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

function StopRow({
  stop,
  index,
  onUpdate,
  onRemove,
}: {
  stop: Stop;
  index: number;
  onUpdate: (patch: Partial<Stop>) => void;
  onRemove: () => void;
}) {
  const [hexText, setHexText] = useState(stop.color);

  const liveColor = (() => {
    const norm = normalizeHex(hexText);
    return isValidHex(norm) ? norm : stop.color;
  })();

  return (
    <div className="xrdb-dse-row">
      <input
        type="number"
        className="xrdb-dse-threshold"
        value={stop.threshold}
        min={0}
        max={100}
        onChange={(e) => {
          const parsed = parseInt(e.target.value, 10);
          if (!isNaN(parsed)) {
            onUpdate({ threshold: Math.max(0, Math.min(100, parsed)) });
          }
        }}
        aria-label={`Stop ${index + 1} threshold`}
      />
      <span className="xrdb-dse-pct">%</span>
      <div className="xrdb-dse-swatch-wrap" title="Open color picker">
        <span className="xrdb-dse-swatch" style={{ background: liveColor }} aria-hidden="true" />
        <input
          type="color"
          className="xrdb-dse-color-native"
          value={isValidHex(stop.color) ? stop.color : '#888888'}
          onChange={(e) => {
            setHexText(e.target.value);
            onUpdate({ color: e.target.value });
          }}
          aria-label={`Stop ${index + 1} color picker`}
        />
      </div>
      <input
        type="text"
        className="xrdb-dse-hex"
        value={hexText}
        maxLength={7}
        spellCheck={false}
        onChange={(e) => {
          let v = e.target.value;
          if (v.length > 0 && !v.startsWith('#')) v = '#' + v;
          setHexText(v);
          if (isValidHex(v)) onUpdate({ color: v });
        }}
        onBlur={() => {
          const norm = normalizeHex(hexText);
          if (isValidHex(norm)) {
            onUpdate({ color: norm });
          } else {
            setHexText(stop.color);
          }
        }}
        aria-label={`Stop ${index + 1} hex value`}
      />
      <button
        type="button"
        className="xrdb-dse-remove"
        onClick={onRemove}
        aria-label={`Remove stop ${index + 1}`}
      >
        ×
      </button>
    </div>
  );
}

interface DynamicStopsEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function DynamicStopsEditor({ value, onChange }: DynamicStopsEditorProps) {
  const stops = parseStops(value);

  function updateStop(index: number, patch: Partial<Stop>) {
    const next = stops.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onChange(stringifyStops(next));
  }

  function removeStop(index: number) {
    onChange(stringifyStops(stops.filter((_, i) => i !== index)));
  }

  function addStop() {
    const last = stops.length > 0 ? stops[stops.length - 1].threshold : 0;
    const t = stops.length === 0 ? 50 : Math.min(100, Math.round((last + 100) / 2));
    onChange(stringifyStops([...stops, { threshold: t, color: '#888888' }]));
  }

  return (
    <div className="xrdb-dse">
      <div
        className="xrdb-dse-preview"
        style={{ background: buildGradient(stops) }}
        aria-hidden="true"
      />
      {stops.length === 0 ? (
        <p className="xrdb-dse-empty">No stops configured.</p>
      ) : (
        <div className="xrdb-dse-rows">
          {stops.map((stop, i) => (
            <StopRow
              key={`${stop.threshold}-${stop.color}`}
              stop={stop}
              index={i}
              onUpdate={(patch) => updateStop(i, patch)}
              onRemove={() => removeStop(i)}
            />
          ))}
        </div>
      )}
      <button type="button" className="xrdb-dse-add" onClick={addStop}>
        + Add stop
      </button>
    </div>
  );
}
