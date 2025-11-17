import fetch from "node-fetch";
import { defaultLogEndpoint } from "./config.js";

const postLog = async (entry) => {
  const endpoint = process.env.LOG_ENDPOINT || defaultLogEndpoint;
  try {
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    }).catch(() => {});
  } catch {
  }
};

export const connectionInfo = (req) => ({
  ua: req.headers["user-agent"] || "unknown",
  ip: (req.headers["x-forwarded-for"] || "").split(",")[0] || "unknown",
  proto: req.headers["x-forwarded-proto"] || "http",
  host: req.headers.host || "unknown",
  path: req.url || "unknown"
});

export const log = (level, msg, meta = {}, req = null) => {
  const base = req ? connectionInfo(req) : {};
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...base,
    ...meta
  };
  console.log(JSON.stringify(entry));
  postLog(entry);
};

export const info = (msg, meta, req) => log("info", msg, meta, req);
export const warn = (msg, meta, req) => log("warn", msg, meta, req);
export const error = (msg, meta, req) => log("error", msg, meta, req);
