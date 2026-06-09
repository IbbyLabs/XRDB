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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fontBody.variable} ${fontDisplay.variable}`}>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        <NavBar />
        <main id="main" className="xrdb-page">
          {children}
        </main>
      </body>
    </html>
  );
}
