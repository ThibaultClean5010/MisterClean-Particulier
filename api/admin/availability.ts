import { z } from "zod";
import { requireAdmin } from "../../lib/server/admin-auth.js";
import { errorResponse, json, methodNotAllowed, readJson, RequestError } from "../../lib/server/http.js";
import { getSupabaseAdmin } from "../../lib/server/supabase.js";
import { parseOrThrow } from "../../lib/server/validation.js";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const date = z.iso.date();
const windowSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  opensAt: time,
  closesAt: time,
}).refine((window) => window.opensAt < window.closesAt);
const weeklySchema = z.object({
  weekly: z.array(windowSchema).max(7),
});
const exceptionSchema = z.object({
  date,
  closed: z.boolean(),
  opensAt: time.optional(),
  closesAt: time.optional(),
}).superRefine((value, context) => {
  if (!value.closed && (!value.opensAt || !value.closesAt)) {
    context.addIssue({ code: "custom", message: "Opening and closing times are required." });
  }
  if (!value.closed && value.opensAt && value.closesAt && value.opensAt >= value.closesAt) {
    context.addIssue({ code: "custom", message: "Opening time must be before closing time." });
  }
});

export default {
  async fetch(request: Request) {
    const allowed = ["GET", "PUT", "POST", "DELETE"];
    if (!allowed.includes(request.method)) return methodNotAllowed(allowed);
    try {
      const user = await requireAdmin(request);
      const supabase = getSupabaseAdmin();

      if (request.method === "GET") {
        const [weekly, exceptions] = await Promise.all([
          supabase.from("opening_hours").select("weekday, opens_at, closes_at").eq("is_active", true).order("weekday"),
          supabase.from("availability_exceptions").select("local_date, is_closed, opens_at, closes_at").gte("local_date", adelaideDate()).order("local_date"),
        ]);
        if (weekly.error) throw weekly.error;
        if (exceptions.error) throw exceptions.error;
        return json({ weekly: weekly.data, exceptions: exceptions.data });
      }

      if (request.method === "PUT") {
        const body = parseOrThrow(weeklySchema, await readJson(request));
        if (new Set(body.weekly.map((window) => window.weekday)).size !== body.weekly.length) {
          throw new RequestError("VALIDATION_ERROR", 400);
        }
        const windows = body.weekly.map((window) => ({
          weekday: window.weekday,
          opens_at: window.opensAt,
          closes_at: window.closesAt,
        }));
        const { error } = await supabase.rpc("replace_opening_hours", { p_windows: windows });
        if (error) throw error;
        await audit(user.email!, "weekly_hours_updated", { weekly: windows });
        return json({ ok: true });
      }

      if (request.method === "POST") {
        const body = parseOrThrow(exceptionSchema, await readJson(request));
        const { error } = await supabase.rpc("set_availability_exception", {
          p_local_date: body.date,
          p_is_closed: body.closed,
          p_opens_at: body.closed ? null : body.opensAt,
          p_closes_at: body.closed ? null : body.closesAt,
        });
        if (error) throw error;
        await audit(user.email!, "exception_saved", body);
        return json({ ok: true });
      }

      const requestedDate = date.safeParse(new URL(request.url).searchParams.get("date"));
      if (!requestedDate.success) throw new RequestError("VALIDATION_ERROR", 400);
      const { error } = await supabase.from("availability_exceptions").delete().eq("local_date", requestedDate.data);
      if (error) throw error;
      await audit(user.email!, "exception_deleted", { date: requestedDate.data });
      return json({ ok: true });
    } catch (error) {
      return errorResponse(error);
    }
  },
};

async function audit(email: string, action: string, details: unknown) {
  const { error } = await getSupabaseAdmin().from("admin_availability_audit").insert({
    admin_email: email.toLowerCase(), action, details,
  });
  if (error) throw error;
}

function adelaideDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Adelaide", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
