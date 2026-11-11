import { NextRequest, NextResponse } from 'next/server';
import { AccessToken } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  // 1. Pokój
  const room = req.nextUrl.searchParams.get('room')?.trim();
  if (!room || room.length > 100) {
    return NextResponse.json({ error: 'Nieprawidłowa nazwa pokoju.' }, { status: 400 });
  }

  // 2. Sesja użytkownika: token Supabase przychodzi w nagłówku Authorization
  const authHeader = req.headers.get('authorization') ?? '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!accessToken) {
    return NextResponse.json({ error: 'Zaloguj się, aby dołączyć do pokoju.' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;

  if (!supabaseUrl || !supabaseAnonKey || !apiKey || !apiSecret) {
    return NextResponse.json({ error: 'Brak konfiguracji serwera.' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Supabase sprawdza podpis i ważność tokenu – nie da się podszyć pod kogoś innego
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) {
    return NextResponse.json({ error: 'Sesja wygasła. Zaloguj się ponownie.' }, { status: 401 });
  }

  // 3. Nazwa pochodzi z bazy, nie z parametru w adresie
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .maybeSingle();

  const displayName = profile?.username || user.email?.split('@')[0] || 'Użytkownik';

  // identity = ID konta (unikalne, nie do podrobienia), name = to, co widzą inni
  const at = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: displayName,
  });

  at.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
  });

  const token = await at.toJwt();
  return NextResponse.json({ token }, { headers: { 'Cache-Control': 'no-store' } });
}