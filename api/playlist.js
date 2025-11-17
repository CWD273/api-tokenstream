import fetch from "node-fetch";
import { Parser } from "m3u8-parser";

let cache = { segments: [], expiry: 0 };

export default async function handler(req, res) {
  const { id, url } = req.query;

  // Decide source URL
  let sourceUrl;
  if (url) {
    // If user provided a raw URL, ensure it goes through proxy
    if (url.startsWith("https://hlsr.vercel.app/api/proxy?url=")) {
      sourceUrl = url;
    } else {
      sourceUrl = `https://hlsr.vercel.app/api/proxy?url=${encodeURIComponent(url)}`;
    }
    console.log(`playlist_request: using custom url=${url}`);
  } else if (id) {
    // Fallback: use hardcoded bootstrap for known id
    sourceUrl = "https://hlsr.vercel.app/api/proxy?url=http://206.212.244.71:8080/live/Abxc5k/363887/46708.m3u8";
    console.log(`playlist_request: using id=${id}`);
  } else {
    res.status(400).send("Missing id or url");
    return;
  }

  try {
    // Refresh cache if empty or expired
    if (!cache.segments.length || Date.now() > cache.expiry) {
      console.log(`playlist_cache_refresh: fetching ${sourceUrl}`);
      const resp = await fetch(sourceUrl);
      if (!resp.ok) {
        console.error(`playlist_fetch_error: status=${resp.status}`);
        res.status(502).send("Upstream playlist error");
        return;
      }
      const text = await resp.text();

      const parser = new Parser();
      parser.push(text);
      parser.end();
      const manifest = parser.manifest;

      let playlistText = text;
      if (manifest.playlists?.length) {
        console.log("playlist_master_detected: selecting variant");
        const variant = manifest.playlists.reduce((best, v) => {
          const bw = v.attributes?.BANDWIDTH || 0;
          if (!best) return v;
          if (bw === 720000) return v;
          if (
            Math.abs(bw - 720000) <
            Math.abs(best.attributes?.BANDWIDTH - 720000)
          )
            return v;
          return best;
        }, null);

        console.log(
          `playlist_variant_selected: uri=${variant?.uri}, bandwidth=${variant?.attributes?.BANDWIDTH}`
        );

        const variantUrl = variant.uri.startsWith("https://hlsr.vercel.app/api/proxy?url=")
          ? variant.uri
          : `https://hlsr.vercel.app/api/proxy?url=${encodeURIComponent(variant.uri)}`;

        const variantResp = await fetch(variantUrl);
        if (!variantResp.ok) {
          console.error(`variant_fetch_error: status=${variantResp.status}`);
          res.status(502).send("Variant fetch error");
          return;
        }
        playlistText = await variantResp.text();
      }

      const lines = playlistText
        .split("\n")
        .filter((l) => l && !l.startsWith("#"));
      cache.segments = lines.slice(-10);
      cache.expiry = Date.now() + 4 * 60 * 1000;

      console.log(
        `playlist_cache_updated: segments=${cache.segments.length}, expiry=${cache.expiry}`
      );
    }

    const origin = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    const rewritten = cache.segments
      .map(
        (seg) =>
          `#EXTINF:6.0,\n${origin}/api/segment?seg=${encodeURIComponent(seg)}`
      )
      .join("\n");

    const playlist = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n${rewritten}`;

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(playlist);
  } catch (err) {
    console.error(`playlist_error: ${err.message}`);
    console.error(err.stack);
    res.status(500).send("Playlist error");
  }
}
