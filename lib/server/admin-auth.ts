import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./env.js";
import { RequestError } from "./http.js";

const COOKIE_NAME = "mc_admin_session";

function authClient() {
  const env = getEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function isAdminEmail(email: string) {
  const normalizedEmail = email.toLowerCase();
  const { data, error } = await authClient()
    .from("admin_users")
    .select("email")
    .eq("email", normalizedEmail)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export function adminSessionCookie(accessToken: string, maxAge: number) {
  return `${COOKIE_NAME}=${encodeURIComponent(accessToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearAdminSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function requireAdmin(request: Request) {
  const token = readCookie(request, COOKIE_NAME);
  if (!token) throw new RequestError("UNAUTHORIZED", 401);
  const { data, error } = await authClient().auth.getUser(token);
  if (error || !data.user?.email || !(await isAdminEmail(data.user.email))) {
    throw new RequestError("UNAUTHORIZED", 401);
  }
  return data.user;
}

export function getAdminAuthClient() {
  return authClient();
}
