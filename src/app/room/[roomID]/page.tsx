'use client';

import { useState, useEffect, useRef } from 'react';
import type { ComponentProps } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icon';
import { Ticks } from '@/components/Ticks';
import { FullScreenLoader } from '@/components/Spinner';

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

interface WebRTCStats {
  rtt: number | null;
  jitter: number | null;
  packetLossPercent: number | null;
  bitrateInbound: number;
  bitrateOutbound: number;
  resolution: string | null;
  fps: number | null;
  audioCodec: string | null;
  videoCodec: string | null;
  transportState: string | null;
}

function peopleLabel(n: number) {
  if (n === 1) return '1 osoba';
  const last = n % 10;
  const lastTwo = n % 100;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return `${n} osoby`;
  return `${n} osób`;
}

const asRef = (t: unknown) => t as ComponentProps<typeof VideoTrack>['trackRef'];

function ParticipantAvatar({
  name,
  url,
  speaking,
  className,
  textClass,
}: {
  name: string;
  url?: string;
  speaking: boolean;
  className: string;
  textClass: string;
}) {
  const [failed, setFailed] = useState(false);

  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        onError={() => setFailed(true)}
        className={`${className} rounded-full border border-line object-cover`}
      />
    );
  }

  return (
    <div
      className={`${className} ${textClass} font-display flex items-center justify-center rounded-full uppercase transition-colors ${
        speaking ? 'bg-lime text-ink' : 'bg-line text-paper'
      }`}
    >
      {name[0]}
    </div>
  );
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();

  const [roomId, setRoomId] = useState<string>('');
  const [token, setToken] = useState('');
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/livekit-token?room=${encodeURIComponent(roomId)}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        });

        if (res.status === 401) {
          router.push('/login');
          return;
        }

        const data = await res.json();
        if (data.token) {
          setToken(data.token);
        } else {
          setError(data.error || 'Nie udało się dołączyć do pokoju.');
        }
      } catch (err) {
        console.error('Błąd pobierania tokenu:', err);
        setError('Nie udało się połączyć z serwerem.');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [roomId, router]);

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-5 text-center">
        <p className="max-w-sm text-mute">{error}</p>
        <button onClick={() => router.push('/dashboard')} className="btn btn-primary">
          Wróć do panelu
        </button>
      </div>
    );
  }

  if (loading || !token || !roomId) {
    return <FullScreenLoader text="Łączenie z pokojem..." />;
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
      className="h-dvh overflow-hidden bg-ink"
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
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [activeSideTab, setActiveSideTab] = useState<'chat' | 'members' | 'stats'>('chat');
  const [copied, setCopied] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [dbRoomId, setDbRoomId] = useState<string | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [webrtcStats, setWebrtcStats] = useState<WebRTCStats>({
    rtt: null,
    jitter: null,
    packetLossPercent: null,
    bitrateInbound: 0,
    bitrateOutbound: 0,
    resolution: null,
    fps: null,
    audioCodec: null,
    videoCodec: null,
    transportState: null,
  });

  const prevStatsRef = useRef<{ bytesSent: number; bytesRecv: number; time: number }>({
    bytesSent: 0,
    bytesRecv: 0,
    time: 0,
  });

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const cards = tracks
    .filter((t) => t.source === Track.Source.Camera)
    .map((cam) => ({
      cam,
      screen: tracks.find(
        (t) =>
          t.source === Track.Source.ScreenShare &&
          t.participant.identity === cam.participant.identity
      ),
    }));

  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const idsKey = JSON.stringify(
    Array.from(
      new Set(
        [currentUser?.id, ...participants.map((p) => p.identity)].filter(Boolean) as string[]
      )
    ).sort()
  );

  useEffect(() => {
    const ids: string[] = JSON.parse(idsKey);
    if (ids.length === 0) return;

    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, avatar_url')
      .in('id', ids)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('Błąd zapytania awatarów:', error.message);
          return;
        }
        const map: Record<string, string> = {};
        (data ?? []).forEach((row) => {
          if (row.avatar_url) map[row.id] = row.avatar_url;
        });
        setAvatars(map);
      });

    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      setShowSidePanel(true);
    }
  }, []);

  useEffect(() => {
    if (!room) return;

    const interval = setInterval(async () => {
      try {
        const engine = (room as any).engine;
        if (!engine) return;

        const lp = room.localParticipant;
        let hasActiveAudio = lp ? lp.isMicrophoneEnabled : false;
        let hasActiveVideo = lp ? (lp.isCameraEnabled || lp.isScreenShareEnabled) : false;

        const signalRtt = typeof engine.rtt === 'number' && engine.rtt > 0 
          ? Math.round(engine.rtt) 
          : typeof engine.client?.rtt === 'number' && engine.client.rtt > 0 
          ? Math.round(engine.client.rtt) 
          : null;

        const pcsSet = new Set<RTCPeerConnection>();
        if (engine.publisher?.pc) pcsSet.add(engine.publisher.pc);
        if (engine.publisher?.peerConnection) pcsSet.add(engine.publisher.peerConnection);
        if (engine.subscriber?.pc) pcsSet.add(engine.subscriber.pc);
        if (engine.subscriber?.peerConnection) pcsSet.add(engine.subscriber.peerConnection);
        const pcs = Array.from(pcsSet);

        let currentRtt: number | null = signalRtt;
        let currentJitter: number | null = null;
        let packetsLostTotal = 0;
        let packetsRecvTotal = 0;
        let totalBytesSent = 0;
        let totalBytesRecv = 0;
        let resStr: string | null = null;
        let currentFps: number | null = null;
        let aCodec: string | null = null;
        let vCodec: string | null = null;

        if (lp) {
          lp.videoTrackPublications.forEach((pub) => {
            if (pub.track && pub.track.mediaStreamTrack) {
              hasActiveVideo = true;
              const settings = pub.track.mediaStreamTrack.getSettings();
              if (settings.width && settings.height) {
                resStr = `${settings.width}x${settings.height}`;
              }
              if (settings.frameRate) {
                currentFps = Math.round(settings.frameRate);
              }
            }
          });
        }

        for (const pc of pcs) {
          if (!pc || typeof pc.getStats !== 'function') continue;

          let stats: RTCStatsReport;
          try {
            stats = await pc.getStats();
          } catch {
            continue;
          }

          stats.forEach((report) => {
            if (report.type === 'candidate-pair') {
              if (typeof report.currentRoundTripTime === 'number' && report.currentRoundTripTime > 0) {
                currentRtt = Math.round(report.currentRoundTripTime * 1000);
              }
            }

            if (report.type === 'remote-inbound-rtp') {
              if (typeof report.roundTripTime === 'number' && report.roundTripTime > 0) {
                currentRtt = Math.round(report.roundTripTime * 1000);
              }
              if (typeof report.jitter === 'number') {
                currentJitter = Math.round(report.jitter * 1000);
              }
              if (typeof report.packetsLost === 'number') {
                packetsLostTotal += report.packetsLost;
              }
            }

            if (report.type === 'outbound-rtp') {
              if (typeof report.bytesSent === 'number') {
                totalBytesSent += report.bytesSent;
              }
              const w = report.frameWidth || report.width;
              const h = report.frameHeight || report.height;
              if (w && h) {
                resStr = `${w}x${h}`;
                hasActiveVideo = true;
              }
              if (typeof report.framesPerSecond === 'number' && report.framesPerSecond > 0) {
                currentFps = Math.round(report.framesPerSecond);
              }
            }

            if (report.type === 'inbound-rtp') {
              if (typeof report.bytesReceived === 'number') {
                totalBytesRecv += report.bytesReceived;
              }
              if (typeof report.packetsLost === 'number') {
                packetsLostTotal += report.packetsLost;
              }
              if (typeof report.packetsReceived === 'number') {
                packetsRecvTotal += report.packetsReceived;
              }
              if (typeof report.jitter === 'number') {
                currentJitter = Math.round(report.jitter * 1000);
              }
              const w = report.frameWidth || report.width;
              const h = report.frameHeight || report.height;
              if (w && h) {
                resStr = `${w}x${h}`;
                hasActiveVideo = true;
              }
              if (typeof report.framesPerSecond === 'number' && report.framesPerSecond > 0) {
                currentFps = Math.round(report.framesPerSecond);
              }
            }

            if (report.type === 'media-source' && report.kind === 'video') {
              if (report.width && report.height) {
                resStr = `${report.width}x${report.height}`;
                hasActiveVideo = true;
              }
              if (typeof report.framesPerSecond === 'number' && report.framesPerSecond > 0) {
                currentFps = Math.round(report.framesPerSecond);
              }
            }

            if (report.type === 'codec' && report.mimeType) {
              const mime = report.mimeType.toLowerCase();
              if (mime.startsWith('audio/')) {
                aCodec = report.mimeType;
              }
              if (mime.startsWith('video/')) {
                vCodec = report.mimeType;
              }
            }
          });
        }

        const now = Date.now();
        let bitOut = 0;
        let bitIn = 0;

        if (prevStatsRef.current.time > 0) {
          const deltaSec = (now - prevStatsRef.current.time) / 1000;
          if (deltaSec > 0) {
            const sentDiff = totalBytesSent - prevStatsRef.current.bytesSent;
            const recvDiff = totalBytesRecv - prevStatsRef.current.bytesRecv;
            if (sentDiff >= 0) {
              bitOut = Math.round((sentDiff * 8) / deltaSec / 1000);
            }
            if (recvDiff >= 0) {
              bitIn = Math.round((recvDiff * 8) / deltaSec / 1000);
            }
          }
        }

        prevStatsRef.current = {
          bytesSent: totalBytesSent,
          bytesRecv: totalBytesRecv,
          time: now,
        };

        const totalPackets = packetsRecvTotal + packetsLostTotal;
        const lossRate = totalPackets > 0 ? Number(((packetsLostTotal / totalPackets) * 100).toFixed(2)) : 0;

        if (hasActiveAudio && !aCodec) {
          aCodec = 'audio/opus';
        }
        if (hasActiveVideo && !vCodec) {
          vCodec = 'video/VP8';
        }

        setWebrtcStats({
          rtt: currentRtt,
          jitter: currentJitter,
          packetLossPercent: lossRate,
          bitrateInbound: bitIn < 0 ? 0 : bitIn,
          bitrateOutbound: bitOut < 0 ? 0 : bitOut,
          resolution: resStr,
          fps: currentFps,
          audioCodec: hasActiveAudio ? (aCodec || 'audio/opus') : null,
          videoCodec: hasActiveVideo ? (vCodec || 'video/VP8') : null,
          transportState: room.state,
        });
      } catch (err) {
        console.error('Błąd odczytu parametrów WebRTC:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [room]);

  useEffect(() => {
    if (!currentUser?.id) return;

    let interval: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

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

      if (!foundRoomId || cancelled) return;

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
      interval = setInterval(fetchMsgs, 3000);
    };

    loadMessages();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [roomId, currentUser]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, showSidePanel, activeSideTab]);

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

  const handleCopyInvite = async () => {
    const inviteLink = window.location.href;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Skopiuj link zaproszenia:', inviteLink);
    }
  };

  const getGridLayoutClass = (count: number) => {
    if (count === 1) return 'grid-cols-1 grid-rows-1 max-w-5xl max-h-[85vh]';
    if (count === 2) return 'grid-cols-1 md:grid-cols-2 grid-rows-1 max-w-7xl max-h-[85vh]';
    if (count <= 4) return 'grid-cols-1 md:grid-cols-2 grid-rows-2 max-w-6xl max-h-[85vh]';
    return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 auto-rows-fr max-w-7xl';
  };

  const ctrl = 'flex size-12 items-center justify-center rounded-full border transition-colors';
  const ctrlOff = 'border-line bg-raised text-paper hover:border-mute';
  const ctrlOn = 'border-lime bg-lime text-ink';
  const ctrlMuted = 'border-danger/50 bg-danger/10 text-danger';

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-ink text-paper">
      <header className="z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-panel px-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Brand compact href="/dashboard" />
          <h1 className="font-display truncate text-2xl leading-none tracking-wide">
            {roomId}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button
            onClick={() => {
              setShowSidePanel(true);
              setActiveSideTab('members');
            }}
            className="btn btn-ghost min-h-10 gap-2 px-3"
            aria-label="Lista osób w pokoju"
          >
            <svg className="size-4 text-mute" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span>{peopleLabel(participants.length)}</span>
          </button>

          <button
            onClick={() => {
              setShowSidePanel(true);
              setActiveSideTab('stats');
            }}
            className="btn btn-ghost min-h-10 gap-2 px-3 font-mono text-xs"
            aria-label="Statystyki WebRTC"
          >
            <svg className="size-4 text-lime" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="hidden sm:inline">Statystyki</span>
          </button>

          <button
            onClick={handleCopyInvite}
            className="btn btn-ghost min-h-10 px-3"
            aria-label="Skopiuj link zaproszenia"
          >
            <Icon name={copied ? 'check' : 'share'} className="size-4" />
            <span className="hidden sm:inline">{copied ? 'Skopiowano' : 'Zaproś'}</span>
          </button>

          <button
            onClick={handleLeaveRoom}
            className="btn btn-danger min-h-10 px-3"
            aria-label="Opuść pokój"
          >
            <Icon name="leave" className="size-4" />
            <span className="hidden sm:inline">Opuść pokój</span>
          </button>
        </div>
      </header>

      <div className="relative flex flex-1 overflow-hidden">
        <main className="flex flex-1 items-center justify-center overflow-y-auto p-3 sm:p-6">
          <div className={`grid h-full w-full items-center justify-items-center gap-3 sm:gap-4 ${getGridLayoutClass(cards.length)}`}>
            {cards.map(({ cam, screen }) => {
              const participant = cam.participant;
              const name = participant.name || participant.identity || 'Użytkownik';
              const isSpeaking = participant.isSpeaking;
              const camOn = !!cam.publication?.track && !cam.publication.isMuted;
              const avatarUrl = avatars[participant.identity];

              return (
                <div
                  key={participant.identity}
                  className={`relative flex aspect-video h-full max-h-[80vh] w-full items-center justify-center overflow-hidden rounded-lg border bg-panel transition-colors ${
                    isSpeaking ? 'border-lime ring-2 ring-lime' : 'border-line'
                  }`}
                >
                  {screen ? (
                    <VideoTrack
                      trackRef={asRef(screen)}
                      className="h-full w-full bg-black object-contain"
                    />
                  ) : camOn ? (
                    <VideoTrack
                      trackRef={asRef(cam)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ParticipantAvatar
                      name={name}
                      url={avatarUrl}
                      speaking={isSpeaking}
                      className="size-24 sm:size-32"
                      textClass="text-5xl sm:text-6xl"
                    />
                  )}

                  {screen && (
                    <div className="absolute bottom-2.5 right-2.5 flex aspect-video w-[26%] min-w-24 max-w-52 items-center justify-center overflow-hidden rounded-md border border-line bg-raised shadow-lg">
                      {camOn ? (
                        <VideoTrack
                          trackRef={asRef(cam)}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ParticipantAvatar
                          name={name}
                          url={avatarUrl}
                          speaking={isSpeaking}
                          className="aspect-square h-3/5"
                          textClass="text-2xl"
                        />
                      )}
                    </div>
                  )}

                  <div className="absolute bottom-2.5 left-2.5 flex items-center gap-2 rounded-md bg-ink/80 px-2.5 py-1 text-xs font-semibold sm:text-sm">
                    {isSpeaking && <Ticks active className="size-4 text-lime" />}
                    <span>{name}</span>
                    {screen && <Icon name="screen" className="size-3.5 text-lime" />}
                    {!participant.isMicrophoneEnabled && (
                      <Icon name="micOff" className="size-3.5 text-danger" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        {showSidePanel && (
          <aside className="absolute inset-0 z-30 flex flex-col border-l border-line bg-panel md:static md:z-auto md:w-80 md:shrink-0">
            <div className="flex items-center justify-between border-b border-line p-2.5">
              <div className="flex gap-1 rounded-md bg-raised p-1 text-xs font-semibold">
                <button
                  onClick={() => setActiveSideTab('chat')}
                  className={`px-3 py-1.5 rounded transition ${
                    activeSideTab === 'chat' ? 'bg-panel text-paper shadow-sm' : 'text-mute hover:text-paper'
                  }`}
                >
                  Czat
                </button>
                <button
                  onClick={() => setActiveSideTab('members')}
                  className={`px-3 py-1.5 rounded transition ${
                    activeSideTab === 'members' ? 'bg-panel text-paper shadow-sm' : 'text-mute hover:text-paper'
                  }`}
                >
                  Osoby ({participants.length})
                </button>
                <button
                  onClick={() => setActiveSideTab('stats')}
                  className={`px-3 py-1.5 rounded transition ${
                    activeSideTab === 'stats' ? 'bg-panel text-paper shadow-sm' : 'text-mute hover:text-paper'
                  }`}
                >
                  Stats
                </button>
              </div>

              <button
                onClick={() => setShowSidePanel(false)}
                className="btn btn-ghost size-9 min-h-0 px-0 md:hidden"
                aria-label="Zamknij panel"
              >
                <Icon name="close" className="size-5" />
              </button>
            </div>

            {activeSideTab === 'chat' && (
              <>
                <div ref={chatScrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
                  {messages.length === 0 ? (
                    <p className="mt-10 text-center text-sm text-mute">
                      Nikt jeszcze nic nie napisał. Zacznij pierwszy.
                    </p>
                  ) : (
                    messages.map((msg) => {
                      const mine = msg.sender_id === currentUser?.id;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                        >
                          <div className="mb-1 flex items-baseline gap-2 text-xs text-mute">
                            {!mine && (
                              <span className="font-semibold text-paper">
                                {msg.profiles?.username || 'Użytkownik'}
                              </span>
                            )}
                            <time dateTime={msg.created_at}>
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </time>
                          </div>
                          <p
                            className={`max-w-[85%] break-words rounded-lg px-3 py-2 text-sm leading-relaxed ${
                              mine ? 'bg-lime text-ink' : 'bg-raised text-paper'
                            }`}
                          >
                            {msg.content}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>

                <form onSubmit={handleSendMessage} className="flex gap-2 border-t border-line p-3">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Napisz wiadomość..."
                    aria-label="Treść wiadomości"
                    className="field"
                  />
                  <button
                    type="submit"
                    className="btn btn-primary size-11 shrink-0 px-0"
                    aria-label="Wyślij wiadomość"
                  >
                    <Icon name="send" className="size-5" />
                  </button>
                </form>
              </>
            )}

            {activeSideTab === 'members' && (
              <div className="flex-1 overflow-y-auto p-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-mute">
                  Uczestnicy połączenia ({participants.length})
                </h3>

                <ul className="space-y-2 divide-y divide-line/40">
                  {participants.map((p) => {
                    const pName = p.name || p.identity || 'Użytkownik';
                    const pAvatar = avatars[p.identity];
                    const isMe = p.identity === currentUser?.id || p.isLocal;

                    return (
                      <li key={p.identity} className="flex items-center justify-between gap-2 pt-2.5 first:pt-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <ParticipantAvatar
                            name={pName}
                            url={pAvatar}
                            speaking={p.isSpeaking}
                            className="size-8 shrink-0"
                            textClass="text-xs"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-paper">
                              {pName} {isMe && <span className="text-xs text-mute font-normal">(Ty)</span>}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {p.isSpeaking && <Ticks active className="size-4 text-lime" />}
                          <Icon
                            name={p.isMicrophoneEnabled ? 'mic' : 'micOff'}
                            className={`size-4 ${p.isMicrophoneEnabled ? 'text-mute' : 'text-danger'}`}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {activeSideTab === 'stats' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
                <div className="border-b border-line pb-2">
                  <h3 className="text-sm font-semibold text-paper uppercase tracking-wider">
                    Parametry połączenia
                  </h3>
                  <p className="text-[11px] text-mute font-sans">
                    Odczyt w czasie rzeczywistym z API WebRTC / LiveKit.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Stan sesji</span>
                    <span className="text-lime uppercase font-bold">
                      {webrtcStats.transportState || 'połączono'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Opóźnienie (RTT)</span>
                    <span className="text-paper font-semibold">
                      {webrtcStats.rtt !== null ? `${webrtcStats.rtt} ms` : 'b.d.'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Jitter</span>
                    <span className="text-paper font-semibold">
                      {webrtcStats.jitter !== null ? `${webrtcStats.jitter} ms` : '0 ms'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Utrata pakietów</span>
                    <span className={`font-semibold ${webrtcStats.packetLossPercent && webrtcStats.packetLossPercent > 2 ? 'text-danger' : 'text-paper'}`}>
                      {webrtcStats.packetLossPercent !== null ? `${webrtcStats.packetLossPercent}%` : '0%'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Bitrate Inbound</span>
                    <span className="text-paper font-semibold">
                      {webrtcStats.bitrateInbound} kbps
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Bitrate Outbound</span>
                    <span className="text-paper font-semibold">
                      {webrtcStats.bitrateOutbound} kbps
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Rozdzielczość wideo</span>
                    <span className="text-paper font-semibold">
                      {webrtcStats.resolution || 'Wideo wyłączone'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Liczba klatek (FPS)</span>
                    <span className="text-paper font-semibold">
                      {webrtcStats.fps !== null ? `${webrtcStats.fps} FPS` : 'Wideo wyłączone'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Kodek audio</span>
                    <span className="text-paper font-semibold">
                      {webrtcStats.audioCodec || 'Wyciszony'}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1.5 border-b border-line/40">
                    <span className="text-mute">Kodek wideo</span>
                    <span className="text-paper font-semibold">
                      {webrtcStats.videoCodec || 'Wyłączony'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      <footer className="z-20 flex shrink-0 items-center justify-center gap-3 border-t border-line bg-panel px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <button
          onClick={toggleMic}
          aria-pressed={isMicOn}
          aria-label={isMicOn ? 'Wycisz mikrofon' : 'Włącz mikrofon'}
          title={isMicOn ? 'Wycisz mikrofon' : 'Włącz mikrofon'}
          className={`${ctrl} ${isMicOn ? ctrlOff : ctrlMuted}`}
        >
          <Icon name={isMicOn ? 'mic' : 'micOff'} />
        </button>

        <button
          onClick={toggleCam}
          aria-pressed={isCamOn}
          aria-label={isCamOn ? 'Wyłącz kamerę' : 'Włącz kamerę'}
          title={isCamOn ? 'Wyłącz kamerę' : 'Włącz kamerę'}
          className={`${ctrl} ${isCamOn ? ctrlOff : ctrlMuted}`}
        >
          <Icon name="cam" />
        </button>

        <button
          onClick={toggleScreenShare}
          aria-pressed={isScreenSharing}
          aria-label={isScreenSharing ? 'Zakończ udostępnianie ekranu' : 'Udostępnij ekran'}
          title={isScreenSharing ? 'Zakończ udostępnianie ekranu' : 'Udostępnij ekran'}
          className={`${ctrl} ${isScreenSharing ? ctrlOn : ctrlOff}`}
        >
          <Icon name="screen" />
        </button>

        <button
          onClick={() => {
            setShowSidePanel(!showSidePanel);
            setActiveSideTab('chat');
          }}
          aria-pressed={showSidePanel && activeSideTab === 'chat'}
          aria-label="Przełącz czat"
          title="Przełącz czat"
          className={`${ctrl} ${showSidePanel && activeSideTab === 'chat' ? ctrlOn : ctrlOff}`}
        >
          <Icon name="chat" />
        </button>
      </footer>
    </div>
  );
}