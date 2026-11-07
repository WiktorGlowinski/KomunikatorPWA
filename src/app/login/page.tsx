'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      if (isSignUp) {
        const cleanUsername = username.trim() || email.split('@')[0];
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: cleanUsername,
            },
          },
        });
        if (error) throw error;
        router.push('/dashboard');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        router.push('/dashboard');
      }
    } catch (err: any) {
      if (err.message === 'Invalid login credentials') {
        setErrorMsg('Nieprawidłowy adres e-mail lub hasło.');
      } else if (err.message === 'User already registered') {
        setErrorMsg('Użytkownik o tym adresie e-mail już istnieje.');
      } else {
        setErrorMsg(err.message || 'Wystąpił błąd podczas autoryzacji.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#090c15] text-slate-100 flex flex-col justify-between overflow-hidden selection:bg-blue-600 selection:text-white font-sans">
      <div className="pointer-events-none absolute top-[-100px] left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/15 blur-[130px] rounded-full" />
      <div className="pointer-events-none absolute bottom-[-100px] right-[-100px] w-[500px] h-[500px] bg-indigo-600/10 blur-[150px] rounded-full" />

      <header className="relative z-10 max-w-6xl w-full mx-auto px-6 py-6 flex items-center justify-between border-b border-slate-800/80">
        <div className="flex items-center gap-3.5 cursor-pointer" onClick={() => router.push('/')}>
          <Image
            src="/logo.png"
            alt="CHATTER"
            width={48}
            height={48}
            priority
            className="h-10 w-auto object-contain"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <span className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase font-mono">
            CHATTER
          </span>
        </div>

        <button
          onClick={() => router.push('/')}
          className="px-5 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 text-slate-200 text-xs font-semibold uppercase tracking-wider transition active:scale-95"
        >
          ← Powrót
        </button>
      </header>

      <main className="relative z-10 max-w-md w-full mx-auto px-6 py-12 flex-1 flex flex-col justify-center">
        <div className="p-8 rounded-2xl bg-[#121724]/90 border border-slate-800/80 shadow-2xl backdrop-blur-md">
          <div className="mb-6 text-center">
            <div className="inline-flex items-center px-3.5 py-1 rounded-full bg-blue-950/80 border border-blue-500/40 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-3">
              {isSignUp ? 'Rejestracja konta' : 'Autoryzacja dostępu'}
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
              {isSignUp ? 'Utwórz konto w CHATTER' : 'Zaloguj się do CHATTER'}
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm">
              {isSignUp 
                ? 'Wprowadź swoje dane, aby utworzyć konto w systemie.' 
                : 'Podaj swoje dane uwierzytelniające, aby przejść do panelu sal.'}
            </p>
          </div>

          {errorMsg && (
            <div className="mb-5 p-3.5 rounded-xl border border-rose-500/30 bg-rose-950/40 text-rose-300 text-xs leading-relaxed flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Nazwa użytkownika
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="np. Wiktor"
                  className="w-full px-4 py-3 rounded-xl bg-[#0b0e17] border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Adres e-mail
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="uzytkownik@domena.pl"
                className="w-full px-4 py-3 rounded-xl bg-[#0b0e17] border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Hasło
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-4 py-3 rounded-xl bg-[#0b0e17] border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-blue-600/30 hover:shadow-blue-600/40 active:scale-95"
            >
              {loading 
                ? 'Weryfikacja...' 
                : isSignUp 
                  ? 'Zarejestruj konto' 
                  : 'Zaloguj się'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setErrorMsg('');
              }}
              className="text-xs text-slate-400 hover:text-blue-400 transition"
            >
              {isSignUp 
                ? 'Masz już konto? Zaloguj się' 
                : 'Nie masz konta? Zarejestruj się'}
            </button>
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