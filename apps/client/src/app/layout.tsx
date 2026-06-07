import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Faceless Spectre',
  description: 'Server-authoritative 3D multiplayer card platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#1a1a2e', overflow: 'hidden' }}>
        {children}
      </body>
    </html>
  );
}
