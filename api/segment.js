import fetch from "node-fetch";
import { get } from "../lib/cache.js";
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

  info("segment_request", { id, u }, req);

  if (!id || !u) {
    res.status(400).send("Missing id or segment url");
    return;
  }

  let entry = get(id);

  const attemptFetch = async () => {
    if (!entry) throw new Error("No cache entry; refresh required");
    const originalUri = decodeURIComponent(u);
    const { resp, segmentUrl } = await fetchSegment(entry.tokenUrl, originalUri);
    info("segment_fetch_attempt", { id, segmentUrl, status: resp.status }, req);

    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        warn("segment_token_expired", { id, status: resp.status }, req);
        entry = await refreshChannel(id, req);
        const retry = await fetchSegment(entry.tokenUrl, originalUri);
        info("segment_retry_after_refresh", { id, status: retry.resp.status }, req);
        if (!retry.resp.ok) throw new Error(`Retry failed: ${retry.resp.status}`);
        return retry.resp;
      }
      throw new Error(`Segment fetch failed: ${resp.status}`);
    }

    return resp;
  };

  try {
    let response;
    for (let i = 0; i < retryDelaysMs.length; i++) {
      try {
        response = await attemptFetch();
        break;
      } catch (e) {
        warn("segment_retry", { id, attempt: i + 1, err: e.message }, req);
        await new Promise((r) => setTimeout(r, retryDelaysMs[i]));
      }
    }
    if (!response) response = await attemptFetch();

    res.setHeader("Content-Type", "video/mp2t");
    const passHeaders = ["content-length", "etag", "last-modified", "cache-control"];
    passHeaders.forEach((h) => {
      const v = response.headers.get(h);
      if (v) res.setHeader(h, v);
    });

    response.body.pipe(res);
  } catch (e) {
    error("segment_error", { id, err: e.message }, req);
    res.status(502).send("Segment unavailable");
  }
          }
