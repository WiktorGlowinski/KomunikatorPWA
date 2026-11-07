'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';

interface Room {
  id: string;
  name: string;
  created_at: string;
  owner_id: string;
  is_private: boolean;
  access_code?: string | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [roomName, setRoomName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [roomAccessCode, setRoomAccessCode] = useState('');

  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [editName, setEditName] = useState('');
  const [editIsPrivate, setEditIsPrivate] = useState(false);
  const [editAccessCode, setEditAccessCode] = useState('');

  const [joiningRoom, setJoiningRoom] = useState<Room | null>(null);
  const [inputAccessCode, setInputAccessCode] = useState('');

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);

      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single();
      if (profile?.username) {
        setUsername(profile.username);
      }

      await fetchRooms();
      setLoading(false);
    };
    init();
  }, [router]);

  const fetchRooms = async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setRooms(data);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanSlug = roomName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!cleanSlug || !user) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('rooms').insert([
        {
          name: cleanSlug,
          owner_id: user.id,
          is_private: isPrivate,
          access_code: isPrivate ? (roomAccessCode.trim() || null) : null,
        },
      ]);

      if (error) throw error;
      router.push(`/room/${cleanSlug}`);
    } catch (err: any) {
      setErrorMsg(err.message || 'Błąd podczas tworzenia pokoju.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom) return;

    const cleanSlug = editName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!cleanSlug) return;

    try {
      const { error } = await supabase
        .from('rooms')
        .update({
          name: cleanSlug,
          is_private: editIsPrivate,
          access_code: editIsPrivate ? (editAccessCode.trim() || null) : null,
        })
        .eq('id', editingRoom.id);

      if (error) throw error;
      setEditingRoom(null);
      await fetchRooms();
    } catch (err: any) {
      alert(err.message || 'Błąd podczas edycji pokoju.');
    }
  };

  const handleDeleteRoom = async (roomId: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten pokój?')) return;

    try {
      const { error } = await supabase.from('rooms').delete().eq('id', roomId);
      if (error) throw error;
      await fetchRooms();
    } catch (err: any) {
      alert(err.message || 'Błąd podczas usuwania pokoju.');
    }
  };

  const handleJoinClick = (room: Room) => {
    if (room.is_private || room.access_code) {
      setJoiningRoom(room);
      setInputAccessCode('');
      setErrorMsg('');
    } else {
      router.push(`/room/${room.name}`);
    }
  };

  const handleVerifyCodeAndJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joiningRoom) return;

    if (inputAccessCode.trim() === (joiningRoom.access_code || '')) {
      router.push(`/room/${joiningRoom.name}`);
    } else {
      setErrorMsg('Nieprawidłowy kod dostępu.');
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090c15] text-slate-400 font-sans text-sm flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>Weryfikacja sesji...</span>
        </div>
      </div>
    );
  }

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
          <span className="text-3xl sm:text-4xl font-black tracking-tight text-white uppercase font-mono">
            CHATTER
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-400 hidden sm:inline-block">
            Zalogowany jako: <strong className="text-white font-semibold">{username || user.email}</strong>
          </span>
          <button
            onClick={handleSignOut}
            className="px-4 py-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700/80 text-slate-200 text-xs font-semibold uppercase tracking-wider transition active:scale-95"
          >
            Wyloguj
          </button>
        </div>
      </header>

      <main className="relative z-10 max-w-lg w-full mx-auto px-6 py-12 flex-1 flex flex-col justify-center items-center">
        <div className="p-1 rounded-xl bg-[#121724] border border-slate-800 flex gap-1 mb-8 w-full max-w-xs shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition uppercase tracking-wider ${
              activeTab === 'create'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Stwórz pokój
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition uppercase tracking-wider ${
              activeTab === 'list'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Pokoje ({rooms.length})
          </button>
        </div>

        {activeTab === 'create' ? (
          <div className="w-full p-8 rounded-2xl bg-[#121724]/90 border border-slate-800/80 shadow-2xl backdrop-blur-md text-center">
            <h1 className="text-2xl font-extrabold tracking-tight text-white mb-2">
              Utwórz pokój rozmów
            </h1>

            <p className="text-slate-400 text-xs sm:text-sm max-w-sm mx-auto mb-8 leading-relaxed">
              Wprowadź nazwę nowej sali oraz określ widoczność i kod dostępu.
            </p>

            {errorMsg && (
              <div className="w-full mb-5 p-3.5 rounded-xl border border-rose-500/30 bg-rose-950/40 text-rose-300 text-xs text-left leading-relaxed flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateRoom} className="w-full space-y-4">
              <div>
                <label className="block text-left text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Nazwa pokoju
                </label>
                <input
                  type="text"
                  required
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="np. sala-projektowa"
                  className="w-full px-4 py-3 rounded-xl bg-[#0b0e17] border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#0b0e17] border border-slate-800">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Pokój prywatny
                </span>
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>

              {isPrivate && (
                <div>
                  <label className="block text-left text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Kod dostępu (access_code)
                  </label>
                  <input
                    type="password"
                    required={isPrivate}
                    value={roomAccessCode}
                    onChange={(e) => setRoomAccessCode(e.target.value)}
                    placeholder="Wprowadź kod..."
                    className="w-full px-4 py-3 rounded-xl bg-[#0b0e17] border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm tracking-wide transition-all shadow-lg shadow-blue-600/30 hover:shadow-blue-600/40 active:scale-95 mt-2"
              >
                {submitting ? 'Tworzenie...' : 'Wejdź do pokoju'}
              </button>
            </form>
          </div>
        ) : (
          <div className="w-full p-8 rounded-2xl bg-[#121724]/90 border border-slate-800/80 shadow-2xl backdrop-blur-md">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-extrabold tracking-tight text-white mb-1">
                Dostępne pokoje
              </h2>
              <p className="text-slate-400 text-xs">
                Wybierz istniejącą salę, aby dołączyć do rozmowy.
              </p>
            </div>

            {rooms.length === 0 ? (
              <div className="p-8 rounded-xl border border-slate-800/80 bg-[#0b0e17] text-center text-xs text-slate-500">
                Brak aktywnych pokojów w bazie danych.
              </div>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {rooms.map((room) => {
                  const isOwner = room.owner_id === user?.id;
                  const isRoomProtected = room.is_private || Boolean(room.access_code);

                  return (
                    <div
                      key={room.id}
                      className="p-4 rounded-xl border border-slate-800/80 bg-[#0b0e17] flex items-center justify-between text-left hover:border-blue-500/40 transition group"
                    >
                      <div className="truncate mr-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-200 truncate group-hover:text-white transition">
                            {room.name}
                          </span>
                          {isRoomProtected && (
                            <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 font-mono block">
                          {new Date(room.created_at).toLocaleDateString('pl-PL')}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isOwner && (
                          <>
                            <button
                              onClick={() => {
                                setEditingRoom(room);
                                setEditName(room.name);
                                setEditIsPrivate(room.is_private);
                                setEditAccessCode(room.access_code || '');
                              }}
                              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                              title="Edytuj pokój"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>

                            <button
                              onClick={() => handleDeleteRoom(room.id)}
                              className="p-2 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/40 text-rose-300 transition"
                              title="Usuń pokój"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => handleJoinClick(room)}
                          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold uppercase tracking-wider transition active:scale-95"
                        >
                          Dołącz →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {joiningRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
          <div className="max-w-md w-full p-6 rounded-2xl bg-[#121724] border border-slate-800 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">Pokój prywatny</h3>
            <p className="text-slate-400 text-xs mb-6">
              Pokój <strong className="text-white">{joiningRoom.name}</strong> wymaga podania kodu dostępu.
            </p>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl border border-rose-500/30 bg-rose-950/40 text-rose-300 text-xs">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleVerifyCodeAndJoin} className="space-y-4">
              <input
                type="password"
                required
                value={inputAccessCode}
                onChange={(e) => setInputAccessCode(e.target.value)}
                placeholder="Wprowadź kod dostępu..."
                className="w-full px-4 py-3 rounded-xl bg-[#0b0e17] border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-blue-500 transition"
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setJoiningRoom(null)}
                  className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold uppercase tracking-wider transition"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold uppercase tracking-wider transition shadow-lg shadow-blue-600/30"
                >
                  Wejdź
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6">
          <div className="max-w-md w-full p-6 rounded-2xl bg-[#121724] border border-slate-800 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-2">Edytuj ustawienia pokoju</h3>
            <p className="text-slate-400 text-xs mb-6">
              Zmień nazwę sali lub zaktualizuj kod dostępu.
            </p>

            <form onSubmit={handleUpdateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Nazwa pokoju
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-[#0b0e17] border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#0b0e17] border border-slate-800">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Pokój prywatny
                </span>
                <input
                  type="checkbox"
                  checked={editIsPrivate}
                  onChange={(e) => setEditIsPrivate(e.target.checked)}
                  className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                />
              </div>

              {editIsPrivate && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Kod dostępu (access_code)
                  </label>
                  <input
                    type="password"
                    required={editIsPrivate}
                    value={editAccessCode}
                    onChange={(e) => setEditAccessCode(e.target.value)}
                    placeholder="Brak kodu"
                    className="w-full px-4 py-3 rounded-xl bg-[#0b0e17] border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingRoom(null)}
                  className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold uppercase tracking-wider transition"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold uppercase tracking-wider transition shadow-lg shadow-blue-600/30"
                >
                  Zapisz
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <footer className="relative z-10 py-6 text-center text-xs text-slate-500 border-t border-slate-800/60 flex flex-col sm:flex-row items-center justify-between px-6 max-w-6xl w-full mx-auto gap-2">
        <span>CHATTER © {new Date().getFullYear()}</span>
        <span>Bezpieczna komunikacja WebRTC</span>
      </footer>
    </div>
  );
}