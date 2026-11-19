'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Ticks } from './Ticks';

export function ParticipantAvatar({
  name,
  url,
  speaking = false,
  className,
  textClass,
  ticksClassName,
}: {
  name: string;
  url?: string | null;
  speaking?: boolean;
  className: string;
  textClass: string;
  ticksClassName?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = Boolean(url && failedUrl === url);

  const avatar =
    url && !failed ? (
      <Image
        src={url}
        alt=""
        width={128}
        height={128}
        unoptimized
        onError={() => setFailedUrl(url)}
        className={`${className} rounded-full border border-line object-cover`}
      />
    ) : (
      <div
        className={`${className} ${textClass} font-display flex items-center justify-center rounded-full uppercase transition-colors ${
          speaking ? 'bg-lime text-ink' : 'bg-line text-paper'
        }`}
      >
        {(name || 'U')[0]}
      </div>
    );

  if (!ticksClassName) return avatar;

  return (
    <div className="relative">
      {speaking && (
        <Ticks
          active
          className={`absolute right-full top-1/2 mr-0.5 -translate-y-1/2 text-lime ${ticksClassName}`}
        />
      )}
      {avatar}
    </div>
  );
}
