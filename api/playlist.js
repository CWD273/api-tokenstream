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

    // Forward headers and follow redirects
    const resp = await fetch(sourceUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        "Referer":
          req.headers["referer"] ||
          `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`,
      },
    });

    console.log(`playlist_upstream_status: ${resp.status}`);
    console.log(`playlist_final_url: ${resp.url}`);

    if (!resp.ok) {
      const body = await resp.text();
      console.error(
        `playlist_upstream_error_body: ${body.slice(0, 200)}...`
      );
      res.status(502).send("Upstream playlist error");
      return;
    }

    let playlistText = await resp.text();
    const origin = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    let lines = playlistText.split("\n");

    // Ensure required headers exist
    if (!lines.some((l) => l.startsWith("#EXTM3U"))) {
      lines.unshift("#EXTM3U");
    }
    if (!lines.some((l) => l.startsWith("#EXT-X-VERSION"))) {
      lines.splice(1, 0, "#EXT-X-VERSION:3");
    }

    // Rewrite only .ts segment URIs
    const rewritten = lines
      .map((line) => {
        if (!line || line.startsWith("#")) return line; // preserve tags
        if (line.trim().endsWith(".ts")) {
          return `${origin}/api/segment?seg=${encodeURIComponent(line.trim())}`;
        }
        return line; // leave other URIs (like variant .m3u8) untouched
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
