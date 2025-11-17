import fetch from "node-fetch";

export default async function handler(req, res) {
  const { seg } = req.query;
  if (!seg) {
    console.error("segment_request: missing seg parameter");
    res.status(400).send("Missing segment");
    return;
  }

  try {
    console.log(`segment_request: seg=${seg}`);

    const proxyUrl = seg.startsWith("https://hlsr.vercel.app/api/proxy?url=")
      ? seg
      : `https://hlsr.vercel.app/api/proxy?url=${encodeURIComponent(seg)}`;

    const resp = await fetch(proxyUrl);
    if (!resp.ok) {
      console.error(`segment_fetch_error: status=${resp.status}, seg=${seg}`);
      res.status(502).send("Segment fetch failed");
      return;
    }

    console.log(`segment_serving: seg=${seg}, status=${resp.status}`);

    res.setHeader("Content-Type", "video/mp2t");
    resp.body.pipe(res);
  } catch (err) {
    console.error(`segment_error: ${err.message}`);
    console.error(err.stack);
    res.status(500).send("Segment error");
  }
}
