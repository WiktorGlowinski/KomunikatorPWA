'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function HomePage() {
  const router = useRouter();
  const [roomName, setRoomName] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setIsLoggedIn(true);
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', user.id)
          .single();
        if (profile?.username) {
          setUsername(profile.username);
        }
      }
      setLoading(false);
    };
    checkSession();
  }, []);

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRoom = roomName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!cleanRoom) return;
    router.push(`/room/${cleanRoom}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500 font-mono text-xs">
        Inicjalizacja sesji...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between selection:bg-zinc-800">
      {/* Pasek nawigacji technicznej */}
      <header className="border-b border-zinc-800/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-xs tracking-wider text-zinc-300">
            WEBRTC-SYSTEM // UKW
          </span>
        </div>

        <div>
          {isLoggedIn ? (
            <div className="flex items-center gap-4">
              <span className="text-xs text-zinc-400 font-mono">
                Użytkownik: <span className="text-zinc-200">{username || 'Aktywny'}</span>
              </span>
              <button
                onClick={() => router.push('/dashboard')}
                className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 transition"
              >
                Panel sal
              </button>
            </div>
          ) : (
            <button
              onClick={() => router.push('/login')}
              className="px-3 py-1.5 rounded border border-zinc-800 hover:bg-zinc-900 text-xs font-mono text-zinc-300 transition"
            >
              Logowanie do systemu
            </button>
          )}
        </div>
      </header>

      {/* Główny blok operacyjny */}
      <main className="max-w-lg w-full mx-auto px-6 py-12 flex-1 flex flex-col justify-center">
        <div className="border border-zinc-800 bg-zinc-900/50 rounded-xl p-8 backdrop-blur-sm shadow-xl">
          <div className="mb-6">
            <h1 className="text-lg font-semibold tracking-tight text-white mb-1">
              Dołączenie do wideokonferencji
            </h1>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Wprowadź identyfikator pokoju, aby nawiązać bezpośrednie połączenie z serwerem SFU. Zarządzanie uprawnieniami moderatorskimi i historią wymaga uwierzytelnienia.
            </p>
          </div>

          <form onSubmit={handleJoinRoom} className="space-y-4">
            <div>
              <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1.5">
                Identyfikator sali
              </label>
              <input
                type="text"
                required
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="np. sala-projektowa-1"
                className="w-full px-3.5 py-2.5 rounded bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder-zinc-600 font-mono focus:outline-none focus:border-zinc-500 transition"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-mono font-semibold uppercase tracking-wider transition"
            >
              Nawiąż połączenie WebRTC
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400 font-mono">
            <span>Status: {isLoggedIn ? 'Autoryzowany' : 'Gość'}</span>
            {isLoggedIn ? (
              <button
                onClick={() => router.push('/dashboard')}
                className="text-zinc-300 hover:text-white transition"
              >
                Przejdź do bazy sal →
              </button>
            ) : (
              <button
                onClick={() => router.push('/login')}
                className="text-zinc-300 hover:text-white transition"
              >
                Logowanie / Rejestracja →
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Stopka inżynierska */}
      <footer className="border-t border-zinc-900 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-zinc-500 font-mono">
        <span>Uniwersytet Kazimierza Wielkiego w Bydgoszczy</span>
        <span>Architektura: WebRTC SFU // PostgreSQL RLS</span>
      </footer>
    </div>
  );
}