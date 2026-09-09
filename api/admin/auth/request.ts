import { Resend } from "resend";
import { z } from "zod";
import { getAdminAuthClient, isAdminEmail } from "../../../lib/server/admin-auth.js";
import { getEnv } from "../../../lib/server/env.js";
import { errorResponse, json, methodNotAllowed, readJson } from "../../../lib/server/http.js";
import { getSupabaseAdmin } from "../../../lib/server/supabase.js";
import { parseOrThrow } from "../../../lib/server/validation.js";

const inputSchema = z.object({ email: z.email().max(254) });

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    try {
      const body = parseOrThrow(inputSchema, await readJson(request));
      const email = body.email.toLowerCase();
      if (!(await isAdminEmail(email))) return json({ ok: true });

      const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
      const { count } = await getSupabaseAdmin()
        .from("admin_availability_audit")
        .select("id", { count: "exact", head: true })
        .eq("admin_email", email)
        .eq("action", "login_link_requested")
        .gte("created_at", cutoff);
      if (count) return json({ ok: true });

      const { data, error } = await getAdminAuthClient().auth.admin.generateLink({ type: "magiclink", email });
      if (error || !data.properties.hashed_token) throw error ?? new Error("Magic link generation failed");

      const origin = new URL(request.url).origin;
      const loginUrl = `${origin}/api/admin/auth/verify?token_hash=${encodeURIComponent(data.properties.hashed_token)}`;
      const env = getEnv();
      const resend = new Resend(env.RESEND_API_KEY);
      const { error: sendError } = await resend.emails.send({
        from: env.RESEND_FROM,
        to: email,
        subject: "Your MisterClean admin login link",
        html: `<p>Use this secure one-time link to access the MisterClean availability settings:</p><p><a href="${loginUrl}">Open admin area</a></p><p>This link expires shortly. If you did not request it, ignore this email.</p>`,
      });
      if (sendError) throw sendError;
      await getSupabaseAdmin().from("admin_availability_audit").insert({ admin_email: email, action: "login_link_requested" });
      return json({ ok: true });
    } catch (error) {
      return errorResponse(error);
    }
  },
};
