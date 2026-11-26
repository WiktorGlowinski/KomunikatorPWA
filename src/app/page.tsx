'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { Brand } from '@/components/Brand';
import { Ticks } from '@/components/Ticks';
import { Icon } from '@/components/Icon';

type AuthStatus = 'loading' | 'in' | 'out';

const STEPS = [
  {
    title: 'Utwórz pokój',
    text: 'Wpisz nazwę. Stanie się częścią adresu, więc łatwo ją podyktować albo wkleić w wiadomość.',
  },
  {
    title: 'Wyślij link',
    text: 'Utwórz zaproszenie w panelu i wyślij je osobom, które chcesz dodać do pokoju.',
  },
  {
    title: 'Rozmawiaj',
    text: 'Głos, kamera, udostępnianie ekranu i czat w jednym oknie przeglądarki.',
  },
];

const UNDER_THE_HOOD = [
  {
    term: 'Dźwięk i obraz',
    text: 'Przesyła je serwer SFU (LiveKit). Każdy uczestnik wysyła jeden strumień, a serwer rozsyła go dalej, więc łącze nie dławi się przy większej grupie.',
  },
  {
    term: 'Konta, pokoje i czat',
    text: 'Logowanie, lista pokojów i wiadomości trafiają do bazy PostgreSQL w Supabase.',
  },
  {
    term: 'Przeglądarka',
    text: 'Całość oparta jest na WebRTC. Nie potrzeba wtyczek ani instalatora.',
  },
];

export default function HomePage() {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [username, setUsername] = useState('');
  const [roomName, setRoomName] = useState('');

  useEffect(() => {
    const checkSession = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setStatus('out');
        return;
      }
      setStatus('in');
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single();
      if (profile?.username) {
        setUsername(profile.username);
      }
    };
    checkSession();
  }, []);

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    const slug = roomName.trim().toLowerCase().replace(/\s+/g, '-');
    if (slug) {
      try {
        sessionStorage.setItem('chatter:room', slug);
      } catch {
      }
    }
    router.push(status === 'in' ? '/dashboard' : '/login');
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <Brand />

        {status === 'loading' ? (
          <div className="h-11 w-28 rounded-md bg-raised" aria-hidden="true" />
        ) : status === 'in' ? (
          <Link href="/dashboard" className="btn btn-ghost">
            {username ? `Panel: ${username}` : 'Panel'}
          </Link>
        ) : (
          <Link href="/login" className="btn btn-ghost">
            Zaloguj się
          </Link>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 sm:px-8">
        <section className="grid items-center gap-14 py-12 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div>
            <h1 className="font-display text-[clamp(3.75rem,12vw,8.5rem)] leading-[0.88] tracking-wide text-paper">
              Twój pokój.
              <br />
              Twoje zaproszenia.
            </h1>

            <p className="mt-6 max-w-md text-lg leading-relaxed text-mute">
              Rozmowy głosowe, wideo i czat w przeglądarce. Niczego nie
              instalujesz i niczego nie konfigurujesz.
            </p>

            <form onSubmit={handleStart} className="mt-10 max-w-lg">
              <label htmlFor="room-name" className="label">
                Nazwa pokoju
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex min-h-12 flex-1 items-center rounded-md border border-line bg-panel transition-colors focus-within:border-lime focus-within:ring-2 focus-within:ring-lime/25">
                  <span className="select-none pl-4 text-sm text-mute">/room/</span>
                  <input
                    id="room-name"
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="sala-projektowa"
                    autoComplete="off"
                    className="min-w-0 flex-1 bg-transparent py-3 pl-1 pr-4 text-sm text-paper placeholder:text-mute/60 focus:outline-none"
                  />
                </div>
                <button type="submit" className="btn btn-primary min-h-12 px-7 text-base">
                  Utwórz pokój
                </button>
              </div>
              <p className="mt-3 text-sm text-mute">
                Do pokoju dołącza się przez zaproszenie. Nowe osoby po założeniu konta zobaczą pokój w panelu.
              </p>
            </form>
          </div>

          <RoomMock />
        </section>

        <section className="border-t border-line py-16">
          <h2 className="font-display text-5xl tracking-wide sm:text-6xl">
            Trzy kroki do rozmowy
          </h2>
          <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-0">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className={`md:px-8 ${
                  i === 0 ? 'md:pl-0' : 'md:border-l md:border-line'
                }`}
              >
                <span className="font-display text-6xl leading-none text-lime">
                  {i + 1}
                </span>
                <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 max-w-xs leading-relaxed text-mute">
                  {step.text}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-8 border-t border-line py-16 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <h2 className="font-display text-5xl tracking-wide sm:text-6xl">
            Co jest pod spodem
          </h2>
          <dl className="divide-y divide-line border-y border-line">
            {UNDER_THE_HOOD.map((item) => (
              <div key={item.term} className="grid gap-1 py-5 sm:grid-cols-[11rem_1fr] sm:gap-6">
                <dt className="font-semibold">{item.term}</dt>
                <dd className="max-w-xl leading-relaxed text-mute">{item.text}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 border-t border-line px-5 py-6 text-sm text-mute sm:flex-row sm:px-8">
        <span>CHATTER © {new Date().getFullYear()}</span>
        <span>Zbudowane na WebRTC</span>
      </footer>
    </div>
  );
}

function RoomMock() {
  const people = [
    { name: 'Ola', speaking: true, muted: false },
    { name: 'Marek', speaking: false, muted: true },
    { name: 'Kasia', speaking: false, muted: false },
    { name: 'Tomek', speaking: false, muted: false },
  ];

  return (
    <div
      aria-hidden="true"
      className="rounded-lg border border-line bg-panel p-3 shadow-[10px_10px_0_0_#c8f03c] sm:p-4"
    >
      <div className="mb-3 flex items-center justify-between px-1 text-sm">
        <span className="font-semibold">sala-projektowa</span>
        <span className="text-mute">4 osoby</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {people.map((p) => (
          <div
            key={p.name}
            className={`relative flex aspect-[4/3] items-center justify-center rounded-md bg-raised ${
              p.speaking ? 'ring-2 ring-lime' : ''
            }`}
          >
            <div className="relative">
              {p.speaking && (
                <Ticks
                  active
                  className="absolute right-full top-1/2 mr-0.5 size-9 -translate-y-1/2 text-lime sm:size-10"
                />
              )}
              <div
                className={`font-display flex size-14 items-center justify-center rounded-full text-3xl sm:size-16 ${
                  p.speaking ? 'bg-lime text-ink' : 'bg-line text-paper'
                }`}
              >
                {p.name[0]}
              </div>
            </div>

            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded bg-ink/80 px-2 py-0.5 text-xs">
              {p.name}
              {p.muted && <Icon name="micOff" className="size-3.5 text-danger" />}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-center gap-2">
        <span className="flex size-10 items-center justify-center rounded-full bg-raised">
          <Icon name="mic" className="size-5" />
        </span>
        <span className="flex size-10 items-center justify-center rounded-full bg-raised">
          <Icon name="cam" className="size-5" />
        </span>
        <span className="flex size-10 items-center justify-center rounded-full bg-raised">
          <Icon name="screen" className="size-5" />
        </span>
        <span className="flex size-10 items-center justify-center rounded-full bg-lime text-ink">
          <Icon name="chat" className="size-5" />
        </span>
      </div>
    </div>
  );
}
