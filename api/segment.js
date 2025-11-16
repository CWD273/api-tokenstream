import fetch from "node-fetch";
import { get, remove } from "../lib/cache.js";
import { refreshChannel } from "../lib/refresh.js";
import { info, warn, error } from "../lib/logger.js";
import { joinUrl, isAbsolute } from "../lib/url.js";
import { retryDelaysMs } from "../lib/config.js";

const fetchSegment = async (baseUrl, originalUri) => {
  const segmentUrl = isAbsolute(originalUri) ? originalUri : joinUrl(baseUrl, originalUri);
  const resp = await fetch(segmentUrl);
  return { resp, segmentUrl };
};

export default async function handler(req, res) {
  const { id, u } = req.query;

  if (!id || !u) {
    res.status(400).send("Missing id or segment url");
    return;
  }

  let entry = get(id);
  const attemptFetch = async () => {
    if (!entry) throw new Error("No cache entry; refresh required");
    const { resp, segmentUrl } = await fetchSegment(entry.tokenUrl, decodeURIComponent(u));
    info("segment_fetch_attempt", { id, segmentUrl, status: resp.status });

    if (!resp.ok) {
      // If token expired (commonly 401/403), refresh and retry
      if (resp.status === 401 || resp.status === 403) {
        warn("segment_token_expired", { id, status: resp.status });
        entry = await refreshChannel(id);
        const retry = await fetchSegment(entry.tokenUrl, decodeURIComponent(u));
        if (!retry.resp.ok) {
          throw new Error(`Retry failed: ${retry.resp.status}`);
        }
        return retry.resp;
      }
      throw new Error(`Segment fetch failed: ${resp.status}`);
    }

    return resp;
  };

  try {
    // Retry with small backoff to absorb token flip windows
    let response;
    for (let i = 0; i < retryDelaysMs.length; i++) {
      try {
        response = await attemptFetch();
        break;
      } catch (e) {
        warn("segment_retry", { id, attempt: i + 1, err: e.message });
        await new Promise((r) => setTimeout(r, retryDelaysMs[i]));
      }
    }
    // Final attempt without delay
    if (!response) response = await attemptFetch();

    // Stream back to client
    res.setHeader("Content-Type", "video/mp2t");
    // Pass through partial headers for smoother playback
    const passHeaders = ["content-length", "etag", "last-modified", "cache-control"];
    passHeaders.forEach((h) => {
      const v = response.headers.get(h);
      if (v) res.setHeader(h, v);
    });

    // Pipe body
    const reader = response.body;
    reader.pipe(res);
  } catch (e) {
    error("segment_error", { id, err: e.message });
    // Return 502 to signal player to retry
    res.status(502).send("Segment unavailable");
  }
}
