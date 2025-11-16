import { channels } from "../lib/config.js";
import { get } from "../lib/cache.js";
import { refreshChannel } from "../lib/refresh.js";
import { info, warn, error } from "../lib/logger.js";

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) {
    res.status(400).send("#EXTM3U\n# Error: Missing id");
    return;
  }
  if (!channels[id]) {
    res.status(404).send(`#EXTM3U\n# Error: Unknown id '${id}'`);
    return;
  }

  try {
    let entry = get(id);
    const now = Date.now();

    // Refresh if missing or expired
    if (!entry || now > entry.expiry) {
      info("playlist_refresh_needed", { id, hasEntry: !!entry, now, expiry: entry?.expiry });
      entry = await refreshChannel(id);
    }

    // Serve rewritten playlist; ensure Content-Type for HLS
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    // Absolute path is safer for players; use Vercel request host
    const origin = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    const adjusted = entry.rewrittenText.replace(/^(?!#)(.+)$/gm, (line) => {
      // line already points to /segment?id=...&u=... without origin; prepend origin
      if (line.startsWith("/segment")) return `${origin}${line}`;
      return line;
    });

    res.status(200).send(adjusted);
  } catch (e) {
    error("playlist_error", { id, err: e.message });
    res.status(502).send("#EXTM3U\n# Error: Playlist unavailable");
  }
}
