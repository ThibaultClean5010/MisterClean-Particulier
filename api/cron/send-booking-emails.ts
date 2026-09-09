import { dispatchPendingEmails } from "../../lib/server/email-outbox.js";
import { getEnv } from "../../lib/server/env.js";
import { errorResponse, json } from "../../lib/server/http.js";

export default {
  async fetch(request: Request) {
    try {
      if (request.headers.get("authorization") !== `Bearer ${getEnv().CRON_SECRET}`) {
        return json({ error: "UNAUTHORIZED" }, { status: 401 });
      }
      const results = await dispatchPendingEmails(undefined, 25);
      return json({ processed: results.length, results });
    } catch (error) {
      return errorResponse(error);
    }
  },
};
