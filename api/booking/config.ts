import { errorResponse, json, methodNotAllowed } from "../../lib/server/http.js";
import { getSupabaseAdmin } from "../../lib/server/supabase.js";

export default {
  async fetch(request: Request) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    try {
      const supabase = getSupabaseAdmin();
      const [servicesResult, settingsResult] = await Promise.all([
        supabase
          .from("services")
          .select("id, slug, name, description, duration_minutes, price_cents, price_label")
          .eq("is_active", true)
          .eq("requires_quote", false)
          .order("sort_order"),
        supabase
          .from("business_settings")
          .select("timezone, minimum_booking_notice_minutes, maximum_advance_booking_days, cancellation_notice_minutes")
          .eq("singleton", true)
          .single(),
      ]);

      if (servicesResult.error) throw servicesResult.error;
      if (settingsResult.error) throw settingsResult.error;

      return json({ services: servicesResult.data, settings: settingsResult.data });
    } catch (error) {
      return errorResponse(error);
    }
  },
};
