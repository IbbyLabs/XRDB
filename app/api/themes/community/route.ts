import { NextResponse } from 'next/server';

import { listApprovedCommunityThemes } from '@/lib/communityThemeStore';

export async function GET() {
  try {
    const themes = await listApprovedCommunityThemes();
    return NextResponse.json({ themes });
  } catch {
    return NextResponse.json({ error: 'Failed to load themes.' }, { status: 500 });
  }
}
