import type { Metadata } from 'next';
import ClientAuthGuard from './ClientAuthGuard';

export const metadata: Metadata = {
  title: 'Pikachu HomeAI',
  description: 'Chat with Home AI - Pikachu, your personal assistant for all things home-related!',
};

export default function ChatbotLayout({ children }: { children: React.ReactNode }) {
  return <ClientAuthGuard>{children}</ClientAuthGuard>;
}
