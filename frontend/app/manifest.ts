import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BOXMEOUT — Boxing Prediction Market",
    short_name: "BOXMEOUT",
    description: "Decentralized boxing prediction market on Stellar",
    start_url: "/",
    display: "standalone",
    background_color: "#111827",
    theme_color: "#F59E0B",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
