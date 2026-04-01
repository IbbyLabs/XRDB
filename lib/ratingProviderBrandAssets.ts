const SVG_DATA_URI_PREFIX = 'data:image/svg+xml;charset=utf-8,';
const PNG_DATA_URI_PREFIX = 'data:image/png;base64,';

const buildSvgDataUri = (svg: string) =>
  `${SVG_DATA_URI_PREFIX}${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;

const ALLOCINE_LOGO_PNG_BASE64 =
  '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';

export const METACRITIC_LOGO_DATA_URI = buildSvgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <defs>
      <linearGradient id="metacritic-ring" x1="12%" y1="10%" x2="86%" y2="88%">
        <stop offset="0%" stop-color="#ffd863"/>
        <stop offset="100%" stop-color="#f6b60e"/>
      </linearGradient>
    </defs>
    <circle cx="48" cy="48" r="43" fill="url(#metacritic-ring)"/>
    <circle cx="48" cy="48" r="31" fill="#2f2f31"/>
    <text
      x="49"
      y="64"
      text-anchor="middle"
      font-family="'Arial Black','Noto Sans',Arial,sans-serif"
      font-size="54"
      font-weight="900"
      fill="#ffffff"
    >m</text>
  </svg>
`);

export const ALLOCINE_LOGO_DATA_URI = `${PNG_DATA_URI_PREFIX}${ALLOCINE_LOGO_PNG_BASE64}`;

export const ALLOCINE_PRESS_LOGO_DATA_URI = buildSvgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <image href="${ALLOCINE_LOGO_DATA_URI}" width="96" height="96"/>
    <circle cx="72" cy="72" r="12" fill="#f59e0b"/>
    <text x="72" y="76" text-anchor="middle" font-family="'Arial Black','Noto Sans',Arial,sans-serif" font-size="12" font-weight="900" fill="#111827">P</text>
  </svg>
`);

export const SIMKL_LOGO_DATA_URI = buildSvgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
    <path d="M3.84 0A3.832 3.832 0 0 0 0 3.84v16.32A3.832 3.832 0 0 0 3.84 24h16.32A3.832 3.832 0 0 0 24 20.16V3.84A3.832 3.832 0 0 0 20.16 0zm8.567 4.11c2.074 0 3.538 0.061 4.393 0.186 1.127 0.168 1.94 0.46 2.438 0.877 0.672 0.578 1.009 1.613 1.009 3.104 0 0.161 -0.004 0.417 -0.01 0.768h-4.234c-0.014 -0.358 -0.039 -0.607 -0.074 -0.746 -0.098 -0.41 -0.42 -0.64 -0.966 -0.692 -0.484 -0.043 -1.66 -0.066 -3.53 -0.066 -1.85 0 -2.946 0.056 -3.289 0.165 -0.385 0.133 -0.578 0.474 -0.578 1.024 0 0.528 0.203 0.851 0.61 0.969 0.343 0.095 1.887 0.187 4.633 0.275 2.487 0.073 4.073 0.165 4.76 0.275 0.693 0.11 1.244 0.275 1.654 0.495 0.41 0.22 0.737 0.532 0.983 0.936 0.37 0.595 0.557 1.552 0.557 2.873 0 1.475 -0.182 2.557 -0.546 3.247 -0.364 0.683 -0.96 1.149 -1.785 1.398 -0.812 0.25 -3.05 0.374 -6.71 0.374 -2.226 0 -3.832 -0.062 -4.82 -0.187 -1.204 -0.147 -2.068 -0.434 -2.593 -0.86 -0.567 -0.456 -0.903 -1.1 -1.008 -1.93a10.522 10.522 0 0 1 -0.085 -1.434v-0.789H7.44c-0.007 0.74 0.136 1.216 0.43 1.428 0.154 0.102 0.33 0.167 0.525 0.203 0.196 0.037 0.54 0.063 1.03 0.077a166.2 166.2 0 0 0 2.405 0.022c1.862 -0.007 2.94 -0.018 3.234 -0.033 0.553 -0.044 0.917 -0.12 1.092 -0.23 0.245 -0.161 0.368 -0.52 0.368 -1.077 0 -0.38 -0.078 -0.648 -0.231 -0.802 -0.211 -0.212 -0.712 -0.325 -1.503 -0.34 -0.547 0 -1.688 -0.044 -3.425 -0.132 -1.794 -0.088 -2.956 -0.14 -3.488 -0.154 -1.387 -0.044 -2.364 -0.212 -2.932 -0.505 -0.728 -0.373 -1.205 -1.01 -1.429 -1.91 -0.126 -0.498 -0.189 -1.15 -0.189 -1.956 0 -1.698 0.309 -2.895 0.925 -3.59 0.462 -0.527 1.163 -0.875 2.102 -1.044 0.848 -0.146 2.865 -0.22 6.053 -0.22z" fill="white"/>
  </svg>
`);

export const TRAKT_LOGO_DATA_URI = buildSvgDataUri(`
  <svg id="Layer_2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <defs>
      <style>
        .cls-1 {
          fill: url(#radial-gradient);
        }

        .cls-2 {
          fill: #fff;
        }
      </style>
      <radialGradient id="radial-gradient" cx="48.46" cy="-.95" fx="48.46" fy="-.95" r="64.84" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#9f42c6"/>
        <stop offset=".27" stop-color="#a041c3"/>
        <stop offset=".42" stop-color="#a43ebb"/>
        <stop offset=".53" stop-color="#aa39ad"/>
        <stop offset=".64" stop-color="#b4339a"/>
        <stop offset=".73" stop-color="#c02b81"/>
        <stop offset=".82" stop-color="#cf2061"/>
        <stop offset=".9" stop-color="#e1143c"/>
        <stop offset=".97" stop-color="#f50613"/>
        <stop offset="1" stop-color="red"/>
      </radialGradient>
    </defs>
    <g id="_x2D_-production">
      <g id="logomark.square.gradient">
        <path id="background" class="cls-1" d="M48,11.26v25.47c0,6.22-5.05,11.27-11.27,11.27H11.26c-6.22,0-11.26-5.05-11.26-11.27V11.26C0,5.04,5.04,0,11.26,0h25.47c3.32,0,6.3,1.43,8.37,3.72.47.52.89,1.08,1.25,1.68.18.29.34.59.5.89.33.68.6,1.39.79,2.14.1.37.18.76.23,1.15.09.54.13,1.11.13,1.68Z"/>
        <g id="checkbox">
          <path class="cls-2" d="M13.62,17.97l7.92,7.92,1.47-1.47-7.92-7.92-1.47,1.47ZM28.01,32.37l1.47-1.46-2.16-2.16,20.32-20.32c-.19-.75-.46-1.46-.79-2.14l-22.46,22.46,3.62,3.62ZM12.92,18.67l-1.46,1.46,14.4,14.4,1.46-1.47-4.32-4.31L46.35,5.4c-.36-.6-.78-1.16-1.25-1.68l-23.56,23.56-8.62-8.61ZM47.87,9.58l-19.17,19.17,1.47,1.46,17.83-17.83v-1.12c0-.57-.04-1.14-.13-1.68ZM25.16,22.27l-7.92-7.92-1.47,1.47,7.92,7.92,1.47-1.47ZM41.32,35.12c0,3.42-2.78,6.2-6.2,6.2H12.88c-3.42,0-6.2-2.78-6.2-6.2V12.88c0-3.42,2.78-6.21,6.2-6.21h20.78v-2.07H12.88c-4.56,0-8.28,3.71-8.28,8.28v22.24c0,4.56,3.71,8.28,8.28,8.28h22.24c4.56,0,8.28-3.71,8.28-8.28v-3.51h-2.07v3.51Z"/>
        </g>
      </g>
    </g>
  </svg>
`);
