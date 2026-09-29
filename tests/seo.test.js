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
  it("keeps sofa prices and included Steam consistent in public cards, FAQs and structured data", () => {
    const html = readFileSync("index.html", "utf8");
    const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]));
    const entities = schemas.flatMap(schema => schema["@graph"] ?? [schema]);
    const offers = entities.find(item => item.hasOfferCatalog).hasOfferCatalog.itemListElement;
    for (const [slug, price, index] of [["sofa-up-to-3-seats", "140", 0], ["sofa-4-seats", "175", 1], ["sofa-5-seats-plus", "220", 2]]) {
      const card = html.split(`class="price-card" href="/booking/${slug}">`)[1].split("</a>")[0];
      expect(card).toContain(`<strong>$${price}</strong>`);
      expect(card).toContain("Steam cleaning included");
      expect(offers[index].price).toBe(price);
      expect(offers[index].itemOffered.description).toContain("Steam cleaning included");
    }
    const answer = entities.find(item => item["@type"] === "FAQPage").mainEntity.find(item => item.acceptedAnswer.text.includes("$175")).acceptedAnswer.text;
    expect(html).toContain(`<p>${answer}</p>`);
    expect(html).not.toContain("Optional Steam cleaning adds");
    expect(html).not.toContain("75 minutes");
    expect(offers.find(item => item.itemOffered.name.includes("– king")).price).toBe("170");
  });
});
