'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';
import { supabase } from '@/lib/supabaseClient';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [token, setToken] = useState<string>('');
  const [username, setUsername] = useState<string>('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/login');
        return;
      }

     
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single();

      const nick = profile?.username || user.email?.split('@')[0] || 'Uczestnik';
      setUsername(nick);

    
      try {
        const resp = await fetch(`/api/token?room=${roomId}&username=${nick}`);
        const data = await resp.json();
        setToken(data.token);
      } catch (e) {
        console.error('Błąd pobierania tokena:', e);
      }
    })();
  }, [roomId, router]);

  if (!token) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-white font-sans">
        <p className="text-lg animate-pulse">Łączenie z salą: {roomId} jako {username || '...'}</p>
      </div>
    );
  }

  return (
    <main className="h-screen w-screen bg-zinc-950 flex flex-col">
      <header className="h-12 border-b border-zinc-800 bg-zinc-900 px-4 flex items-center justify-between text-sm text-zinc-300">
        <div>Pokój: <span className="font-semibold text-white">{roomId}</span></div>
        <button
          onClick={() => router.push('/dashboard')}
          className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-xs text-white transition"
        >
          Opuść salę
        </button>
      </header>
      <div className="flex-1">
        <LiveKitRoom
          video={true}
          audio={true}
          token={token}
          connect={true}
          serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
          data-lk-theme="default"
          style={{ height: 'calc(100vh - 48px)' }}
        >
          <VideoConference />
        </LiveKitRoom>
      </div>
    </main>
  );
}