import type { Metadata } from 'next';
import { NotFoundContent } from '@/components/not-found-content';

export const metadata: Metadata = { title: '404 — XRDB' };

export default function NotFound() {
  return <NotFoundContent />;
}
