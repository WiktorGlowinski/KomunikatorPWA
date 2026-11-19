import { NextRequest, NextResponse } from 'next/server';
import { RoomServiceClient } from 'livekit-server-sdk';
import { createClient } from '@supabase/supabase-js';

const rank = (role?: string | null) =>
  role === 'owner' || role === 'admin' ? 3 : role === 'moderator' ? 2 : role === 'member' ? 1 : 0;

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

  const { data: info } = await supabase.rpc('room_info', { p_name: roomName });
  if (!info?.exists || rank(info.role) < 2) {
    return NextResponse.json({ error: 'Brak uprawnień.' }, { status: 403 });
  }

  const { data: targetRole } = await supabase.rpc('rm_role', { p_room: info.id, p_user: targetId });
  if (rank(info.role) <= rank(targetRole)) {
    return NextResponse.json({ error: 'Brak uprawnień.' }, { status: 403 });
  }

  const host = livekitUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
  try {
    await new RoomServiceClient(host, apiKey, apiSecret).removeParticipant(info.name, targetId);
  } catch {
  }
  return NextResponse.json({ ok: true });
}
