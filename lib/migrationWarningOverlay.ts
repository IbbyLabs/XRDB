const formatMigrationCountdown = (msRemaining: number): string => {
  if (msRemaining <= 0) return 'Expired';
  const totalMinutes = Math.floor(msRemaining / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const p = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`;
  if (days >= 1) return `${p(days, 'day')} ${p(hours, 'hr')}`;
  if (hours >= 1) return `${p(hours, 'hr')} ${p(minutes, 'min')}`;
  return `${p(minutes, 'min')}`;
};

export const buildMigrationWarningOverlaySvg = ({
  deadline,
  outputWidth,
  outputHeight,
}: {
  deadline: number;
  outputWidth: number;
  outputHeight: number;
}): { svg: string; left: number; top: number; width: number; height: number } => {
  const msRemaining = deadline - Date.now();
  const countdown = formatMigrationCountdown(msRemaining);

  const barHeight = Math.max(72, Math.round(outputHeight * 0.14));
  const top = outputHeight - barHeight;
  const width = outputWidth;
  const height = barHeight;

  const stripeW = Math.round(barHeight * 0.7);
  const titleSize = Math.min(Math.max(13, Math.round(width * 0.038)), Math.round(barHeight * 0.26));
  const subSize = Math.min(Math.max(10, Math.round(width * 0.027)), Math.round(barHeight * 0.2));
  const titleY = Math.round(barHeight * 0.38);
  const subY = Math.round(barHeight * 0.72);
  const cx = Math.round(width / 2);

  const stripes = Array.from({ length: Math.ceil((width + barHeight * 2) / stripeW) }, (_, i) => {
    const x = i * stripeW - barHeight;
    return `<polygon points="${x},0 ${x + stripeW * 0.5},0 ${x + stripeW * 0.5 + barHeight},${height} ${x + barHeight},${height}" fill="#000000" fill-opacity="0.18"/>`;
  }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="topfade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#c0390a" stop-opacity="0.0"/>
      <stop offset="100%" stop-color="#c0390a" stop-opacity="0.0"/>
    </linearGradient>
    <clipPath id="bounds"><rect x="0" y="0" width="${width}" height="${height}"/></clipPath>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#bf3006"/>
  <g clip-path="url(#bounds)">${stripes}</g>
  <rect x="0" y="0" width="${width}" height="3" fill="#ff6a1a"/>
  <rect x="0" y="${height - 3}" width="${width}" height="3" fill="#7a1a00"/>
  <text
    x="${cx}"
    y="${titleY}"
    font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
    font-size="${titleSize}"
    font-weight="800"
    letter-spacing="0.04em"
    text-anchor="middle"
    dominant-baseline="auto"
    fill="#ffffff"
  >\u26A0 MIGRATION REQUIRED</text>
  <text
    x="${cx}"
    y="${subY}"
    font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
    font-size="${subSize}"
    font-weight="600"
    letter-spacing="0.03em"
    text-anchor="middle"
    dominant-baseline="auto"
    fill="#ffd0b0"
  >Visit configurator \u2014 deletion in ${countdown}</text>
</svg>`;

  return { svg, left: 0, top, width, height };
};
