import { EntryPageClient } from '@/components/entry-page-client';

export const dynamic = 'force-dynamic';

export default function EntryPage() {
  return <EntryPageClient instanceHtml={process.env.XRDB_INSTANCE_HTML ?? ''} />;
}
