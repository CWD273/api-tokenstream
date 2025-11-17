let logs = [];

export default async function handler(req, res) {
  if (req.method === "POST") {
    try {
      const body = await req.json();
      logs.push({ ts: Date.now(), ...body });
      if (logs.length > 500) logs = logs.slice(-500);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message });
    }
    return;
  }

  if (req.method === "GET") {
    const wantsJson = req.query.json === "true";
    const idFilter = req.query.id || null;

    let result = logs;
    if (idFilter) {
      result = result.filter((l) => l.id === idFilter);
    }

    if (wantsJson) {
      res.setHeader("Content-Type", "application/json");
      res.status(200).send(JSON.stringify({ logs: result }));
    } else {
      res.setHeader("Content-Type", "text/plain");
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
