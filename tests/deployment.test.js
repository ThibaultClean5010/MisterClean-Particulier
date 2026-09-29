import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("deployment layout", () => {
  it("shares history with the bookings function and stays within the 12-function budget", () => {
    const entries = readdirSync("api", { recursive: true }).filter(path => path.endsWith(".ts"));
    expect(entries.length).toBeLessThanOrEqual(12);
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.rewrites).toContainEqual({ source: "/api/admin/history", destination: "/api/admin/bookings?report=history" });
    expect(config.rewrites).toContainEqual({ source: "/api/admin/auth/logout", destination: "/api/admin/auth/session" });
  });
});
