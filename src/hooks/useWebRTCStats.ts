'use client';

import { useEffect, useRef, useState } from 'react';
import type { Room } from 'livekit-client';
import type { WebRTCStats } from '@/lib/types';

interface EngineWithStats {
  rtt?: number;
  client?: { rtt?: number };
  publisher?: { pc?: RTCPeerConnection; peerConnection?: RTCPeerConnection };
  subscriber?: { pc?: RTCPeerConnection; peerConnection?: RTCPeerConnection };
}

interface TrackWithStats {
  getRTCStatsReport?: () => Promise<RTCStatsReport | undefined>;
}

interface ExtendedStatsReport {
  type: string;
  bytesSent?: number;
  bytesReceived?: number;
  packetsLost?: number;
  packetsReceived?: number;
  jitter?: number;
  roundTripTime?: number;
  currentRoundTripTime?: number;
  state?: string;
  nominated?: boolean;
  frameWidth?: number;
  frameHeight?: number;
  width?: number;
  height?: number;
  framesPerSecond?: number;
  mimeType?: string;
}

export function useWebRTCStats(room: Room | undefined): WebRTCStats {
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

  useEffect(() => {
    if (!room) return;

    const interval = setInterval(async () => {
      try {
        let totalBytesSent = 0;
        let totalBytesRecv = 0;
        let packetsLostTotal = 0;
        let packetsRecvTotal = 0;
        let currentRtt: number | null = null;
        let currentJitter: number | null = null;
        let resStr: string | null = null;
        let currentFps: number | null = null;
        let aCodec: string | null = null;
        let vCodec: string | null = null;

        const engine = (room as unknown as { engine?: EngineWithStats }).engine;
        if (engine) {
          if (typeof engine.rtt === 'number' && engine.rtt > 0) {
            currentRtt = Math.round(engine.rtt);
          } else if (typeof engine.client?.rtt === 'number' && engine.client.rtt > 0) {
            currentRtt = Math.round(engine.client.rtt);
          }
        }

        const pcsSet = new Set<RTCPeerConnection>();
        if (engine?.publisher?.pc) pcsSet.add(engine.publisher.pc);
        if (engine?.publisher?.peerConnection) pcsSet.add(engine.publisher.peerConnection);
        if (engine?.subscriber?.pc) pcsSet.add(engine.subscriber.pc);
        if (engine?.subscriber?.peerConnection) pcsSet.add(engine.subscriber.peerConnection);

        const reports: RTCStatsReport[] = [];
        for (const pc of pcsSet) {
          if (pc && typeof pc.getStats === 'function') {
            try {
              const s = await pc.getStats();
              reports.push(s);
            } catch {}
          }
        }

        const allTrackPubs = [
          ...Array.from(room.localParticipant.trackPublications.values()),
          ...Array.from(room.remoteParticipants.values()).flatMap((p) =>
            Array.from(p.trackPublications.values())
          ),
        ];

        for (const pub of allTrackPubs) {
          const track = pub.track as TrackWithStats | undefined;
          if (track && typeof track.getRTCStatsReport === 'function') {
            try {
              const rep = await track.getRTCStatsReport();
              if (rep) reports.push(rep);
            } catch {}
          }
        }

        for (const stats of reports) {
          stats.forEach((rawReport) => {
            const report = rawReport as unknown as ExtendedStatsReport;

            if (report.type === 'outbound-rtp') {
              if (typeof report.bytesSent === 'number') {
                totalBytesSent += report.bytesSent;
              }
              const w = report.frameWidth || report.width;
              const h = report.frameHeight || report.height;
              if (w && h) resStr = `${w}x${h}`;
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
              if (w && h) resStr = `${w}x${h}`;
              if (typeof report.framesPerSecond === 'number' && report.framesPerSecond > 0) {
                currentFps = Math.round(report.framesPerSecond);
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

            if (
              report.type === 'candidate-pair' &&
              (report.state === 'succeeded' || report.nominated)
            ) {
              if (typeof report.currentRoundTripTime === 'number' && report.currentRoundTripTime > 0) {
                currentRtt = Math.round(report.currentRoundTripTime * 1000);
              }
            }

            if (report.type === 'media-source' && (report.width || report.frameWidth)) {
              const w = report.width || report.frameWidth;
              const h = report.height || report.frameHeight;
              if (w && h) resStr = `${w}x${h}`;
              if (typeof report.framesPerSecond === 'number' && report.framesPerSecond > 0) {
                currentFps = Math.round(report.framesPerSecond);
              }
            }

            if (report.type === 'codec' && report.mimeType) {
              const mime = report.mimeType.toLowerCase();
              if (mime.startsWith('audio/')) aCodec = report.mimeType;
              if (mime.startsWith('video/')) vCodec = report.mimeType;
            }
          });
        }

        if (!resStr || !currentFps) {
          const allMediaTracks: MediaStreamTrack[] = [];
          room.localParticipant.trackPublications.forEach((pub) => {
            if (pub.track?.mediaStreamTrack) allMediaTracks.push(pub.track.mediaStreamTrack);
          });
          room.remoteParticipants.forEach((p) => {
            p.trackPublications.forEach((pub) => {
              if (pub.track?.mediaStreamTrack) allMediaTracks.push(pub.track.mediaStreamTrack);
            });
          });

          for (const mst of allMediaTracks) {
            if (mst.kind === 'video') {
              const settings = mst.getSettings();
              if (!resStr && settings.width && settings.height) {
                resStr = `${settings.width}x${settings.height}`;
              }
              if (!currentFps && settings.frameRate) {
                currentFps = Math.round(settings.frameRate);
              }
            }
          }
        }

        const now = Date.now();
        let bitOut = 0;
        let bitIn = 0;

        if (prevStatsRef.current.time > 0) {
          const deltaSec = (now - prevStatsRef.current.time) / 1000;
          if (deltaSec > 0) {
            const sentDiff = totalBytesSent - prevStatsRef.current.bytesSent;
            const recvDiff = totalBytesRecv - prevStatsRef.current.bytesRecv;

            if (sentDiff > 0) {
              bitOut = Math.round((sentDiff * 8) / deltaSec / 1000);
            }
            if (recvDiff > 0) {
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
        const lossRate =
          totalPackets > 0 ? Number(((packetsLostTotal / totalPackets) * 100).toFixed(2)) : 0;

        const hasAudio =
          room.localParticipant.isMicrophoneEnabled ||
          Array.from(room.remoteParticipants.values()).some((p) => p.isMicrophoneEnabled);
        const hasVideo =
          room.localParticipant.isCameraEnabled ||
          room.localParticipant.isScreenShareEnabled ||
          Array.from(room.remoteParticipants.values()).some(
            (p) => p.isCameraEnabled || p.isScreenShareEnabled
          );

        setWebrtcStats({
          rtt: currentRtt,
          jitter: currentJitter,
          packetLossPercent: lossRate,
          bitrateInbound: bitIn,
          bitrateOutbound: bitOut,
          resolution: resStr,
          fps: currentFps,
          audioCodec: hasAudio ? aCodec || 'audio/opus' : null,
          videoCodec: hasVideo ? vCodec || 'video/VP8' : null,
          transportState: room.state,
        });
      } catch (err) {
        console.error('Błąd odczytu parametrów WebRTC:', err);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [room]);

  return webrtcStats;
}
