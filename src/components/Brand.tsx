import Image from "next/image";
import Link from "next/link";

/** Znak + napis w nagłówkach. Napis składany fontem, więc zawsze ostry. */
export function Brand({
  href = "/",
  compact = false,
}: {
  href?: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label="CHATTER – strona główna"
      className="flex items-center gap-2.5 rounded-md"
    >
      <Image
        src="/logo-mark.png"
        alt=""
        width={246}
        height={256}
        priority
        className="h-9 w-auto"
      />
      {!compact && (
        <span className="font-display text-[1.7rem] leading-none tracking-wide text-paper">
          CHATTER
        </span>
      )}
    </Link>
  );
}
