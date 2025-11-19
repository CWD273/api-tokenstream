import fetch from "node-fetch";

export default async function handler(req, res) {
  const { id, url } = req.query;

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
    res.status(400).send("Missing id or url");
    return;
  }

  try {
    const resp = await fetch(sourceUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        "Referer": req.headers["referer"] || `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`,
        "Origin": `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`,
      },
    });

    console.log(`playlist_upstream_status: ${resp.status}, final_url=${resp.url}`);

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`playlist_upstream_error: status=${resp.status}, body=${body.slice(0,200)}`);
      res.status(resp.status).send("Upstream playlist error");
      return;
    }

    let playlistText = await resp.text();
    const origin = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    let lines = playlistText.split("\n");

    // Ensure required headers exist
    if (!lines.some(l => l.startsWith("#EXTM3U"))) lines.unshift("#EXTM3U");
    if (!lines.some(l => l.startsWith("#EXT-X-VERSION"))) lines.splice(1, 0, "#EXT-X-VERSION:3");

    // Collect segment durations
    let maxDuration = 0;
    let mediaSeq = null;
    lines.forEach(line => {
      if (line.startsWith("#EXTINF:")) {
        const dur = parseFloat(line.replace("#EXTINF:", "").split(",")[0]);
        if (!isNaN(dur)) maxDuration = Math.max(maxDuration, dur);
      }
      if (line.startsWith("#EXT-X-MEDIA-SEQUENCE")) {
        mediaSeq = parseInt(line.split(":")[1], 10);
      }
    });

    // Normalize target duration
    if (!lines.some(l => l.startsWith("#EXT-X-TARGETDURATION"))) {
      lines.splice(2, 0, `#EXT-X-TARGETDURATION:${Math.ceil(maxDuration) || 10}`);
    }

    // Normalize media sequence
    if (mediaSeq === null) {
      lines.splice(3, 0, "#EXT-X-MEDIA-SEQUENCE:0");
    }

    // Rewrite only .ts segment URIs
    const rewritten = lines.map(line => {
      if (!line || line.startsWith("#")) return line;
      if (line.trim().endsWith(".ts")) {
        return `${origin}/api/segment?seg=${encodeURIComponent(line.trim())}`;
      }
      return line; // leave .m3u8 references untouched
    }).join("\n");

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.status(200).send(rewritten);
  } catch (err) {
    console.error(`playlist_error: ${err.message}`);
    res.status(500).send("Playlist error");
  }
}
