import { adminSessionCookie, clearAdminSessionCookie, getAdminAuthClient, isAdminEmail } from "../../../lib/server/admin-auth.js";

export default {
  async fetch(request: Request) {
    if (request.method !== "GET") return new Response(null, { status: 405, headers: { allow: "GET" } });
    const url = new URL(request.url);
    const tokenHash = url.searchParams.get("token_hash");
    if (!tokenHash) return redirectInvalid();

    const { data, error } = await getAdminAuthClient().auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
    if (error || !data.session || !data.user?.email || !(await isAdminEmail(data.user.email))) return redirectInvalid();

    return new Response(null, {
      status: 303,
      headers: {
        location: "/admin",
        "set-cookie": adminSessionCookie(data.session.access_token, data.session.expires_in),
        "cache-control": "no-store",
      },
    });
  },
};

function redirectInvalid() {
  return new Response(null, {
    status: 303,
    headers: { location: "/admin?auth=invalid", "set-cookie": clearAdminSessionCookie() },
  });
}
