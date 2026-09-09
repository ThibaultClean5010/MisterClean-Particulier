import { requireAdmin } from "../../lib/server/admin-auth.js";
import { errorResponse, json, methodNotAllowed, readJson, RequestError } from "../../lib/server/http.js";
import { getSupabaseAdmin } from "../../lib/server/supabase.js";
import { z } from "zod";

const newCustomerSchema = z.object({
  email:     z.email().toLowerCase().max(254),
  firstName: z.string().trim().min(1).max(80),
  lastName:  z.string().trim().min(1).max(80),
  phone:     z.string().trim().min(6).max(40),
  notes:     z.string().max(2000).optional(),
});

const notesSchema = z.object({
  email: z.email().toLowerCase().max(254),
  notes: z.string().max(2000),
});

export default {
  async fetch(request: Request) {
    if (!["GET", "POST", "PATCH"].includes(request.method)) return methodNotAllowed(["GET", "POST", "PATCH"]);
    try {
      await requireAdmin(request);
      const url = new URL(request.url);
      const supabase = getSupabaseAdmin();

      if (request.method === "GET") {
        const email = url.searchParams.get("email")?.trim().toLowerCase() || null;

        if (email) {
          const [bookingsResult, customerResult] = await Promise.all([
            supabase.rpc("get_customer_bookings", { customer_email_param: email }),
            supabase.from("customers").select("notes").eq("email", email).maybeSingle(),
          ]);
          if (bookingsResult.error) throw bookingsResult.error;
          return json({
            bookings: bookingsResult.data ?? [],
            notes: customerResult.data?.notes ?? null,
          });
        }

        const q = url.searchParams.get("q")?.trim() || null;
        const { data, error } = await supabase.rpc("search_customers", { q: q ?? "" });
        if (error) throw error;
        return json({ customers: data ?? [] });
      }

      if (request.method === "POST") {
        const raw = await readJson(request);
        const parsed = newCustomerSchema.safeParse(raw);
        if (!parsed.success) throw new RequestError("VALIDATION_ERROR", 400);
        const { email, firstName, lastName, phone, notes } = parsed.data;
        const { error } = await supabase.from("customers").insert({
          email,
          first_name: firstName,
          last_name:  lastName,
          phone,
          notes: notes || null,
        });
        if (error?.code === "23505") throw new RequestError("CUSTOMER_ALREADY_EXISTS", 409);
        if (error) throw error;
        return json({ ok: true }, { status: 201 });
      }

      // PATCH: upsert internal notes (preserves first_name / last_name / phone)
      const raw = await readJson(request);
      const parsed = notesSchema.safeParse(raw);
      if (!parsed.success) throw new RequestError("VALIDATION_ERROR", 400);
      const { email, notes } = parsed.data;
      const { error } = await supabase
        .from("customers")
        .upsert({ email, notes, updated_at: new Date().toISOString() }, { onConflict: "email" });
      if (error) throw error;
      return json({ ok: true });
    } catch (error) {
      return errorResponse(error);
    }
  },
};
