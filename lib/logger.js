import fetch from "node-fetch";

const logToEndpoint = async (entry) => {
  try {
    await fetch(`${process.env.LOG_ENDPOINT || "https://servicename.vercel.app/api/log"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    });
  } catch (e) {
    console.error("log_post_failed", e.message);
  }
};

export const log = (level, msg, meta = {}) => {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...meta
  };
  console.log(JSON.stringify(entry));
  logToEndpoint(entry);
};

export const info = (msg, meta) => log("info", msg, meta);
export const warn = (msg, meta) => log("warn", msg, meta);
export const error = (msg, meta) => log("error", msg, meta);
