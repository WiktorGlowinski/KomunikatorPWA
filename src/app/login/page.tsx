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
    <div className="relative min-h-screen bg-[#030712] text-slate-100 flex flex-col justify-between overflow-hidden selection:bg-slate-800">
      
      <div 
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(circle at 50% 40%, #0B1930 0%, #030712 70%)'
        }}
      

      ></div>
      

      <main className="relative z-10 max-w-md w-full mx-auto px-6 py-12 flex-1 flex flex-col justify-center">
        <div className="border border-slate-800 bg-[#070D18]/90 backdrop-blur-md rounded-xl p-8 shadow-2xl">
          
          <div className="mb-6">
            
            <h1 className="text-xl font-semibold tracking-tight text-white mb-1.5">
              {isSignUp ? 'Utwórz konto w systemie' : 'Zaloguj się do systemu'}
            </h1>
            <p className="text-xs text-slate-400 font-sans">
              {isSignUp 
                ? 'Wprowadź dane, aby utworzyć indywidualny identyfikator w bazie.' 
                : 'Podaj dane uwierzytelniające, aby przejść do panelu sal.'}
            </p>
          </div>

          {errorMsg && (
            <div className="mb-5 p-3 rounded border border-rose-900/60 bg-rose-950/30 text-rose-300 font-mono text-xs leading-relaxed">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                  Nazwa użytkownika
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="np. Wiktor"
                  className="w-full px-3.5 py-2.5 rounded bg-[#030712] border border-slate-800 text-sm text-slate-100 placeholder-slate-600 font-mono focus:outline-none focus:border-slate-500 transition"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                Adres e-mail
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="uzytkownik@domena.pl"
                className="w-full px-3.5 py-2.5 rounded bg-[#030712] border border-slate-800 text-sm text-slate-100 placeholder-slate-600 font-mono focus:outline-none focus:border-slate-500 transition"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5">
                Hasło
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3.5 py-2.5 rounded bg-[#030712] border border-slate-800 text-sm text-slate-100 placeholder-slate-600 font-mono focus:outline-none focus:border-slate-500 transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 rounded bg-white hover:bg-slate-200 disabled:opacity-50 text-[#030712] font-mono text-xs uppercase tracking-wider font-semibold transition"
            >
              {loading 
                ? 'Weryfikacja...' 
                : isSignUp 
                  ? 'Zarejestruj konto' 
                  : 'Zaloguj się'}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-900 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setErrorMsg('');
              }}
              className="text-xs font-mono text-slate-400 hover:text-slate-200 transition"
            >
              {isSignUp 
                ? 'Posiadasz już konto? Zaloguj się' 
                : 'Brak konta? Zarejestruj się'}
            </button>
            
          </div>
        </div>
              <button
          onClick={() => router.push('/')}
          className="px-3.5 py-1.5 rounded border border-slate-800 bg-[#0B1528] hover:border-slate-700 text-xs font-mono text-slate-300 transition"
        >
          ← Powrót
        </button>
      </main>

     
    </div>
  );
}