import fetch from "node-fetch";

export default async function handler(req, res) {
  const { seg } = req.query;
  if (!seg) {
    res.status(400).send("Missing segment");
    return;
  }

  try {
    const proxyUrl = seg.startsWith("https://hlsr.vercel.app/api/proxy?url=")
      ? seg
      : `https://hlsr.vercel.app/api/proxy?url=${encodeURIComponent(seg)}`;

    const resp = await fetch(proxyUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": req.headers["user-agent"] || "Mozilla/5.0",
        "Referer": req.headers["referer"] || `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`,
        "Origin": `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`,
      },
    });

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
