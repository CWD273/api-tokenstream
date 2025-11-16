// Register channels and their bootstrap URLs (the redirecting, token-granting endpoint).
// You can extend this with more channels.
export const channels = {
  "cartoon-network": {
    // Source that redirects to tokenized .m3u8
    bootstrapUrl: "http://206.212.244.71:8080/live/Abxc5k/363887/46708.m3u8",
    // Optional: choose ABR variant by index or bandwidth; fallback = first
    preferredVariant: "highest" // "lowest" | "highest" | number (index)
  }
};

// Default token TTL in ms if not inferable; adjusted conservatively
export const defaultTokenTtlMs = 4 * 60 * 1000;

// Small jitter to avoid thundering herd on refresh
export const refreshJitterMs = 300;

// Retry/backoff for segment errors
export const retryDelaysMs = [250, 500, 1000];
