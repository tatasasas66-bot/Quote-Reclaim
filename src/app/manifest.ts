import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Quote Reclaim",
    short_name: "QR",
    description: "Work quiet contractor quotes from one daily recovery queue.",
    start_url: "/dashboard?focus=today",
    display: "standalone",
    background_color: "#FAFAF7",
    theme_color: "#1E5128",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
