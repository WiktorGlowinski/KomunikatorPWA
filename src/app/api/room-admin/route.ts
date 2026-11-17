import { NextRequest, NextResponse } from 'next/server';
import { RoomServiceClient } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';

// owner (administrator) > moderator > member
const rank = (role?: string | null) =>
  role === 'owner' || role === 'admin' ? 3 : role === 'moderator' ? 2 : role === 'member' ? 1 : 0;

/**
 * Rozłącza osobę z trwającej rozmowy: { room, userId }.
 * Zmiany w bazie (usunięcie z pokoju, blokada) robi panel moderacji; ta trasa tylko
 * wyrzuca z rozmowy i sprawdza, czy wywołujący ma do tego prawo
 * (moderator lub administrator, i tylko wobec osoby niższej rangi).
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!accessToken) {
    return NextResponse.json({ error: 'Brak sesji.' }, { status: 401 });
  }

  let body: { room?: string; userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Nieprawidłowe dane.' }, { status: 400 });
  }
  const roomName = body.room?.trim();
  const targetId = body.userId;
  if (!roomName || !targetId) {
    return NextResponse.json({ error: 'Brak pokoju lub użytkownika.' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!supabaseUrl || !supabaseAnonKey || !livekitUrl || !apiKey || !apiSecret) {
    return NextResponse.json({ error: 'Brak konfiguracji serwera.' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !user) {
    return NextResponse.json({ error: 'Sesja wygasła.' }, { status: 401 });
  }

  // Rola wywołującego w tym pokoju
  const { data: info } = await supabase.rpc('room_info', { p_name: roomName });
  if (!info?.exists || rank(info.role) < 2) {
    return NextResponse.json({ error: 'Brak uprawnień.' }, { status: 403 });
  }

  // Wolno wyrzucić tylko kogoś o niższej randze (po usunięciu z pokoju jego ranga to 0)
  const { data: targetRole } = await supabase.rpc('rm_role', { p_room: info.id, p_user: targetId });
  if (rank(info.role) <= rank(targetRole)) {
    return NextResponse.json({ error: 'Brak uprawnień.' }, { status: 403 });
  }

  const host = livekitUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  try {
    await new RoomServiceClient(host, apiKey, apiSecret).removeParticipant(info.name, targetId);
  } catch {
    // Osoby nie ma w trwającej rozmowie, to nie jest błąd
  }
  return NextResponse.json({ ok: true });
}
