import { clearAdminSessionCookie } from "../../../lib/server/admin-auth.js";
import { json, methodNotAllowed } from "../../../lib/server/http.js";

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    return json({ ok: true }, { headers: { "set-cookie": clearAdminSessionCookie() } });
  },
};
