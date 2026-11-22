import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Market';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Issue #1524: Remove @ts-expect-error suppression
// ImageResponse is properly typed after npm install
export default async function Image({ params }: { params: { id: string } }) {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          fontSize: 48,
          background: 'white',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        Market {params.id}
      </div>
    ),
    { ...size }
  );
}
