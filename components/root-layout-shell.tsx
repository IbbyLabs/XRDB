import { ReactNode } from 'react';
import { Space_Grotesk, Unbounded } from 'next/font/google';

const bodyFont = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

const displayFont = Unbounded({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const siteBodyClassName = `${bodyFont.variable} ${displayFont.variable} antialiased`;

export function RootLayoutShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={siteBodyClassName} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
