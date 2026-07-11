import type { MetadataRoute } from "next";

const BASE_URL = "https://cortex.nutef.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/termos`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE_URL}/privacidade`, changeFrequency: "monthly", priority: 0.4 },
  ];
}
