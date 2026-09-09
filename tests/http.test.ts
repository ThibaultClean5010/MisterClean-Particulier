import { describe, expect, it } from "vitest";
import { readJson } from "../lib/server/http.ts";

describe("JSON request limits", () => {
  it("parses a normal JSON body", async () => {
    const request = new Request("https://example.com/api", {
      method: "POST",
      body: JSON.stringify({ ok: true }),
    });
    await expect(readJson(request)).resolves.toEqual({ ok: true });
  });

  it("rejects a body larger than 20 KB even without content-length", async () => {
    const request = new Request("https://example.com/api", {
      method: "POST",
      body: JSON.stringify({ value: "x".repeat(20_001) }),
    });
    await expect(readJson(request)).rejects.toMatchObject({
      message: "PAYLOAD_TOO_LARGE",
      status: 413,
    });
  });
});
