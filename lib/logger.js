import { get, set } from "@vercel/edge-config";

export const log = async (level, msg, meta = {}, req = null) => {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ua: req?.headers["user-agent"] || "unknown",
    ip: (req?.headers["x-forwarded-for"] || "").split(",")[0] || "unknown",
    path: req?.url || "unknown",
    ...meta
  };

  console.log(JSON.stringify(entry));

  const existing = (await get("logs")) || [];
  const updated = [...existing, entry].slice(-500);
  await set("logs", updated);
};
