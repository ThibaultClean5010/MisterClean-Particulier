import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Window } from "happy-dom";
import { bookingServiceSlugs } from "../booking/service-links.js";

const origin = "https://www.misterclean.com.au";
export const publicPages = ["/", "/booking", "/blog", "/blog/fabric-sofa-care"];

export function auditSite(root = resolve("dist")) {
  const errors = [];
  const pages = [];
  const assert = (condition, message) => { if (!condition) errors.push(message); };
  const targetFile = (url) => {
    let file = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (existsSync(file) && statSync(file).isDirectory()) file = resolve(file, "index.html");
    return file;
  };
  for (const path of [...publicPages, ...bookingServiceSlugs.map(slug => `/booking/${slug}`)]) {
    const url = new URL(path, origin);
    const file = targetFile(url);
    if (!existsSync(file)) { errors.push(`Missing page: ${path}`); continue; }
    const window = new Window({ url: url.href, settings: {
      disableCSSFileLoading: true, disableJavaScriptFileLoading: true, disableJavaScriptEvaluation: true,
    } });
    const doc = window.document;
    doc.documentElement.innerHTML = readFileSync(file, "utf8");
    const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");
    const expected = path.startsWith("/booking/") ? `${origin}/booking` : url.href;
    assert(canonical === expected, `${path}: unexpected canonical ${canonical}`);
    assert(doc.querySelectorAll("h1").length === 1, `${path}: expected one main heading`);
    assert(doc.title.trim().length > 0, `${path}: missing title`);
    assert(doc.querySelector('meta[name="description"]')?.content, `${path}: missing description`);
    assert(doc.querySelector('meta[name="viewport"]'), `${path}: missing viewport`);
    assert(!doc.querySelector('meta[name="robots"]')?.content.includes("noindex"), `${path}: public page is noindex`);
    assert(doc.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href") === "/apple-touch-icon.png", `${path}: missing Apple icon`);
    assert(doc.querySelector('meta[property="og:url"]')?.content === canonical, `${path}: social URL differs from canonical`);
    for (const key of ["og:title", "og:description", "og:image", "og:image:alt"]) {
      assert(doc.querySelector(`meta[property="${key}"]`)?.content, `${path}: missing ${key}`);
    }
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try { JSON.parse(script.textContent); } catch { errors.push(`${path}: invalid structured data`); }
    }
    for (const image of doc.querySelectorAll("img")) assert(image.hasAttribute("alt"), `${path}: image without alt`);
    const references = [...doc.querySelectorAll("[href], [src]")].flatMap(el => [el.getAttribute("href"), el.getAttribute("src")].filter(Boolean));
    for (const image of doc.querySelectorAll("[srcset]")) references.push(...image.getAttribute("srcset").split(",").map(item => item.trim().split(/\s+/)[0]));
    references.push(doc.querySelector('meta[property="og:image"]')?.content);
    for (const reference of references.filter(Boolean)) {
      const target = new URL(reference, url);
      if (target.origin !== origin) continue;
      const targetPath = targetFile(target);
      assert(existsSync(targetPath), `${path}: broken local reference ${reference}`);
      if (target.hash && existsSync(targetPath) && targetPath.endsWith(".html")) {
        assert(readFileSync(targetPath, "utf8").includes(`id="${decodeURIComponent(target.hash.slice(1))}"`), `${path}: missing anchor ${reference}`);
      }
    }
    for (const link of doc.querySelectorAll("a[href]")) {
      const target = new URL(link.getAttribute("href"), url);
      assert(target.origin !== origin || !target.search, `${path}: internal query-string link ${target.href}`);
    }
    pages.push({ path, canonical, headings: doc.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
      emphasisTags: doc.querySelectorAll("strong,b").length, internalQueryLinks: [...doc.querySelectorAll("a[href]")].filter(a => a.href.startsWith(origin) && new URL(a.href).search).length });
    window.happyDOM.abort();
    window.close();
  }
  const icon = resolve(root, "apple-touch-icon.png");
  if (existsSync(icon)) {
    const png = readFileSync(icon);
    assert(png.subarray(1, 4).toString() === "PNG" && png.readUInt32BE(16) === 180 && png.readUInt32BE(20) === 180, "Apple icon must be a 180x180 PNG");
  } else errors.push("Missing Apple icon file");
  const sitemap = readFileSync(resolve(root, "sitemap.xml"), "utf8");
  for (const page of publicPages) assert(sitemap.includes(`<loc>${new URL(page, origin).href}</loc>`), `Sitemap missing ${page}`);
  assert(!sitemap.includes("?service=") && !sitemap.includes("/booking/sofa"), "Sitemap should list canonical pages only");
  for (const path of ["admin/index.html", "booking/cancel/index.html"]) {
    assert(/name="robots" content="noindex/.test(readFileSync(resolve(root, path), "utf8")), `${path}: noindex missing`);
  }
  return { pages, errors };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = auditSite();
  console.log(JSON.stringify(report, null, 2));
  if (report.errors.length) process.exitCode = 1;
}
