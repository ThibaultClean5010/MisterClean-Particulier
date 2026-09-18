import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it, beforeAll } from "vitest";
import { auditSite } from "../scripts/audit-seo.mjs";
import { bookingServiceSlugs, requestedServiceSlug } from "../booking/service-links.js";

describe("SEO regression checks", () => {
  beforeAll(() => execFileSync(process.execPath, ["scripts/build-static.mjs"]));
  it("builds crawlable pages, working local links and canonical booking entry points", () => {
    const report = auditSite();
    expect(report.errors).toEqual([]);
    expect(report.pages).toHaveLength(15);
  });
  it.each(bookingServiceSlugs)("preserves service selection for clean and legacy links: %s", slug => {
    expect(requestedServiceSlug(new URL(`https://example.invalid/booking/${slug}`))).toBe(slug);
    expect(requestedServiceSlug(new URL(`https://example.invalid/booking/${slug}/`))).toBe(slug);
    expect(requestedServiceSlug(new URL(`https://example.invalid/booking?service=${slug}`))).toBe(slug);
  });
  it.each(["/booking", "/booking/cancel", "/booking/nonexistent", "/booking?service=invalid", "/admin?service=rug"])("does not preselect an unknown or unrelated route %s", path => {
    expect(requestedServiceSlug(new URL(path, "https://example.invalid"))).toBeNull();
  });
  it("uses caption styling instead of repeated strong tags in the carousel", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html.match(/class="caption-title"/g)).toHaveLength(11);
    expect(html).not.toMatch(/<figcaption>[\s\S]*?<strong>[^<]*sofa cleaning<\/strong>/);
  });
  it("keeps article structured data consistent with sharing metadata", () => {
    const html = readFileSync("blog/fabric-sofa-care/index.html", "utf8");
    const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
    expect(schemas.find(item => item["@type"] === "BlogPosting").image).toContain("https://www.misterclean.com.au/Images/light-sofa-after-1200.webp");
    expect(schemas.find(item => item["@type"] === "BreadcrumbList").itemListElement).toHaveLength(3);
  });
});
