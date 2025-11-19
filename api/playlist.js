import fetch from "node-fetch";

export default async function handler(req, res) {
  const { id, url } = req.query;

  // Decide source URL
  let sourceUrl;
  if (url) {
    sourceUrl = url.startsWith("https://hlsr.vercel.app/api/proxy?url=")
      ? url
      : `https://hlsr.vercel.app/api/proxy?url=${encodeURIComponent(url)}`;
    console.log(`playlist_request: custom url=${url}`);
  } else if (id) {
    // Example hardcoded bootstrap for id
    sourceUrl =
      "https://hlsr.vercel.app/api/proxy?url=http://206.212.244.71:8080/live/Abxc5k/363887/46708.m3u8";
    console.log(`playlist_request: id=${id}`);
  } else {
    console.error("playlist_request: missing id or url");
    res.status(400).send("Missing id or url");
    return;
  }

  try {
    console.log(`playlist_fetch: sourceUrl=${sourceUrl}`);
    const resp = await fetch(sourceUrl);
    if (!resp.ok) {
      console.error(`playlist_fetch_error: status=${resp.status}`);
      res.status(502).send("Upstream playlist error");
      return;
    }
    const playlistText = await resp.text();

    const origin = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    const rewritten = playlistText
      .split("\n")
      .map((line) => {
        if (!line || line.startsWith("#")) {
          // Preserve all tags (#EXTINF, #EXT-X-*, etc.)
          return line;
        }
        // Only rewrite if it looks like a segment (.ts)
        if (line.endsWith(".ts")) {
          return `${origin}/api/segment?seg=${encodeURIComponent(line)}`;
        }
        // Leave other URIs (like variant .m3u8) untouched
        return line;
      })
      .join("\n");

    console.log("playlist_rewritten: served to client");

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("X-Source-Url", sourceUrl); // diagnostic header
    res.status(200).send(rewritten);
  } catch (err) {
    console.error(`playlist_error: ${err.message}`);
    console.error(err.stack);
    res.status(500).send("Playlist error");
  }
}
