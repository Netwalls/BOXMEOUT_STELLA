import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BOXMEOUT — Boxing Prediction Market',
    short_name: 'BOXMEOUT',
    description: 'Decentralized boxing prediction market on Stellar',
    start_url: '/',
    display: 'standalone',
    background_color: '#111827',
    theme_color: '#F59E0B',
    icons: [
      {
        src: '/icon',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
