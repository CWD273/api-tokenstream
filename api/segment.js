import fetch from "node-fetch";

let lastPlaylist = { segments: [], expiry: 0 };

async function refreshPlaylist(baseUrl) {
  console.log(`segment_refresh: fetching new playlist from ${baseUrl}`);
  const resp = await fetch(baseUrl);
  if (!resp.ok) {
    console.error(`segment_refresh_error: status=${resp.status}`);
    return [];
  }
  const text = await resp.text();
  const lines = text.split("\n").filter(l => l && !l.startsWith("#"));
  console.log(`segment_refresh: got ${lines.length} segments`);
  lastPlaylist.segments = lines;
  lastPlaylist.expiry = Date.now() + 60 * 1000; // assume 1 min validity
  return lines;
}

export default async function handler(req, res) {
  const { seg, url } = req.query;
  if (!seg) {
    console.error("segment_request: missing seg parameter");
    res.status(400).send("Missing segment");
    return;
  }

  try {
    const proxyUrl = seg.startsWith("https://hlsr.vercel.app/api/proxy?url=")
      ? seg
      : `https://hlsr.vercel.app/api/proxy?url=${encodeURIComponent(seg)}`;

    console.log(`segment_request: proxyUrl=${proxyUrl}`);

    let resp = await fetch(proxyUrl);
    if (!resp.ok) {
      console.warn(`segment_fetch_failed: status=${resp.status}, seg=${seg}`);

      // Attempt refresh if upstream failed
      if (url) {
        const baseUrl = url.startsWith("https://hlsr.vercel.app/api/proxy?url=")
          ? url
          : `https://hlsr.vercel.app/api/proxy?url=${encodeURIComponent(url)}`;
        const segments = await refreshPlaylist(baseUrl);

        // Try to find a matching segment in refreshed playlist
        const match = segments.find(s => seg.includes(s));
        if (match) {
          const retryUrl = `https://hlsr.vercel.app/api/proxy?url=${encodeURIComponent(match)}`;
          console.log(`segment_retry: retrying with ${retryUrl}`);
          resp = await fetch(retryUrl);
        }
      }
    }

    if (!resp.ok) {
      console.error(`segment_final_error: status=${resp.status}, seg=${seg}`);
      res.status(502).send("Segment fetch failed");
      return;
    }

    console.log(`segment_serving: seg=${seg}, status=${resp.status}`);
    res.setHeader("Content-Type", "video/mp2t");

    // Preserve useful upstream headers
    const copyHeaders = ["content-length", "cache-control", "accept-ranges"];
    copyHeaders.forEach(h => {
      const val = resp.headers.get(h);
      if (val) res.setHeader(h, val);
    });

    resp.body.pipe(res);
  } catch (err) {
    console.error(`segment_error: ${err.message}`);
    console.error(err.stack);
    res.status(500).send("Segment error");
  }
}
