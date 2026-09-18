import { errorResponse, json, methodNotAllowed, RequestError } from "../../lib/server/http.js";
import { getSupabaseAdmin } from "../../lib/server/supabase.js";
import { availabilityQuerySchema, parseOrThrow, toRpcServices } from "../../lib/server/validation.js";

export default {
  async fetch(request: Request) {
    if (request.method !== "GET") return methodNotAllowed(["GET"]);
    try {
      const url = new URL(request.url);
      const serviceIds = url.searchParams.getAll("serviceId");
      const quantities = url.searchParams.getAll("quantity");
      const addonParams = url.searchParams.getAll("addons");
      if (quantities.length && quantities.length !== serviceIds.length) throw new RequestError("VALIDATION_ERROR", 400);
      if (addonParams.length && addonParams.length !== serviceIds.length) throw new RequestError("VALIDATION_ERROR", 400);
      let addons: unknown[];
      try {
        addons = addonParams.map((value) => JSON.parse(value));
      } catch {
        throw new RequestError("VALIDATION_ERROR", 400);
      }
      const input = parseOrThrow(availabilityQuerySchema, {
        services: serviceIds.map((serviceId, index) => ({ serviceId, quantity: quantities[index] ?? 1, addons: addonParams.length ? addons[index] : [] })),
        date: url.searchParams.get("date"),
      });
      const { data, error } = await getSupabaseAdmin().rpc("get_booking_availability_quantities", {
        p_services: toRpcServices(input.services),
        p_local_date: input.date,
      });
      if (error?.code === "22023" || error?.code === "22P02") throw new RequestError("VALIDATION_ERROR", 400);
      if (error) throw error;
      return json({ slots: data ?? [] });
    } catch (error) {
      return errorResponse(error);
    }
  },
};
