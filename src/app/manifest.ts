import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CHATTER – rozmowy głosowe i wideo',
    short_name: 'CHATTER',
    description:
      'Twórz pokoje, wysyłaj link i rozmawiaj głosem, obrazem i na czacie w przeglądarce.',
    start_url: '/',
    display: 'standalone',
    background_color: '#14110e',
    theme_color: '#14110e',
    lang: 'pl',
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/logo-mark.png',
        sizes: '246x256',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
