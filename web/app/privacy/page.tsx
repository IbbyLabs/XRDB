import type { Metadata } from 'next';
import { PrivacyContent } from '@/components/privacy-content';

export const metadata: Metadata = { title: 'Privacy — XRDB' };

export default function PrivacyPage() {
  return <PrivacyContent />;
}
