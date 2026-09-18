// No third-party SDK or automatic sharing. Only the public canonical URL is used.
const canonical = document.querySelector('link[rel="canonical"]')?.href;
for (const panel of document.querySelectorAll("[data-share]")) {
  const status = panel.querySelector('[role="status"]');
  const copy = panel.querySelector("[data-copy-link]");
  const native = panel.querySelector("[data-native-share]");
  if (!canonical) continue;
  copy.hidden = false;
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(canonical);
      status.textContent = "Link copied.";
    } catch {
      status.textContent = `Copy this link: ${canonical}`;
    }
  });
  if (typeof navigator.share === "function") {
    native.hidden = false;
    native.addEventListener("click", async () => {
      try {
        await navigator.share({ title: document.title, url: canonical });
      } catch (error) {
        if (error.name !== "AbortError") status.textContent = "Use the sharing links or copy the link instead.";
      }
    });
  }
}
