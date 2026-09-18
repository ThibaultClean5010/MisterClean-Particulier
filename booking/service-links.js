// These URLs select a service in the same booking form, not separate SEO pages.
// Keep legacy ?service= links working for bookmarks and existing campaigns.
export const bookingServiceSlugs = [
  "sofa-up-to-3-seats", "sofa-4-seats", "sofa-5-seats-plus",
  "dining-chair", "arm-chair", "rug", "carpet-room", "carpet-lounge",
  "mattress-single", "mattress-queen", "mattress-king",
];

export function requestedServiceSlug(url) {
  const path = url.pathname.replace(/\/$/, "");
  const match = path.match(/^\/booking\/([a-z0-9-]+)$/);
  const slug = match?.[1] ?? (path === "/booking" ? url.searchParams.get("service") : null);
  return bookingServiceSlugs.includes(slug) ? slug : null;
}
