import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const room = req.nextUrl.searchParams.get('room') || 'pokoj-testowy';
  const username = req.nextUrl.searchParams.get('username') || 'Wiktor';

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  // Wypisujemy w konsoli terminala stan zmiennych
  console.log('--- DIAGNOSTYKA ENV ---');
  console.log('LIVEKIT_API_KEY:', apiKey ? 'WIDOCZNY' : 'BRAK (undefined)');
  console.log('LIVEKIT_API_SECRET:', apiSecret ? 'WIDOCZNY' : 'BRAK (undefined)');
  console.log('NEXT_PUBLIC_LIVEKIT_URL:', wsUrl ? 'WIDOCZNY' : 'BRAK (undefined)');

  if (!apiKey || !apiSecret || !wsUrl) {
    return NextResponse.json(
      {
        komunikat: 'Serwer nie widzi zmiennych!',
        stan: {
          LIVEKIT_API_KEY: apiKey ? 'OK' : 'BRAK',
          LIVEKIT_API_SECRET: apiSecret ? 'OK' : 'BRAK',
          NEXT_PUBLIC_LIVEKIT_URL: wsUrl ? 'OK' : 'BRAK',
        },
      },
      { status: 500 }
    );
  }

  try {
    const at = new AccessToken(apiKey, apiSecret, { identity: username });
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    const token = await at.toJwt();
    return NextResponse.json({ sukces: true, token });
  } catch (err: any) {
    return NextResponse.json({ blad_biblioteki: err.message }, { status: 500 });
  }
}