'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function LandingPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setIsLoggedIn(true);
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', user.id)
          .single();
        if (profile) setUsername(profile.username);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col justify-between selection:bg-blue-500 selection:text-white">
      {/* Pasek górny */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur sticky top-0 z-50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-600/30">
              K
            </div>
            <span className="font-bold text-lg tracking-tight">Komunikator WebRTC</span>
          </div>

          <div className="flex items-center gap-4">
            {isLoggedIn ? (
              <button
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium transition shadow-lg shadow-blue-600/20"
              >
                Panel sal ({username || 'Profil'}) →
              </button>
            ) : (
              <button
                onClick={() => router.push('/login')}
                className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-sm font-medium transition text-zinc-200 hover:text-white"
              >
                Zaloguj się
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Sekcja Główna (Hero) */}
      <main className="flex-1 max-w-6xl mx-auto px-6 py-20 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-medium mb-8">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
          Projekt Inżynierski • Uniwersytet Kazimierza Wielkiego w Bydgoszczy
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight max-w-4xl leading-tight sm:leading-none mb-6">
          Wieloplatformowy system wideokonferencji w <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500">czasie rzeczywistym</span>
        </h1>

        <p className="text-zinc-400 text-lg sm:text-xl max-w-2xl mb-10">
          Lekki, bezpieczny komunikator oparty na architekturze SFU, protokole WebRTC i bazie PostgreSQL. Działa natychmiast na telefonie i komputerze bez instalacji.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mb-20">
          <button
            onClick={() => router.push(isLoggedIn ? '/dashboard' : '/login')}
            className="px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition shadow-xl shadow-blue-600/30 text-base"
          >
            {isLoggedIn ? 'Otwórz panel pokojów' : 'Rozpocznij korzystanie'}
          </button>
          <a
            href="#funkcje"
            className="px-8 py-3.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 text-zinc-300 font-semibold transition text-base"
          >
            Poznaj możliwości
          </a>
        </div>

        {/* Siatka atutów systemu */}
        <section id="funkcje" className="w-full pt-12 border-t border-zinc-900 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-lg mb-4">
              🎥
            </div>
            <h3 className="text-lg font-semibold mb-2">Transmisja Audio-Wideo SFU</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Dedykowany serwer dystrybucji mediów LiveKit optymalizuje ruch sieciowy, eliminując przeciążenia znane z tradycyjnych połączeń P2P Mesh.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-lg mb-4">
              🛡️
            </div>
            <h3 className="text-lg font-semibold mb-2">Hierarchiczna Moderacja</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Model kontroli dostępu (Owner, Moderator, Member) pozwala na delegowanie praw, natychmiastowe wyciszanie uczestników i audyt działań w bazie.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800/80">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-lg mb-4">
              📱
            </div>
            <h3 className="text-lg font-semibold mb-2">Standard PWA (Wieloplatformowość)</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Jeden responsywny kod źródłowy zintegrowany z mechanizmem Service Worker pozwala na natywne uruchomienie na systemach Windows, macOS, Android i iOS.
            </p>
          </div>
        </section>
      </main>

      {/* Stopka */}
      <footer className="border-t border-zinc-900 py-6 px-6 text-center text-xs text-zinc-500">
        Praca dyplomowa inżynierska • Wydział Informatyki UKW w Bydgoszczy • Wiktor
      </footer>
    </div>
  );
}