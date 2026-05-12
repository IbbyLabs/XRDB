import { ReactNode } from 'react';
import { Bricolage_Grotesque, Jost } from 'next/font/google';

const bodyFont = Jost({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});

const displayFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});

const siteBodyClassName = `${bodyFont.variable} ${displayFont.variable} antialiased`;

const themeInitScript = `(function(){var OR=/^oklch\\(\\s*[\\d.]+%?\\s+[\\d.]+\\s+[\\d.]+(\\s*\\/\\s*[\\d.]+)?\\s*\\)$/,KS=['bgBase','bgMid','bgSurface','bgElevated','accent','accentDim','accentText','ink','muted','border','scrim'],CV=['--bg-base','--bg-mid','--bg-surface','--bg-elevated','--accent','--accent-dim','--accent-text','--ink','--muted','--border','--scrim'];function vp(p){return p&&typeof p==='object'&&KS.every(function(k){return typeof p[k]==='string'&&OR.test(p[k].trim())&&p[k].length<=80;});}function ap(p,id){var r=document.documentElement;if(id)r.dataset.theme=id;KS.forEach(function(k,i){r.style.setProperty(CV[i],p[k]);});}function pd(h,l,c){return{bgBase:'oklch(8.5% 0.012 '+h+')',bgMid:'oklch(10.5% 0.015 '+h+')',bgSurface:'oklch(13% 0.018 '+h+')',bgElevated:'oklch(18% 0.024 '+h+')',accent:'oklch('+l+'% '+c+' '+h+')',accentDim:'oklch(19% 0.09 '+h+')',accentText:'oklch(76% 0.10 '+h+')',ink:'oklch(93% 0.007 '+h+')',muted:'oklch(51% 0.014 '+h+')',border:'oklch(22% 0.016 '+h+')',scrim:'oklch(4% 0.008 '+h+' / 0.86)'};}function pm(h,l,c){return{bgBase:'oklch(0% 0 '+h+')',bgMid:'oklch(2% 0.008 '+h+')',bgSurface:'oklch(4.5% 0.011 '+h+')',bgElevated:'oklch(8% 0.015 '+h+')',accent:'oklch('+l+'% '+c+' '+h+')',accentDim:'oklch(15% 0.07 '+h+')',accentText:'oklch(80% 0.10 '+h+')',ink:'oklch(95% 0.005 '+h+')',muted:'oklch(48% 0.012 '+h+')',border:'oklch(24% 0.018 '+h+')',scrim:'oklch(0% 0 0 / 0.92)'};}function pl(h,l,c){var at=(l-10).toFixed(1),ac=(c*0.8).toFixed(3);return{bgBase:'oklch(97.5% 0.012 '+h+')',bgMid:'oklch(93.5% 0.020 '+h+')',bgSurface:'oklch(95.8% 0.016 '+h+')',bgElevated:'oklch(99.2% 0.008 '+h+')',accent:'oklch('+l+'% '+c+' '+h+')',accentDim:'oklch(90% 0.06 '+h+')',accentText:'oklch('+at+'% '+ac+' '+h+')',ink:'oklch(14% 0.016 '+h+')',muted:'oklch(50% 0.020 '+h+')',border:'oklch(84% 0.018 '+h+')',scrim:'oklch(10% 0 0 / 0.40)'};}var FM={slate:[238,54,0.16,49,58],obsidian:[272,50,0.18,47,56],iron:[214,52,0.10,48,56],ember:[30,62,0.19,50,66],verdant:[158,55,0.17,50,60],crimson:[18,58,0.22,48,62],copper:[54,60,0.18,50,64],dusk:[302,51,0.14,48,57],aiostreams:[288,83.9,0.085,45,null],aiometadata:[226,71.7,0.137,45,null],stremio:[262,50,0.212,46,null],torbox:[165,71.3,0.150,45,null],realdebrid:[205,84.8,0.118,45,null]};function sm(){try{return window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}catch(e){return 'dark';}}try{var up=new URLSearchParams(location.search).get('theme');if(up){try{var ud=JSON.parse(atob(up.replace(/-/g,'+').replace(/_/g,'/')));if(vp(ud)){ap(ud,'url');return;}}catch(e){}}var rd=document.documentElement;var fid=localStorage.getItem('xrdb.theme.family.v1');if(fid&&FM[fid]){var mpref=localStorage.getItem('xrdb.theme.mode.v1')||'dark';var mode=mpref==='system'?sm():mpref;var fm=FM[fid];var h=fm[0],pal,tid;if(mode==='midnight'&&fm[4]!=null){pal=pm(h,fm[4],fm[2]);tid='midnight-'+fid;rd.dataset.midnight='true';}else if(mode==='light'){pal=pl(h,fm[3],fm[2]);tid=fid+'-light';delete rd.dataset.midnight;}else{pal=pd(h,fm[1],fm[2]);tid=fid+'-dark';delete rd.dataset.midnight;}ap(pal,tid);return;}var r2=localStorage.getItem('xrdb.theme.v2');if(r2){try{var p2=JSON.parse(r2);if(p2&&typeof p2.id==='string'&&vp(p2.palette)){if(p2.id==='midnight'||p2.id.indexOf('midnight-')===0)rd.dataset.midnight='true';ap(p2.palette,p2.id);return;}}catch(e){}}var r1=localStorage.getItem('xrdb.theme.v1');if(r1){try{var p1=JSON.parse(r1);if(p1&&typeof p1.hue==='number'){var h1=((p1.hue%360)+360)%360,l1=Math.min(70,Math.max(40,p1.accentL||54)),c1=Math.min(0.24,Math.max(0.08,p1.accentC||0.16));ap(pd(h1,l1,c1),p1.id||'custom');}}catch(e){}}}catch(e){}})();`;

export function RootLayoutShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={siteBodyClassName} suppressHydrationWarning>
        <a href="#main-content" className="skip-to-content">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
