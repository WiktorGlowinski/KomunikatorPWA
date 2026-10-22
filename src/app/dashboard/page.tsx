'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

interface Room {
  id: string;
  name: string;
  description: string;
  created_at: string;
  owner_id: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState<string>('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserDataAndRooms();
  }, []);

  const fetchUserDataAndRooms = async () => {
    setLoading(true);
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

    if (profile) setUsername(profile.username);

    const { data: roomsData } = await supabase
      .from('rooms')
      .select('*')
      .order('created_at', { ascending: false });

    if (roomsData) setRooms(roomsData);
    setLoading(false);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim() || !user) return;

    const { error } = await supabase.from('rooms').insert([
      {
        name: newRoomName.trim(),
        description: newRoomDesc.trim(),
        owner_id: user.id,
      },
    ]);

    if (error) {
      alert('Błąd podczas tworzenia pokoju: ' + error.message);
      return;
    }

    setNewRoomName('');
    setNewRoomDesc('');
    fetchUserDataAndRooms();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white">
        <p className="animate-pulse">Ładowanie panelu...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Pasek nawigacyjny */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push('/')}>
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-600/30">
            K
          </div>
          <span className="font-semibold text-lg tracking-tight">Komunikator PWA</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-400">
            Zalogowany jako: <strong className="text-white">{username}</strong>
          </span>
          <button
            onClick={handleSignOut}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 hover:text-white transition"
          >
            Wyloguj
          </button>
        </div>
      </header>

      {/* Główna zawartość */}
      <main className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-3 gap-8">
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 h-fit">
          <h2 className="text-lg font-bold mb-4">Utwórz nową salę</h2>
          <form onSubmit={handleCreateRoom} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                Nazwa sali
              </label>
              <input
                type="text"
                required
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="np. Sala Wykładowa"
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                Opis sali
              </label>
              <textarea
                value={newRoomDesc}
                onChange={(e) => setNewRoomDesc(e.target.value)}
                placeholder="Cel spotkania..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition shadow-lg shadow-blue-600/30"
            >
              Stwórz pokój
            </button>
          </form>
        </section>

        <section className="md:col-span-2 space-y-4">
          <h2 className="text-lg font-bold">Dostępne sale konferencyjne ({rooms.length})</h2>

          {rooms.length === 0 ? (
            <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-8 text-center text-zinc-400">
              Brak aktywnych sal. Utwórz pierwszą salę w formularzu po lewej!
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between hover:border-zinc-700 transition"
                >
                  <div>
                    <h3 className="font-semibold text-white text-base mb-1">{room.name}</h3>
                    {room.description && (
                      <p className="text-xs text-zinc-400 mb-4 line-clamp-2">{room.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => router.push(`/room/${room.name.toLowerCase().replace(/\s+/g, '-')}`)}
                    className="w-full mt-4 py-2 px-3 rounded-lg bg-zinc-800 hover:bg-blue-600 text-xs font-medium text-white transition flex items-center justify-center gap-2"
                  >
                    Dołącz do wideokonferencji →
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}