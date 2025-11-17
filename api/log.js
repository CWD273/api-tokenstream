import { get, set } from "@vercel/edge-config";

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const existing = (await get("logs")) || [];
      const updated = [...existing, { ts: Date.now(), ...body }];
      const trimmed = updated.slice(-500);
      await set("logs", trimmed);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
    return;
  }

  if (req.method === "GET") {
    const wantsJson = req.query.json === "true";
    const idFilter = req.query.id || null;

    const logs = (await get("logs")) || [];
    const result = idFilter ? logs.filter((l) => l.id === idFilter) : logs;

    if (wantsJson) {
      res.setHeader("Content-Type", "application/json");
      res.status(200).json({ logs: result });
    } else {
      res.setHeader("Content-Type", "text/plain");
      if (!result.length) {
        res.status(200).send("No logs yet");
        return;
      }
      const lines = result.map(
        (l) =>
          `[${new Date(l.ts).toISOString()}] ${l.level || "info"} ${l.msg} ` +
          `ua="${l.ua || ""}" ip="${l.ip || ""}" path="${l.path || ""}" ` +
          `${JSON.stringify(l)}`
      );
      res.status(200).send(lines.join("\n"));
    }
    return;
  }

  res.status(405).send("Method not allowed");
}
