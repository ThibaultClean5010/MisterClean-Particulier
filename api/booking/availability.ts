import { errorResponse, json, methodNotAllowed, RequestError } from "../../lib/server/http.js";
import { getSupabaseAdmin } from "../../lib/server/supabase.js";
import { availabilityQuerySchema, parseOrThrow } from "../../lib/server/validation.js";

export default {
  async fetch(request: Request) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    try {
      const url = new URL(request.url);
      const serviceIds = url.searchParams.getAll("serviceId");
      const quantities = url.searchParams.getAll("quantity");
      if (quantities.length && quantities.length !== serviceIds.length) throw new RequestError("VALIDATION_ERROR", 400);
      const input = parseOrThrow(availabilityQuerySchema, {
        services: serviceIds.map((serviceId, index) => ({ serviceId, quantity: quantities[index] ?? 1 })),
        date: url.searchParams.get("date"),
      });
      const { data, error } = await getSupabaseAdmin().rpc("get_booking_availability_quantities", {
        p_services: input.services.map(({ serviceId, quantity }) => ({ service_id: serviceId, quantity })),
        p_local_date: input.date,
      });
      if (error) throw error;
      return json({ slots: data ?? [] });
    } catch (error) {
      return errorResponse(error);
    }
  },
};
