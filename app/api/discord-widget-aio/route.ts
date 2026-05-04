import { NextResponse } from 'next/server';

const GUILD_ID = '1225024298490662974';
const CACHE_SECONDS = 120;
const CACHE_CONTROL = `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS}`;

export async function GET() {
  if (!GUILD_ID) {
    return NextResponse.json({ error: 'Widget not configured' }, { status: 404 });
  }
  const url = `https://discord.com/api/guilds/${GUILD_ID}/widget.json`;
  const res = await fetch(url, { next: { revalidate: CACHE_SECONDS } });
  if (!res.ok) {
    return NextResponse.json({ error: 'Widget unavailable' }, { status: 502 });
  }
  const data = await res.json();
  return NextResponse.json(data, {
    headers: { 'Cache-Control': CACHE_CONTROL },
  });
}
