import type { Metadata } from 'next';
import { Bricolage_Grotesque, Jost } from 'next/font/google';
import './styles/globals.css';
import { NavBar } from '@/components/nav-bar';
import { BRAND_DISPLAY_NAME } from '@/lib/brand';

const fontBody = Jost({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const fontDisplay = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

export const metadata: Metadata = {
  title: BRAND_DISPLAY_NAME,
  description: 'eXtended Ratings DataBase — image configurator and metadata service',
};

// Applies the persisted UI theme before first paint so there is no
// flash of the default theme on navigation or reload.
const themeInitScript = `
try {
  var t = localStorage.getItem('xrdb-ui-theme');
  if (t && t !== 'midnight') document.documentElement.dataset.theme = t;
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontBody.variable} ${fontDisplay.variable}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <a href="#main" className="skip-link">Skip to content</a>
        <NavBar />
        <main id="main" className="page">
          {children}
        </main>
      </body>
    </html>
  );
}
