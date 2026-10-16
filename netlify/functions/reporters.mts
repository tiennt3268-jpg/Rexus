import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { getUserFromRequest, unauthorized } from "./lib/auth.mts";

export default async (req: Request, context: Context) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorized();

  const db = getDatabase();

  try {
    if (req.method === "GET") {
      const rows = await db.sql`SELECT name FROM reporters ORDER BY name ASC`;
      return Response.json({ reporters: rows.map((r: any) => r.name) });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const name = String(body.name || "").trim();
      if (!name) return Response.json({ error: "Reporter name is required" }, { status: 400 });
      await db.sql`INSERT INTO reporters (name) VALUES (${name}) ON CONFLICT (name) DO NOTHING`;
      return Response.json({ name: name });
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url);
      var parts = url.pathname.split("/").filter(Boolean);
      var name = parts[2] ? decodeURIComponent(parts[2]) : null;
      if (!name) return Response.json({ error: "Missing reporter name" }, { status: 400 });
      await db.sql`DELETE FROM reporters WHERE name = ${name}`;
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unsupported method" }, { status: 405 });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: ["/api/reporters", "/api/reporters/*"]
};
