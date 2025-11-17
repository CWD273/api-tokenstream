// api/log.js
let logs = []; // ephemeral in-memory store

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const body = await req.json();
      logs.push({ ts: Date.now(), ...body });
      if (logs.length > 100) logs = logs.slice(-100);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
  } else if (req.method === "GET") {
    const wantsJson = req.query.json === "true";

    if (wantsJson) {
      res.setHeader("Content-Type", "application/json");
      res.status(200).json({ logs });
    } else {
      // fallback: simple text view
      res.setHeader("Content-Type", "text/plain");
      const lines = logs.map(
        l => `[${new Date(l.ts).toISOString()}] ${l.level || "info"}: ${l.msg} ${JSON.stringify(l)}`
      );
      res.status(200).send(lines.join("\n"));
    }
  } else {
    res.status(405).send("Method not allowed");
  }
}
