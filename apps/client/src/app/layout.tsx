import type { Metadata } from 'next';
import { Fraunces, Inter, JetBrains_Mono } from 'next/font/google';
import { palette } from '../theme/palette';

// Self-hosted via next/font — no external request, no layout shift.
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-ui',
  display: 'swap',
});
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Faceless Spectre',
  description: 'Server-authoritative 3D multiplayer card platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body
        style={{
          margin: 0,
          padding: 0,
          background: palette.bgDeep,
          overflow: 'hidden',
          fontFamily: 'var(--font-ui), system-ui, sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
