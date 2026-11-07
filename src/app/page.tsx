'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';

export default function HomePage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');

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
    };
    checkSession();
  }, []);

  return (
    <div className="relative min-h-screen bg-[#090c15] text-slate-100 flex flex-col justify-between overflow-hidden selection:bg-blue-600 selection:text-white font-sans">
      <div className="pointer-events-none absolute top-[-100px] left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/15 blur-[130px] rounded-full" />
      <div className="pointer-events-none absolute bottom-[-100px] right-[-100px] w-[500px] h-[500px] bg-indigo-600/10 blur-[150px] rounded-full" />

      <header className="relative z-10 max-w-6xl w-full mx-auto px-6 py-4 flex items-center justify-between border-b border-slate-800/80">
        <div className="flex items-center gap-5 cursor-pointer" onClick={() => router.push('/')}>
          <Image
            src="/logo.png"
            alt="CHATTER"
            width={120}
            height={120}
            priority
            className="h-24 sm:h-32 w-auto object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
         
        </div>

        <div>
          {isLoggedIn ? (
            <button
              onClick={() => router.push('/dashboard')}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold uppercase tracking-wider transition shadow-lg shadow-blue-600/25 active:scale-95"
            >
              Panel ({username || 'Konto'}) →
            </button>
          ) : (
            <button
              onClick={() => router.push('/login')}
              className="px-5 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 text-slate-200 text-xs font-semibold uppercase tracking-wider transition active:scale-95"
            >
              Zaloguj się
            </button>
          )}
        </div>
      </header>

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-16 flex-1 flex flex-col justify-center items-center text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-950/80 border border-blue-500/40 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-8 shadow-sm">
          Szybka i prywatna komunikacja
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight max-w-3xl">
          Głos i wideo bez zbędnych ograniczeń. <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-blue-300 to-indigo-300">
            Po prostu rozmawiaj.
          </span>
        </h1>

        <p className="text-slate-400 text-base sm:text-lg max-w-2xl mb-10 leading-relaxed font-normal">
          CHATTER to minimalistyczna platforma do prowadzenia płynnych rozmów wideo i głosowych. Twórz własne pokoje, wysyłaj linki i rozmawiaj bez instalowania aplikacji.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
          <button
            onClick={() => router.push(isLoggedIn ? '/dashboard' : '/login')}
            className="w-full sm:w-auto px-9 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm tracking-wide transition-all shadow-xl shadow-blue-600/30 hover:shadow-blue-600/40 active:scale-95"
          >
            {isLoggedIn ? 'Otwórz panel główny' : 'Rozpocznij teraz'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 w-full text-left">
          <div className="p-6 rounded-2xl bg-[#121724]/90 border border-slate-800/80 hover:border-blue-500/40 transition-all duration-300 hover:-translate-y-1 shadow-lg">
            <div className="w-10 h-10 rounded-xl bg-blue-600/15 text-blue-400 flex items-center justify-center mb-4 border border-blue-500/20">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h3 className="text-white font-bold text-base mb-2">Krystaliczny dźwięk</h3>
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
              Architektura SFU gwarantuje minimalne opóźnienia oraz stabilne przesyłanie strumieni audio-wideo bez obciążania systemu.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#121724]/90 border border-slate-800/80 hover:border-blue-500/40 transition-all duration-300 hover:-translate-y-1 shadow-lg">
            <div className="w-10 h-10 rounded-xl bg-blue-600/15 text-blue-400 flex items-center justify-center mb-4 border border-blue-500/20">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-white font-bold text-base mb-2">Pełna prywatność</h3>
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
              Brak zbędnych trackerów i skryptów analitycznych. Twoje transmisje audio i wideo istnieją tylko podczas trwania sesji.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-[#121724]/90 border border-slate-800/80 hover:border-blue-500/40 transition-all duration-300 hover:-translate-y-1 shadow-lg">
            <div className="w-10 h-10 rounded-xl bg-blue-600/15 text-blue-400 flex items-center justify-center mb-4 border border-blue-500/20">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-white font-bold text-base mb-2">Szybki dostęp</h3>
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
              Twórz pokoje w kilka sekund. Dołączaj bezpośrednio z poziomu przeglądarki bez konieczności pobierania jakichkolwiek plików.
            </p>
          </div>
        </div>
      </main>

      <footer className="relative z-10 py-6 text-center text-xs text-slate-500 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between px-6 max-w-6xl w-full mx-auto gap-2">
        <span>CHATTER © {new Date().getFullYear()}</span>
        <span>Bezpieczna komunikacja WebRTC</span>
      </footer>
    </div>
  );
}