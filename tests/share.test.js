// @vitest-environment happy-dom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  document.head.innerHTML = '<title>Sofa care</title><link rel="canonical" href="https://www.misterclean.com.au/blog/fabric-sofa-care">';
  document.body.innerHTML = '<div data-share><button data-copy-link hidden>Copy</button><button data-native-share hidden>Share</button><p role="status"></p></div>';
});
afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });
describe("Opt-in sharing", () => {
  it("copies the canonical link, never query strings or a booking token", async () => {
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    await import("../share.js");
    document.querySelector("[data-copy-link]").click();
    await vi.waitFor(() => expect(write).toHaveBeenCalledWith("https://www.misterclean.com.au/blog/fabric-sofa-care"));
    expect(document.querySelector('[role="status"]').textContent).toBe("Link copied.");
  });
  it("offers a usable link when clipboard permission is denied", async () => {
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("Denied"));
    await import("../share.js");
    document.querySelector("[data-copy-link]").click();
    await vi.waitFor(() => expect(document.querySelector('[role="status"]').textContent).toContain("Copy this link: https://www.misterclean.com.au/blog/fabric-sofa-care"));
  });
});
