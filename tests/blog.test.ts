import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { requestedServiceSlug } from "../booking/service-links.js";

const root = process.cwd();
const pages = ["index.html", "blog/index.html", "blog/fabric-sofa-care/index.html"];
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("Static blog", () => {
  it("links each public header to MisterClean B2B without replacing the booking link", () => {
    for (const page of pages) {
      const header = read(page).match(/<header class="site-header">([\s\S]*?)<\/header>/)?.[1] ?? "";
      expect(header).toContain('class="header-b2b" href="https://www.mistercleanb2b.com/"');
      expect(header).toMatch(/class="header-b2b"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
      expect(header).toContain('class="header-cta" href="/booking"');
    }
  });

  it("keeps all local blog links, section anchors and assets resolvable", () => {
    for (const page of pages) {
      const html = read(page);
      const links = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(match => match[1]);
      for (const match of html.matchAll(/srcset="([^"]+)"/g)) {
        links.push(...match[1].split(",").map(source => source.trim().split(/\s+/)[0]));
      }
      for (const link of links) {
        if (/^(https?:|mailto:|tel:)/.test(link)) continue;
        const [pathAndQuery, anchor] = link.split("#");
        const path = decodeURIComponent(pathAndQuery.split("?")[0]);
        let target = path ? resolve(root, path.startsWith("/") ? path.slice(1) : `${dirname(page)}/${path}`) : resolve(root, page);
        if (requestedServiceSlug(new URL(path || "/", "https://www.misterclean.com.au"))) target = resolve(root, "booking/index.html");
        if (!/\.[a-z0-9]+$/i.test(target)) target = resolve(target, "index.html");
        expect(existsSync(target), `${page}: ${link}`).toBe(true);
        if (anchor) expect(readFileSync(target, "utf8"), `${page}: ${link}`).toContain(`id="${anchor}"`);
      }
    }
  });

  it("gives the blog and article readable content, canonical URLs and valid structured data", () => {
    const sitemap = read("sitemap.xml");
    for (const page of pages.slice(1)) {
      const html = read(page);
      expect(html).toContain('lang="en-AU"');
      expect([...html.matchAll(/<h1[ >]/g)]).toHaveLength(1);
      const canonical = html.match(/rel="canonical" href="([^"]+)"/)?.[1];
      expect(canonical).toBeTruthy();
      expect(sitemap).toContain(`<loc>${canonical}</loc>`);
      const schema = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
      expect(schema).toBeTruthy();
      expect(JSON.parse(schema!).inLanguage).toBe("en-AU");
      expect(html).toContain('href="/blog"');
    }
    expect(read("blog/fabric-sofa-care/index.html")).toContain('id="care-label"');
    expect(read("blog/fabric-sofa-care/index.html")).toContain('id="professional-help"');
  });

  it("preserves the restored home carousel and before-and-after gallery", () => {
    const html = read("index.html");
    expect([...html.matchAll(/<figure class="carousel-slide[" ]/g)]).toHaveLength(11);
    expect([...html.matchAll(/class="result-card"/g)]).toHaveLength(3);
    expect(html).toContain('class="carousel-slide carousel-slide--intro"');
    expect(html).not.toContain("carpeted-room");
    expect(html).toContain('href="/blog"');
    expect(read("scripts/build-static.mjs")).toContain('resolve(root, "blog")');
  });
});
