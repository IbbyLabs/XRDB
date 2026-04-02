import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    id: 'org.xrdb.docs-capture',
    version: '1.0.0',
    name: 'XRDB Docs Capture Addon',
    description: 'Local manifest used to capture stable configurator screenshots.',
    resources: ['catalog', 'meta'],
    types: ['movie', 'series'],
    catalogs: [
      {
        type: 'movie',
        id: 'xrdb-docs-trending',
        name: 'Docs Capture Movies',
      },
      {
        type: 'series',
        id: 'xrdb-docs-series',
        name: 'Docs Capture Series',
      },
    ],
  });
}
