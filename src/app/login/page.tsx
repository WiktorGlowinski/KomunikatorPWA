'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { getErrorMessage } from '@/lib/types';
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icon';

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
    } catch (err: unknown) {
      const msg = getErrorMessage(err, 'Wystąpił błąd podczas autoryzacji.');
      if (msg === 'Invalid login credentials') {
        setErrorMsg('Nieprawidłowy adres e-mail lub hasło.');
      } else if (msg === 'User already registered') {
        setErrorMsg('Użytkownik o tym adresie e-mail już istnieje.');
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (signUp: boolean) => {
    setIsSignUp(signUp);
    setErrorMsg('');
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[5fr_6fr]">
      <aside className="hidden flex-col justify-between bg-lime p-10 text-ink lg:flex">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-2 rounded-md font-semibold hover:underline focus-visible:outline-ink"
        >
          <Icon name="back" className="size-5" />
          Strona główna
        </Link>

        <Image
          src="/logo-full-ink.png"
          alt="CHATTER"
          width={535}
          height={720}
          priority
          className="mx-auto h-[min(52vh,30rem)] w-auto"
        />

        <p className="font-display max-w-sm text-5xl leading-[0.95] tracking-wide">
          Pokój w kilka sekund. Link w jedno kliknięcie.
        </p>
      </aside>

      <div className="flex flex-col px-5 py-4 sm:px-8 lg:px-16">
        <div className="lg:hidden">
          <Brand />
        </div>

        <main className="mx-auto my-auto w-full max-w-sm py-10">
          <div
            role="tablist"
            aria-label="Tryb"
            className="mb-8 grid grid-cols-2 rounded-md border border-line p-1 text-sm font-semibold"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!isSignUp}
              onClick={() => switchMode(false)}
              className={`min-h-10 rounded transition-colors ${
                !isSignUp ? 'bg-lime text-ink' : 'text-mute hover:text-paper'
              }`}
            >
              Logowanie
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isSignUp}
              onClick={() => switchMode(true)}
              className={`min-h-10 rounded transition-colors ${
                isSignUp ? 'bg-lime text-ink' : 'text-mute hover:text-paper'
              }`}
            >
              Nowe konto
            </button>
          </div>

          <h1 className="font-display text-5xl leading-none tracking-wide">
            {isSignUp ? 'Załóż konto' : 'Wejdź do swoich pokojów'}
          </h1>
          <p className="mt-3 text-mute">
            {isSignUp
              ? 'Wystarczą nazwa użytkownika, e-mail i hasło.'
              : 'Zaloguj się, żeby utworzyć pokój albo dołączyć do rozmowy.'}
          </p>

          {errorMsg && (
            <div
              role="alert"
              className="mt-6 flex items-start gap-2.5 rounded-md border border-danger/40 bg-danger/10 p-3.5 text-sm text-danger"
            >
              <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {isSignUp && (
              <div>
                <label htmlFor="username" className="label">
                  Nazwa użytkownika
                </label>
                <input
                  id="username"
                  type="text"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="np. Wiktor"
                  className="field"
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="label">
                Adres e-mail
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="uzytkownik@domena.pl"
                className="field"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Hasło
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="field"
              />
              {isSignUp && (
                <p className="mt-1.5 text-sm text-mute">Co najmniej 6 znaków.</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary mt-2 min-h-12 w-full text-base"
            >
              {loading
                ? isSignUp
                  ? 'Zakładanie konta…'
                  : 'Logowanie…'
                : isSignUp
                  ? 'Załóż konto'
                  : 'Zaloguj się'}
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}
