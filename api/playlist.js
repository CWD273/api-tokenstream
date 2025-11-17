import { channels } from "../lib/config.js";
import { get } from "../lib/cache.js";
import { refreshChannel } from "../lib/refresh.js";
import { info, error } from "../lib/logger.js";

export default async function handler(req, res) {
  const { id } = req.query;

  info("playlist_request", { id }, req);

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

    if (!entry || now > entry.expiry) {
      info("playlist_refresh_needed", { id, hasEntry: !!entry, now, expiry: entry?.expiry }, req);
      entry = await refreshChannel(id, req);
    }

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    const origin = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    const adjusted = entry.rewrittenText.replace(/^(?!#)(.+)$/gm, (line) => {
      if (line.startsWith("/segment")) return `${origin}${line}`;
      return line;
    });

    res.setHeader("X-Token-Expiry", String(entry.expiry));
    res.status(200).send(adjusted);
  } catch (e) {
    error("playlist_error", { id, err: e.message }, req);
    res.status(502).send("#EXTM3U\n# Error: Playlist unavailable");
  }
}
