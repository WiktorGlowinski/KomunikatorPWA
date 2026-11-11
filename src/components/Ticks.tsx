/**
 * Kreski dźwięku z logo CHATTER – motyw przewodni aplikacji.
 * `active` włącza pulsowanie (ktoś mówi / trwa ładowanie).
 * Kolor dziedziczony z `currentColor`.
 */
export function Ticks({
  active = false,
  className = "size-6",
}: {
  active?: boolean;
  className?: string;
}) {
  const angles = [-58, -29, 0, 29, 58];
  const lengths = [6, 8, 10, 8, 6];
  const cx = 38;
  const cy = 20;
  const r1 = 13;

  return (
    <svg
      viewBox="0 0 40 40"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    >
      {angles.map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const r2 = r1 + lengths[i];
        const x1 = (cx - Math.cos(rad) * r1).toFixed(2);
        const y1 = (cy + Math.sin(rad) * r1).toFixed(2);
        const x2 = (cx - Math.cos(rad) * r2).toFixed(2);
        const y2 = (cy + Math.sin(rad) * r2).toFixed(2);
        return (
          <line
            key={deg}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            className={active ? "tick-anim" : undefined}
            style={active ? { animationDelay: `${i * 110}ms` } : undefined}
          />
        );
      })}
    </svg>
  );
}
