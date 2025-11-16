import { channels, refreshJitterMs } from "./config.js";
import { get, set } from "./cache.js";
import { fetchPlaylistWithRedirect, buildRewrittenLeaf } from "./m3u8.js";
import { info, warn, error } from "./logger.js";

export const refreshChannel = async (id) => {
  const ch = channels[id];
  if (!ch) throw new Error(`Unknown channel: ${id}`);

  // Basic jitter to avoid multiple refreshes colliding
  await new Promise((r) => setTimeout(r, Math.floor(Math.random() * refreshJitterMs)));

  info("refresh_start", { id });

  const { finalUrl, text } = await fetchPlaylistWithRedirect(ch.bootstrapUrl);
  const leaf = await buildRewrittenLeaf({ finalUrl, text, id, preferredVariant: ch.preferredVariant });

  const saved = set(id, {
    tokenUrl: leaf.tokenUrl,
    manifestText: leaf.manifestText,
    rewrittenText: leaf.rewrittenText,
    expiry: leaf.expiry
  });

  info("refresh_done", { id, tokenUrl: saved.tokenUrl, expiry: saved.expiry });
  return saved;
};
