import type { Metadata } from 'next';
import './globals.css';
import 'katex/dist/katex.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

export const metadata: Metadata = {
  title: 'Pikachu HomeAI',
  description:
    'Chat with Home AI - Pikachu, your personal assistant for all things home-related!',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
