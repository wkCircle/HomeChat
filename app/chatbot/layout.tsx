import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pikachu HomeAI',
  description: 'Chat with Home AI - Pikachu, your personal assistant for all things home-related!',
};

export default function ChatbotLayout({ children }: { children: React.ReactNode }) {
  return children;
}
