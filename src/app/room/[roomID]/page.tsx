'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { 
  LiveKitRoom, 
  useTracks, 
  useLocalParticipant, 
  useRoomContext,
  VideoTrack,
  useParticipants
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { supabase } from '@/lib/supabaseClient';

interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  profiles?: {
    username: string;
  };
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();

  const [roomId, setRoomId] = useState<string>('');
  const [token, setToken] = useState('');
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let paramVal = params?.roomId || params?.id || params?.slug;

    if (!paramVal && typeof window !== 'undefined') {
      const parts = window.location.pathname.split('/');
      paramVal = parts[parts.length - 1];
    }

    const rawString = typeof paramVal === 'string' ? paramVal : Array.isArray(paramVal) ? paramVal[0] : '';
    if (rawString && rawString !== 'undefined') {
      setRoomId(decodeURIComponent(rawString));
    }
  }, [params]);

  useEffect(() => {
    if (!roomId) return;

    const init = async () => {
      // Weryfikacja sesji – niezalogowany użytkownik od razu trafia na logowanie
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
        .maybeSingle();

      const currentUsername = profile?.username || user.email?.split('@')[0] || 'Użytkownik';
      setUsername(currentUsername);

      try {
        const res = await fetch(`/api/livekit-token?room=${encodeURIComponent(roomId)}&username=${encodeURIComponent(currentUsername)}`);
        const data = await res.json();
        if (data.token) {
          setToken(data.token);
        }
      } catch (err) {
        console.error('Błąd pobierania tokenu:', err);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [roomId, router]);

  if (loading || !token || !roomId) {
    return (
      <div className="min-h-screen bg-[#090c15] text-slate-400 font-sans text-sm flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>Łączenie z serwerem mediów...</span>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      video={false}
      audio={false}
      token={token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
      data-lk-theme="default"
      onError={(err) => {
        console.warn('LiveKit error / brak uprawnień:', err);
      }}
      className="min-h-screen bg-[#090c15] flex flex-col justify-between overflow-hidden font-sans"
    >
      <CustomRoomUI roomId={roomId} currentUser={user} username={username} />
    </LiveKitRoom>
  );
}

function CustomRoomUI({ roomId, currentUser, username }: { roomId: string; currentUser: any; username: string }) {
  const router = useRouter();
  const room = useRoomContext();
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  const [isMicOn, setIsMicOn] = useState(false);
  const [isCamOn, setIsCamOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showChat, setShowChat] = useState(true);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [dbRoomId, setDbRoomId] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  useEffect(() => {
    const loadMessages = async () => {
      if (!roomId || roomId === 'undefined') return;

      const decodedName = decodeURIComponent(roomId);
      let foundRoomId: string | null = null;

      const { data: roomData } = await supabase
        .from('rooms')
        .select('id')
        .eq('name', decodedName)
        .maybeSingle();

      let resolvedRoom = roomData;

      if (!resolvedRoom) {
        const { data: rawRoomData } = await supabase
          .from('rooms')
          .select('id')
          .eq('name', roomId)
          .maybeSingle();
        resolvedRoom = rawRoomData;
      }

      if (!resolvedRoom) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roomId);
        if (isUuid) {
          const { data: roomById } = await supabase
            .from('rooms')
            .select('id')
            .eq('id', roomId)
            .maybeSingle();
          resolvedRoom = roomById;
        }
      }

      if (!resolvedRoom?.id) {
        const { data: newRoom } = await supabase
          .from('rooms')
          .insert([
            {
              name: decodedName,
              owner_id: currentUser?.id,
              is_private: false,
            }
          ])
          .select('id')
          .single();

        if (newRoom?.id) {
          foundRoomId = newRoom.id;
        }
      } else {
        foundRoomId = resolvedRoom.id;
      }

      if (!foundRoomId) return;

      setDbRoomId(foundRoomId);

      const fetchMsgs = async () => {
        const { data, error } = await supabase
          .from('messages')
          .select('*, profiles:sender_id(username)')
          .eq('room_id', foundRoomId)
          .order('created_at', { ascending: true });

        if (!error && data) {
          setMessages(data as any);
        }
      };

      fetchMsgs();

      const interval = setInterval(fetchMsgs, 3000);
      return () => clearInterval(interval);
    };

    if (currentUser?.id) {
      loadMessages();
    }
  }, [roomId, currentUser]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    const content = newMessage.trim();
    if (!content) return;

    if (!currentUser?.id) {
      alert('Błąd: Brak zidentyfikowanej sesji użytkownika.');
      return;
    }

    if (!dbRoomId) {
      alert(`Błąd: Pokój "${roomId}" nie został powiązany z bazą danych.`);
      return;
    }

    setNewMessage('');

    const { data, error } = await supabase
      .from('messages')
      .insert([
        {
          room_id: dbRoomId,
          sender_id: currentUser.id,
          content: content,
        },
      ])
      .select('*, profiles:sender_id(username)')
      .single();

    if (error) {
      console.error('Błąd zapisu wiadomości w Supabase:', error);
      alert(`Błąd wysyłania wiadomości: ${error.message}`);
      return;
    }

    if (data) {
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.id)) return prev;
        return [...prev, data as any];
      });
    }
  };

  const toggleMic = async () => {
    const nextState = !isMicOn;
    await localParticipant.setMicrophoneEnabled(nextState);
    setIsMicOn(nextState);
  };

  const toggleCam = async () => {
    const nextState = !isCamOn;
    await localParticipant.setCameraEnabled(nextState);
    setIsCamOn(nextState);
  };

  const toggleScreenShare = async () => {
    const nextState = !isScreenSharing;
    await localParticipant.setScreenShareEnabled(nextState);
    setIsScreenSharing(nextState);
  };

  const handleLeaveRoom = async () => {
    await room.disconnect();
    router.push('/dashboard');
  };

  // Dynamiczny układ siatki: 1 osoba = pełny ekran, 2 osoby = pół na pół, 3+ = siatka
  const getGridLayoutClass = (count: number) => {
    if (count === 1) return 'grid-cols-1 grid-rows-1 max-w-5xl max-h-[85vh]';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2 grid-rows-1 max-w-7xl max-h-[85vh]';
    if (count <= 4) return 'grid-cols-1 md:grid-cols-2 grid-rows-2 max-w-6xl max-h-[85vh]';
    return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 auto-rows-fr max-w-7xl';
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#090c15] text-slate-100 overflow-hidden font-sans">
      <header className="h-16 px-6 border-b border-slate-800/80 bg-[#0d111c]/90 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-4">
          <Image
            src="/logo.png"
            alt="CHATTER"
            width={40}
            height={40}
            priority
            className="h-9 w-auto object-contain drop-shadow-[0_0_10px_rgba(59,130,246,0.3)]"
          />
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono uppercase text-slate-400">POKÓJ:</span>
            <span className="text-base font-bold text-white tracking-wide">{roomId}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              const inviteLink = window.location.href;
              navigator.clipboard.writeText(inviteLink);
              alert('Link zaproszenia do tego pokoju został skopiowany do schowka!');
            }}
            className="px-3.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-semibold uppercase tracking-wider transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Zaproś
          </button>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/60 border border-blue-500/30 text-blue-400 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span>UCZESTNICY: {participants.length}</span>
          </div>

          <button
            onClick={handleLeaveRoom}
            className="px-4 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-800/50 text-rose-200 text-xs font-semibold uppercase tracking-wider transition active:scale-95 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Opuść pokój
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto flex items-center justify-center">
          <div className={`grid gap-4 w-full h-full items-center justify-items-center transition-all duration-300 ${getGridLayoutClass(tracks.length)}`}>
            {tracks.map((trackReference, index) => {
              const isSpeaking = trackReference.participant.isSpeaking;
              return (
                <div
                  key={index}
                  className={`relative w-full h-full max-h-[80vh] aspect-video rounded-2xl bg-[#121724] border ${
                    isSpeaking ? 'border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.4)]' : 'border-slate-800/80'
                  } overflow-hidden flex items-center justify-center transition-all duration-300 shadow-xl`}
                >
                  {trackReference.publication?.track ? (
                    <VideoTrack trackRef={trackReference} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                      <div className="w-20 h-20 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl font-bold font-mono text-slate-300 uppercase shadow-inner">
                        {(trackReference.participant.identity || 'U')[0]}
                      </div>
                    </div>
                  )}

                  <div className="absolute bottom-3 left-3 px-3.5 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-slate-700/50 text-xs font-semibold text-white flex items-center gap-2 shadow-lg">
                    <span>{trackReference.participant.identity || 'Użytkownik'}</span>
                    {!trackReference.participant.isMicrophoneEnabled && (
                      <svg className="w-3.5 h-3.5 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3l18 18" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        {showChat && (
          <aside className="w-80 border-l border-slate-800/80 bg-[#0d111c] flex flex-col h-full shrink-0">
            <div className="p-4 border-b border-slate-800/80 font-bold text-sm text-slate-200 flex items-center justify-between">
              <span>Czat pokoju</span>
              <span className="text-[10px] font-mono uppercase bg-blue-950 text-blue-400 border border-blue-800/40 px-2 py-0.5 rounded">
                Realtime
              </span>
            </div>

            <div ref={chatScrollRef} className="flex-1 p-4 overflow-y-auto space-y-3">
              {messages.length === 0 ? (
                <div className="text-center text-xs text-slate-600 mt-10">
                  Brak wiadomości. Napisz coś pierwszy!
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className="text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-400 font-mono text-[10px]">
                      <span className="font-bold text-blue-400">
                        {msg.profiles?.username || 'Użytkownik'}
                      </span>
                      <span>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[#141926] border border-slate-800 text-slate-200 break-words leading-relaxed">
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800/80 bg-[#090c15] flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Napisz wiadomość..."
                className="flex-1 px-3 py-2 rounded-xl bg-[#121724] border border-slate-800 text-slate-100 text-xs focus:outline-none focus:border-blue-500 transition"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-md shadow-blue-600/30"
              >
                ➔
              </button>
            </form>
          </aside>
        )}
      </div>

      <footer className="h-20 border-t border-slate-800/80 bg-[#0d111c]/90 px-6 flex items-center justify-center gap-4 z-20 shrink-0">
        <button
          onClick={toggleMic}
          className={`p-3.5 rounded-2xl border transition ${
            isMicOn
              ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              : 'bg-rose-950/80 border-rose-800 text-rose-300'
          }`}
          title={isMicOn ? 'Wycisz mikrofon' : 'Włącz mikrofon'}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>

        <button
          onClick={toggleCam}
          className={`p-3.5 rounded-2xl border transition ${
            isCamOn
              ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              : 'bg-rose-950/80 border-rose-800 text-rose-300'
          }`}
          title={isCamOn ? 'Wyłącz kamerę' : 'Włącz kamerę'}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>

        <button
          onClick={toggleScreenShare}
          className={`p-3.5 rounded-2xl border transition ${
            isScreenSharing
              ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30'
              : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
          }`}
          title="Udostępnij ekran"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </button>

        <button
          onClick={() => setShowChat(!showChat)}
          className={`p-3.5 rounded-2xl border transition ${
            showChat
              ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30'
              : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
          }`}
          title="Przełącz czat"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </button>
      </footer>
    </div>
  );
}