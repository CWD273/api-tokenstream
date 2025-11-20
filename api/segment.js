import fetch from "node-fetch";

let upstreamCookies = ""; // share cookie jar

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range, User-Agent, Referer, Origin");
    res.status(200).end();
    return;
  }

  // Always set CORS headers downstream
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range, User-Agent, Referer, Origin");

  const { seg } = req.query;
  if (!seg) {
    res.status(400).send("Missing segment");
    return;
  }

  const proxyUrl = seg.startsWith("https://hlsr.vercel.app/api/proxy?url=")
    ? seg
    : `https://hlsr.vercel.app/api/proxy?url=${encodeURIComponent(seg)}`;

  async function fetchSegment(urlToFetch) {
    const headers = {
      "User-Agent": "VLC/3.0.18 LibVLC/3.0.18",
      "Referer": "http://206.212.244.71:8080/",
    };
    if (upstreamCookies) headers["Cookie"] = upstreamCookies;

    console.log(`segment_upstream_request: url=${urlToFetch}, headers=${JSON.stringify(headers)}`);
    const resp = await fetch(urlToFetch, { redirect: "follow", headers });

    const setCookie = resp.headers.get("set-cookie");
    if (setCookie) {
      upstreamCookies = setCookie;
      console.log(`segment_upstream_set_cookie: ${setCookie}`);
    }

    return resp;
  }

  try {
    let resp = await fetchSegment(proxyUrl);

    if (resp.status === 403) {
      console.warn("segment_token_or_cors_block: refreshing playlist…");
      await new Promise(resolve => setTimeout(resolve, 400));

      const playlistUrl = `https://hlsr.vercel.app/api/playlist?id=cartoon-network`;
      const playlistResp = await fetch(playlistUrl, { redirect: "follow" });
      if (playlistResp.ok) {
        const playlistText = await playlistResp.text();
        const newSeg = playlistText.split("\n").find(l => l && !l.startsWith("#") && l.endsWith(".ts"));
        if (newSeg) {
          console.log(`segment_retry_with_new_token: ${newSeg}`);
          resp = await fetchSegment(newSeg);
        }
      }
    }

    console.log(`segment_upstream_status: ${resp.status}, final_url=${resp.url}`);

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`segment_upstream_error: status=${resp.status}, body=${body.slice(0,200)}`);
      res.status(resp.status).send("Segment fetch failed");
      return;
    }

    const copyHeaders = ["content-length", "cache-control", "accept-ranges", "etag", "last-modified"];
    copyHeaders.forEach(h => {
      const val = resp.headers.get(h);
      if (val) res.setHeader(h, val);
    });

    res.setHeader("Content-Type", "video/mp2t");
    resp.body.pipe(res);
  } catch (err) {
    console.error(`segment_error: ${err.message}`);
    res.status(500).send("Segment error");
  }
}
