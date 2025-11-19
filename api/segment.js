import fetch from "node-fetch";

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range, User-Agent, Referer, Origin");
    res.status(200).end();
    return;
  }

  // Always set CORS headers
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
    return fetch(urlToFetch, {
      redirect: "follow",
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        "Referer": req.headers["referer"] || `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`,
        "Origin": `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`,
      },
    });
  }

  try {
    let resp = await fetchSegment(proxyUrl);
    if (!resp.ok) {
      console.warn(`segment_first_attempt_failed: status=${resp.status}`);
      // Retry once
      resp = await fetchSegment(proxyUrl);
    }

    console.log(`segment_upstream_status: ${resp.status}, final_url=${resp.url}`);

    if (!resp.ok) {
      const body = await resp.text();
      console.error(`segment_upstream_error: status=${resp.status}, body=${body.slice(0,200)}`);
      res.status(resp.status).send("Segment fetch failed");
      return;
    }

    // Forward useful headers
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
