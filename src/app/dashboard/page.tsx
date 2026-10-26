'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

interface Room {
  id: string;
  name: string;
  created_at: string;
  owner_id: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'create' | 'list'>('create');
  const [user, setUser] = useState<any>(null);
  const [roomName, setRoomName] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }
      setUser(user);
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030712] text-slate-500 font-mono text-xs flex items-center justify-center">
        Weryfikacja sesji...
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-[#030712] text-slate-100 flex flex-col justify-between overflow-hidden select-none selection:bg-slate-800">
      
   
      <div 
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(circle at 50% 45%, #0B1930 0%, #030712 70%)'
        }}
      />


  
      <main className="relative z-10 max-w-md w-full mx-auto px-6 py-12 flex-1 flex flex-col justify-center items-center text-center">
        

        <div className="flex items-center gap-1 p-1 mb-8 rounded bg-[#070D18] border border-slate-800 font-mono text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`px-4 py-1.5 rounded transition ${
              activeTab === 'create'
                ? 'bg-slate-800 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Nowy pokój
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`px-4 py-1.5 rounded transition ${
              activeTab === 'list'
                ? 'bg-slate-800 text-white font-medium'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Dostępne ({rooms.length})
          </button>
        </div>

        {activeTab === 'create' ? (
          <>
            <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-white mb-4 leading-tight">
              Utwórz pokój <br />
              do rozmowy
            </h1>

            <p className="text-slate-400 text-xs sm:text-sm max-w-sm mb-8 leading-relaxed font-sans">
              Wprowadź nazwę pokoju. Po zatwierdzeniu nastąpi natychmiastowe nawiązanie bezpośredniego połączenia WebRTC.
            </p>

            {errorMsg && (
              <div className="w-full mb-4 p-3 rounded border border-rose-900/60 bg-rose-950/30 text-rose-300 font-mono text-xs">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreateRoom} className="w-full space-y-4">
              <input
                type="text"
                required
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="np. sala-projektowa"
                className="w-full px-4 py-3 rounded bg-[#070D18] border border-slate-800 text-center text-sm text-slate-100 placeholder-slate-600 font-mono focus:outline-none focus:border-slate-500 transition"
              />

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded bg-white hover:bg-slate-200 disabled:opacity-50 text-[#030712] font-mono text-xs uppercase tracking-wider font-semibold transition shadow-md"
              >
                {submitting ? 'Tworzenie...' : 'Wejdź do pokoju'}
              </button>
            </form>
          </>
        ) : (
          <div className="w-full">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-2">
              Dostępne pokoje
            </h2>
            <p className="text-slate-400 text-xs font-sans mb-6">
              Wybierz salę, aby dołączyć do sesji.
            </p>

            {rooms.length === 0 ? (
              <div className="p-6 rounded border border-slate-800 bg-[#070D18] text-xs font-mono text-slate-500">
                Brak utworzonych pokojów w bazie.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {rooms.map((room) => (
                  <div
                    key={room.id}
                    className="p-3 rounded border border-slate-800 bg-[#070D18] flex items-center justify-between text-left hover:border-slate-700 transition"
                  >
                    <span className="font-mono text-xs text-slate-200 truncate max-w-[200px]">
                      {room.name}
                    </span>
                    <button
                      onClick={() => router.push(`/room/${room.name}`)}
                      className="px-3 py-1 rounded bg-slate-800 hover:bg-white hover:text-black text-[11px] font-mono text-slate-300 transition"
                    >
                      Dołącz →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

       <button
          onClick={() => router.push('/')}
          className="px-3.5 py-1.5 rounded border border-slate-800 bg-[#0B1528] hover:border-slate-700 text-xs font-mono text-slate-300 transition"
        >
          Wyloguj się 
        </button>
      </main>

   
      <footer className="relative z-10 py-6 text-center text-[11px] font-mono text-slate-600 border-t border-slate-900/40">
        Prywatna przestrzeń wymiany myśli
      </footer>

    </div>
  );
}