'use client';

import { useState, useEffect } from 'react';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';

export default function Home() {
  const [token, setToken] = useState<string>('');
  const room = 'pokoj-inzynierski';
  const name = 'Wiktor';

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch(`/api/token?room=${room}&username=${name}`);
        const data = await resp.json();
        setToken(data.token);
      } catch (e) {
        console.error('Błąd pobierania tokena:', e);
      }
    })();
  }, []);

  if (token === '') {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-900 text-white font-sans">
        <p className="text-xl animate-pulse">Łączenie z serwerem SFU LiveKit...</p>
      </div>
    );
  }

  return (
    <main className="h-screen w-screen bg-zinc-950">
      <LiveKitRoom
        video={true}
        audio={true}
        token={token}
        connect={true}
        serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
        data-lk-theme="default"
        style={{ height: '100vh' }}
      >
        <VideoConference />
      </LiveKitRoom>
    </main>
  );
}