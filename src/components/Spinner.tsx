import { Ticks } from "./Ticks";

export function FullScreenLoader({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink text-mute"
    >
      <Ticks active className="size-14 text-lime" />
      <span className="text-sm">{text}</span>
    </div>
  );
}
