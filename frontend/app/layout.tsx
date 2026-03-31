import type { Metadata } from 'next';
import { DM_Sans, DM_Serif_Display, JetBrains_Mono } from 'next/font/google';
import '../styles/tokens.css';
import '../styles/typography.css';
import './globals.css';
import { Providers } from './providers';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

const dmSerifDisplay = DM_Serif_Display({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Sabit — Financial Close Engine',
  description: 'GL to certified financial statements for PE-backed mid-market companies.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${dmSans.variable} ${jetbrainsMono.variable} ${dmSerifDisplay.variable} font-sans antialiased min-h-screen`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
