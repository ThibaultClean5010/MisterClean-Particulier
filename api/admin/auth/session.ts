import { clearAdminSessionCookie, requireAdmin } from "../../../lib/server/admin-auth.js";
import { errorResponse, json, methodNotAllowed } from "../../../lib/server/http.js";

export default {
  async fetch(request: Request) {
    if (!["GET", "POST"].includes(request.method)) return methodNotAllowed(["GET", "POST"]);

    // POST → logout (also reached via /api/admin/auth/logout rewrite)
    if (request.method === "POST") {
      return json({ ok: true }, { headers: { "set-cookie": clearAdminSessionCookie() } });
    }

    // GET → verify current session
    try {
      const user = await requireAdmin(request);
      return json({ authenticated: true, email: user.email });
    } catch (error) {
      return errorResponse(error);
    }
  },
};
