import { requireAdmin } from "../../../lib/server/admin-auth.js";
import { errorResponse, json, methodNotAllowed } from "../../../lib/server/http.js";

export default {
  async fetch(request: Request) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    try {
      const user = await requireAdmin(request);
      return json({ authenticated: true, email: user.email });
    } catch (error) {
      return errorResponse(error);
    }
  },
};
