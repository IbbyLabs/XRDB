import { NextResponse } from 'next/server';

const DISCORD_WIDGET_URL = 'https://discord.com/api/guilds/1486090954841522196/widget.json';
const CACHE_SECONDS = 120;
const CACHE_CONTROL = `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}`;

export async function GET() {
  const res = await fetch(DISCORD_WIDGET_URL, { next: { revalidate: CACHE_SECONDS } });
  if (!res.ok) {
    return NextResponse.json({ error: 'Widget unavailable' }, { status: 502 });
  }
  const data = await res.json();
  return NextResponse.json(data, {
    headers: { 'Cache-Control': CACHE_CONTROL },
  });
}
