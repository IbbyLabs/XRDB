const SVG_DATA_URI_PREFIX = 'data:image/svg+xml;charset=utf-8,';

const buildSvgDataUri = (svg: string) =>
  `${SVG_DATA_URI_PREFIX}${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;

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

export const ALLOCINE_LOGO_DATA_URI = buildSvgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <rect x="7" y="7" width="82" height="82" rx="22" fill="#0f172a"/>
    <path d="M48 18l8.52 17.27 19.06 2.77-13.79 13.44 3.26 18.98L48 61.5 30.95 70.46l3.26-18.98L20.42 38.04l19.06-2.77L48 18Z" fill="#facc15"/>
    <circle cx="72" cy="72" r="12" fill="#38bdf8"/>
    <text x="72" y="76" text-anchor="middle" font-family="'Arial Black','Noto Sans',Arial,sans-serif" font-size="12" font-weight="900" fill="#082f49">S</text>
  </svg>
`);

export const ALLOCINE_PRESS_LOGO_DATA_URI = buildSvgDataUri(`
  <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <rect x="7" y="7" width="82" height="82" rx="22" fill="#0f172a"/>
    <path d="M48 18l8.52 17.27 19.06 2.77-13.79 13.44 3.26 18.98L48 61.5 30.95 70.46l3.26-18.98L20.42 38.04l19.06-2.77L48 18Z" fill="#f59e0b"/>
    <circle cx="72" cy="72" r="12" fill="#fb923c"/>
    <text x="72" y="76" text-anchor="middle" font-family="'Arial Black','Noto Sans',Arial,sans-serif" font-size="12" font-weight="900" fill="#431407">P</text>
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
