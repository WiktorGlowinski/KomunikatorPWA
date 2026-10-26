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
    <div className="relative min-h-screen bg-[#030712] text-slate-100 flex flex-col justify-between overflow-hidden select-none selection:bg-slate-800">
      
   
      <div 
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(circle at 50% 45%, #0B1930 0%, #030712 70%)'
        }}
      />

   
      <div className="pointer-events-none absolute inset-0 overflow-hidden font-mono uppercase tracking-widest font-bold select-none">
        <span className="absolute top-[12%] left-[5%] md:left-[8%] text-2xl sm:text-4xl md:text-5xl text-[#1e293b]/50 animate-drift-1">
          Bezpieczeństwo
        </span>
        <span className="absolute top-[22%] right-[5%] md:right-[8%] text-2xl sm:text-4xl md:text-5xl text-[#1e293b]/50 animate-drift-2">
          Prywatność
        </span>
        <span className="absolute bottom-[24%] left-[6%] md:left-[10%] text-2xl sm:text-4xl md:text-5xl text-[#1e293b]/50 animate-drift-3">
          Wolność słowa
        </span>
        <span className="absolute bottom-[14%] right-[6%] md:right-[10%] text-2xl sm:text-4xl md:text-5xl text-[#1e293b]/50 animate-drift-4">
          Swoboda
        </span>
      </div>

      
      <main className="relative z-10 max-w-xl mx-auto px-6 py-16 flex-1 flex flex-col justify-center items-center text-center">
        
     
        <div className="mb-8 flex justify-center">
          <Image
            src="/logo.png"
            alt="Logo"
            width={96}
            height={96}
            priority
            className="h-20 sm:h-24 w-auto object-contain opacity-95 transition-opacity hover:opacity-100"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </div>

        <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-white mb-6 leading-tight">
          Prosty system rozmów <br />
          minimum danych, maksimum prywatności
        </h1>

        <p className="text-slate-400 text-xs sm:text-sm max-w-md mb-10 leading-relaxed font-sans">
          Aplikacja nie przechowuje informacji o użytkowniku i nie weryfikuje czatu. Obraz oraz dźwięk istnieją wyłącznie w pamięci operacyjnej podczas trwania połączenia.
        </p>

        <button
          onClick={() => router.push(isLoggedIn ? '/dashboard' : '/login')}
          className="px-8 py-3 rounded bg-white hover:bg-slate-200 text-[#030712] font-mono text-xs uppercase tracking-wider font-semibold transition"
        >
          {isLoggedIn ? 'Przejdź do panelu' : 'Zaloguj się'}
        </button>
      </main>

  
      <footer className="relative z-10 py-6 text-center text-[11px] font-mono text-slate-600 border-t border-slate-900/40">
        Prywatna przestrzeń wymiany myśli
      </footer>


      <style jsx>{`
        @keyframes drift1 {
          0%, 100% { transform: translate(0px, 0px) rotate(0deg); }
          25% { transform: translate(30px, -40px) rotate(2deg); }
          50% { transform: translate(-25px, -20px) rotate(-1deg); }
          75% { transform: translate(15px, 25px) rotate(1deg); }
        }
        @keyframes drift2 {
          0%, 100% { transform: translate(0px, 0px) rotate(0deg); }
          25% { transform: translate(-35px, 35px) rotate(-2deg); }
          50% { transform: translate(20px, 45px) rotate(1deg); }
          75% { transform: translate(-20px, -20px) rotate(-1deg); }
        }
        @keyframes drift3 {
          0%, 100% { transform: translate(0px, 0px) rotate(0deg); }
          25% { transform: translate(40px, 30px) rotate(2deg); }
          50% { transform: translate(-30px, 40px) rotate(-2deg); }
          75% { transform: translate(-15px, -35px) rotate(1deg); }
        }
        @keyframes drift4 {
          0%, 100% { transform: translate(0px, 0px) rotate(0deg); }
          25% { transform: translate(-40px, -35px) rotate(-2deg); }
          50% { transform: translate(35px, -25px) rotate(2deg); }
          75% { transform: translate(20px, 30px) rotate(-1deg); }
        }

        .animate-drift-1 { animation: drift1 8s ease-in-out infinite; }
        .animate-drift-2 { animation: drift2 9s ease-in-out infinite; }
        .animate-drift-3 { animation: drift3 10s ease-in-out infinite; }
        .animate-drift-4 { animation: drift4 8.5s ease-in-out infinite; }
      `}</style>
    </div>
  );
}