import type { WebRTCStats } from '@/lib/types';

export function StatsPanel({ stats }: { stats: WebRTCStats }) {
  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4 font-mono text-xs">
      <div className="border-b border-line pb-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-paper">
          Parametry połączenia
        </h3>
        <p className="font-sans text-[11px] text-mute">
          Odczyt w czasie rzeczywistym z API WebRTC / LiveKit.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between border-b border-line/40 py-1.5">
          <span className="text-mute">Stan sesji</span>
          <span className="font-bold uppercase text-lime">
            {stats.transportState || 'połączono'}
          </span>
        </div>

        <div className="flex items-center justify-between border-b border-line/40 py-1.5">
          <span className="text-mute">Opóźnienie (RTT)</span>
          <span className="font-semibold text-paper">
            {stats.rtt !== null ? `${stats.rtt} ms` : 'b.d.'}
          </span>
        </div>

        <div className="flex items-center justify-between border-b border-line/40 py-1.5">
          <span className="text-mute">Jitter</span>
          <span className="font-semibold text-paper">
            {stats.jitter !== null ? `${stats.jitter} ms` : '0 ms'}
          </span>
        </div>

        <div className="flex items-center justify-between border-b border-line/40 py-1.5">
          <span className="text-mute">Utrata pakietów</span>
          <span
            className={`font-semibold ${
              stats.packetLossPercent && stats.packetLossPercent > 2
                ? 'text-danger'
                : 'text-paper'
            }`}
          >
            {stats.packetLossPercent !== null ? `${stats.packetLossPercent}%` : '0%'}
          </span>
        </div>

        <div className="flex items-center justify-between border-b border-line/40 py-1.5">
          <span className="text-mute">Bitrate Inbound</span>
          <span className="font-semibold text-paper">{stats.bitrateInbound} kbps</span>
        </div>

        <div className="flex items-center justify-between border-b border-line/40 py-1.5">
          <span className="text-mute">Bitrate Outbound</span>
          <span className="font-semibold text-paper">{stats.bitrateOutbound} kbps</span>
        </div>

        <div className="flex items-center justify-between border-b border-line/40 py-1.5">
          <span className="text-mute">Rozdzielczość wideo</span>
          <span className="font-semibold text-paper">
            {stats.resolution || 'Wideo wyłączone'}
          </span>
        </div>

        <div className="flex items-center justify-between border-b border-line/40 py-1.5">
          <span className="text-mute">Liczba klatek (FPS)</span>
          <span className="font-semibold text-paper">
            {stats.fps !== null ? `${stats.fps} FPS` : 'Wideo wyłączone'}
          </span>
        </div>

        <div className="flex items-center justify-between border-b border-line/40 py-1.5">
          <span className="text-mute">Kodek audio</span>
          <span className="font-semibold text-paper">{stats.audioCodec || 'Wyciszony'}</span>
        </div>

        <div className="flex items-center justify-between border-b border-line/40 py-1.5">
          <span className="text-mute">Kodek wideo</span>
          <span className="font-semibold text-paper">{stats.videoCodec || 'Wyłączony'}</span>
        </div>
      </div>
    </div>
  );
}
