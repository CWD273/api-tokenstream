import { get } from "../lib/cache.js";
import { info } from "../lib/logger.js";

export default async function handler(req, res) {
  const { id } = req.query;
  const entry = id ? get(id) : null;

  info("health_request", { id, hasCache: !!entry }, req);

  res.setHeader("Content-Type", "application/json");
  res.status(200).send(
    JSON.stringify({
      ok: true,
      id: id || null,
      hasCache: !!entry,
      expiry: entry?.expiry || null,
      now: Date.now()
    })
  );
}
