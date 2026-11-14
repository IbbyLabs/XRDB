import type { Metadata } from 'next';
import { HelpContent } from '@/components/help-content';

export const metadata: Metadata = { title: 'Help — XRDB' };

export default function HelpPage() {
  return <HelpContent />;
}
