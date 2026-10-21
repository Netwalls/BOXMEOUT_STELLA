/* eslint-disable @next/next/no-img-element */
// @ts-expect-error -- next/og types resolve after npm install
import { ImageResponse } from "next/og";
import { fetchMarketById } from "@/lib/api";

export const runtime = "edge";
export const alt = "Market preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

interface Props {
  params: { id: string };
}

export default async function OgImage({ params }: Props): Promise<ImageResponse> {
  const market = await fetchMarketById(params.id).catch(() => null);

  // Fallback card when market not found
  if (!market) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#111827",
          }}
        >
          <span style={{ color: "#F59E0B", fontSize: 48, fontWeight: 800 }}>
            BOXMEOUT
          </span>
        </div>
      ),
      { ...size }
    );
  }

  const { fighterA, fighterB, scheduledAt, poolA, poolB } = market;

  const date = new Date(scheduledAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  // Implied odds from pool sizes
  const pA = Number(BigInt(poolA));
  const pB = Number(BigInt(poolB));
  const total = pA + pB;
  const oddsA = total > 0 ? Math.round((pA / total) * 100) : 50;
  const oddsB = 100 - oddsA;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#111827",
          padding: "60px 80px",
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", marginBottom: 40 }}>
          <span style={{ color: "#F59E0B", fontSize: 28, fontWeight: 800, letterSpacing: 2 }}>
            BOXMEOUT
          </span>
        </div>

        {/* Fighters row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flex: 1,
          }}
        >
          {/* Fighter A */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              flex: 1,
            }}
          >
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: "50%",
                background: "#1F2937",
                border: "3px solid #F59E0B",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 48,
              }}
            >
              🥊
            </div>
            <span style={{ color: "#FFFFFF", fontSize: 36, fontWeight: 700, textAlign: "center" }}>
              {fighterA.name}
            </span>
            <span style={{ color: "#9CA3AF", fontSize: 20 }}>{fighterA.record}</span>
            <div
              style={{
                background: "#F59E0B",
                color: "#000",
                fontWeight: 800,
                fontSize: 28,
                padding: "6px 20px",
                borderRadius: 8,
              }}
            >
              {oddsA}%
            </div>
          </div>

          {/* VS */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              padding: "0 40px",
            }}
          >
            <span style={{ color: "#F59E0B", fontSize: 52, fontWeight: 900 }}>VS</span>
            <span style={{ color: "#6B7280", fontSize: 18 }}>{date}</span>
            <span style={{ color: "#6B7280", fontSize: 16 }}>{fighterA.weightClass}</span>
          </div>

          {/* Fighter B */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              flex: 1,
            }}
          >
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: "50%",
                background: "#1F2937",
                border: "3px solid #6366F1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 48,
              }}
            >
              🥊
            </div>
            <span style={{ color: "#FFFFFF", fontSize: 36, fontWeight: 700, textAlign: "center" }}>
              {fighterB.name}
            </span>
            <span style={{ color: "#9CA3AF", fontSize: 20 }}>{fighterB.record}</span>
            <div
              style={{
                background: "#6366F1",
                color: "#fff",
                fontWeight: 800,
                fontSize: 28,
                padding: "6px 20px",
                borderRadius: 8,
              }}
            >
              {oddsB}%
            </div>
          </div>
        </div>

        {/* Odds bar */}
        <div
          style={{
            display: "flex",
            height: 12,
            borderRadius: 6,
            overflow: "hidden",
            marginTop: 40,
          }}
        >
          <div style={{ width: `${oddsA}%`, background: "#F59E0B" }} />
          <div style={{ width: `${oddsB}%`, background: "#6366F1" }} />
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: 20,
            color: "#6B7280",
            fontSize: 16,
          }}
        >
          Decentralized boxing prediction market on Stellar
        </div>
      </div>
    ),
    { ...size }
  );
}
