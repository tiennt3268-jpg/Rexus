import type { Context, Config } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { hashPassword, createPasswordResetToken, verifyPasswordResetToken } from "./lib/auth.mts";
import { passwordPolicyError } from "./lib/account-rules.mts";

// This deployment has no outbound email infrastructure, so "forgot password"
// is implemented as a two-step, in-app identity check instead of an emailed
// reset link: (1) the person proves they know their own username AND the
// exact email on file for that account, which issues a short-lived signed
// token; (2) that token is redeemed once to set a new password. No email is
// ever sent — the "verification" is matching both fields against the
// account record, not a mailed confirmation.
export default async (req: Request, context: Context) => {
  if (req.method !== "POST") return Response.json({ error: "Unsupported method" }, { status: 405 });

  try {
    const body = await req.json();
    const action = String(body.action || "");
    const db = getDatabase();

    if (action === "verify") {
      const username = String(body.username || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      if (!username || !email) {
        return Response.json({ error: "Please enter both your username and email." }, { status: 400 });
      }

      const rows = await db.sql`
        SELECT id, username, full_name, email, status FROM users
        WHERE username = ${username} AND LOWER(email) = ${email}
      `;
      // Deliberately generic error either way — this endpoint should not
      // reveal whether a username or an email exists on its own.
      if (!rows.length) {
        return Response.json({ error: "Username and email do not match our records." }, { status: 404 });
      }
      const user = rows[0];
      if (user.status && user.status !== "Active") {
        return Response.json({ error: "This account has been deactivated. Contact a System Admin." }, { status: 403 });
      }

      const token = await createPasswordResetToken(user.id);
      return Response.json({ token, full_name: user.full_name || user.username });
    }

    if (action === "reset") {
      const token = String(body.token || "");
      const newPassword = String(body.new_password || "");
      const weak = passwordPolicyError(newPassword);
      if (weak) return Response.json({ error: weak }, { status: 400 });
      const verified = await verifyPasswordResetToken(token);
      if (!verified) {
        return Response.json({ error: "This reset session has expired. Please verify your identity again." }, { status: 401 });
      }

      const passwordHash = hashPassword(newPassword);
      await db.sql`UPDATE users SET password_hash = ${passwordHash}, must_change_password = FALSE, updated_at = NOW() WHERE id = ${verified.uid}`;  // the person chose this password
      return Response.json({ ok: true });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (err: any) {
    return Response.json({ error: "Server error: " + err.message }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/auth/forgot-password"
};
