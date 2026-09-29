const formatMoney = value => value === null ? "Not recorded" : new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value / 100);
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function localMonth() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Adelaide", year: "numeric", month: "2-digit" }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}`;
}
function comparison(value, previous, money, partial) {
  const formatted = money ? formatMoney(previous) : String(previous);
  if (previous === null || value === null) return `Previous: ${formatted}`;
  if (partial) return `Previous full period: ${formatted}`;
  if (previous === 0) return `Previous: ${formatted} · ${value === 0 ? "No change" : "No percentage baseline"}`;
  const change = (value - previous) / previous * 100;
  return `Previous: ${formatted} · ${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
}

export function createHistoryPanel(root, api, onUnauthorized = () => location.reload()) {
  const find = selector => root.querySelector(selector);
  const form = find("[data-history-form]");
  const mode = find("[data-history-mode]");
  const month = find("[data-history-month]");
  const year = find("[data-history-year]");
  const status = find("[data-history-status]");
  const results = find("[data-history-results]");
  const refresh = find("[data-history-refresh]");
  const search = find("[data-history-search]");
  const statusFilter = find("[data-history-status-filter]");
  const perPage = 20;
  let report;
  let page = 0;
  let requestId = 0;
  let controller;
  month.value = month.max = localMonth();
  year.value = year.max = month.value.slice(0, 4);

  function renderHistory() {
    const query = search.value.trim().toLocaleLowerCase("en-AU");
    const rows = report.bookings.filter(row => (statusFilter.value === "all" || row.status === statusFilter.value) &&
      `${row.customer} ${row.service} ${row.reference}`.toLocaleLowerCase("en-AU").includes(query));
    page = Math.min(page, Math.max(0, Math.ceil(rows.length / perPage) - 1));
    const body = find("[data-history-rows]");
    body.replaceChildren();
    for (const row of rows.slice(page * perPage, (page + 1) * perPage)) {
      const tr = element("tr");
      const date = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Adelaide", dateStyle: "medium", timeStyle: "short" }).format(new Date(row.startsAt));
      const dateCell = element("td", date);
      dateCell.append(element("small", row.reference));
      const amount = element("td", formatMoney(row.amountCents), "history-amount");
      if (row.status === "cancelled") amount.append(element("small", "Not counted"));
      const state = element("td");
      state.append(element("span", row.status === "cancelled" ? "Cancelled" : "Past confirmed", `history-badge ${row.status === "cancelled" ? "is-cancelled" : ""}`));
      tr.append(dateCell, element("td", row.customer), element("td", row.service), element("td", String(row.items)), amount, state);
      body.append(tr);
    }
    if (!rows.length) { const tr = element("tr"); const cell = element("td", "No past appointments match this period and these filters.", "history-empty"); cell.colSpan = 6; tr.append(cell); body.append(tr); }
    find("[data-history-page]").textContent = rows.length ? `${page * perPage + 1}–${Math.min((page + 1) * perPage, rows.length)} of ${rows.length} appointments` : "0 appointments";
    find("[data-history-previous]").disabled = page === 0;
    find("[data-history-next]").disabled = (page + 1) * perPage >= rows.length;
  }

  function render() {
    const { current, previous, period, series } = report;
    find("[data-history-period]").textContent = `${period.label} (${period.currentRange}) compared with ${period.previousLabel} (${period.previousRange}) · Adelaide time`;
    const warnings = [];
    if (period.partial) warnings.push("This period is still in progress: only appointments whose end time has passed are counted. The previous period is complete, so percentage changes are not shown.");
    if (current.unpricedVisits || previous.unpricedVisits) warnings.push(`${current.unpricedVisits} selected-period and ${previous.unpricedVisits} previous-period confirmed bookings have no numeric amount. They count as visits but are excluded from monetary totals and averages.`);
    const warning = find("[data-history-warning]");
    warning.textContent = warnings.join(" ");
    warning.hidden = !warnings.length;
    const metrics = find("[data-history-metrics]");
    metrics.replaceChildren();
    for (const [key, title, money] of [["valueCents", "Past booking value", true], ["visits", "Past confirmed visits", false], ["items", "Service items", false], ["averageCents", "Average priced visit", true]]) {
      const card = element("div", undefined, "history-metric");
      card.append(element("span", title), element("strong", money ? formatMoney(current[key]) : String(current[key])), element("small", comparison(current[key], previous[key], money, period.partial)));
      metrics.append(card);
    }
    find("[data-history-current-label]").textContent = period.label;
    find("[data-history-previous-label]").textContent = period.previousLabel;
    find("[data-history-current-column]").textContent = `${period.label} (AUD)`;
    find("[data-history-previous-column]").textContent = `${period.previousLabel} (AUD)`;
    const chart = find("[data-history-chart]");
    const table = find("[data-history-chart-table]");
    chart.replaceChildren(); table.replaceChildren();
    const max = Math.max(1, ...series.flatMap(bucket => [bucket.currentCents, bucket.previousCents]));
    find("[data-history-scale]").textContent = `Shared scale: ${formatMoney(0)} to ${formatMoney(max === 1 ? 100 : max)}`;
    chart.style.setProperty("--history-buckets", String(series.length));
    for (const bucket of series) {
      const description = `${period.mode === "month" ? "Day " : ""}${bucket.label}: ${period.label} ${formatMoney(bucket.currentCents)}, ${bucket.currentVisits} visits; ${period.previousLabel} ${formatMoney(bucket.previousCents)}, ${bucket.previousVisits} visits`;
      const group = element("div", undefined, "history-bar-group");
      group.tabIndex = 0; group.title = description; group.setAttribute("aria-label", description);
      const pair = element("div", undefined, "history-bar-pair");
      pair.setAttribute("aria-hidden", "true");
      for (const [amount, className] of [[bucket.currentCents, "is-current"], [bucket.previousCents, "is-previous"]]) {
        const bar = element("span", undefined, `history-bar ${className}`);
        bar.style.height = `${amount / (max === 1 ? 100 : max) * 100}%`;
        pair.append(bar);
      }
      group.append(pair, element("span", bucket.label, "history-bar-label")); chart.append(group);
      const tr = element("tr");
      const label = element("th", bucket.label); label.scope = "row";
      tr.append(label, element("td", formatMoney(bucket.currentCents)), element("td", formatMoney(bucket.previousCents)), element("td", String(bucket.currentVisits)), element("td", String(bucket.previousVisits)));
      table.append(tr);
    }
    const serviceBars = find("[data-history-services]"); serviceBars.replaceChildren();
    const serviceMax = Math.max(1, ...report.services.map(service => service.valueCents));
    for (const service of report.services) {
      const row = element("div", undefined, "history-service");
      const caption = element("div", undefined, "history-service-caption");
      caption.append(element("span", `${service.name} · ${service.items} item${service.items === 1 ? "" : "s"}`), element("strong", formatMoney(service.valueCents)));
      const track = element("div", undefined, "history-service-track"); track.setAttribute("aria-hidden", "true");
      const fill = element("span"); fill.style.width = `${service.valueCents / serviceMax * 100}%`; track.append(fill);
      row.append(caption, track);
      if (service.unpricedItems) row.append(element("small", `${service.unpricedItems} items without a recorded amount excluded from the total.`));
      serviceBars.append(row);
    }
    if (!report.services.length) serviceBars.append(element("p", "No past confirmed services in this period.", "history-empty"));
    page = 0; renderHistory(); results.hidden = false;
    status.textContent = `Updated ${new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Adelaide", dateStyle: "medium", timeStyle: "short" }).format(new Date(period.asOf))} · ${current.cancelled} cancelled appointments excluded (${previous.cancelled} in the previous period).`;
  }

  async function load() {
    if (!form.reportValidity()) return;
    const id = ++requestId;
    controller?.abort(); controller = new AbortController();
    results.hidden = true; root.setAttribute("aria-busy", "true");
    status.textContent = "Loading history and figures…"; status.classList.remove("is-error"); refresh.disabled = true;
    try {
      const params = new URLSearchParams({ mode: mode.value, period: mode.value === "year" ? year.value : month.value });
      const data = await api(`/api/admin/history?${params}`, { signal: controller.signal });
      if (id !== requestId) return;
      report = data; render();
    } catch (error) {
      if (id !== requestId || error.name === "AbortError") return;
      report = undefined; find("[data-history-rows]").replaceChildren();
      if (error.status === 401) { onUnauthorized(); return; }
      status.textContent = error.message === "HISTORY_TOO_LARGE" ? "This report is too large. Choose a monthly view. No partial totals are displayed." : "Could not load history. Check the selected period and try Refresh figures. No previous figures are shown for this selection.";
      status.classList.add("is-error");
    } finally {
      if (id === requestId) { root.setAttribute("aria-busy", "false"); refresh.disabled = false; }
    }
  }
  // Hide previous results as soon as a period is edited, not just after submit.
  function invalidate() {
    requestId++; controller?.abort(); report = undefined; results.hidden = true;
    root.setAttribute("aria-busy", "false"); refresh.disabled = false;
    status.classList.remove("is-error"); status.textContent = "Select Compare periods to load these dates.";
  }
  mode.addEventListener("change", () => {
    const yearly = mode.value === "year";
    find("[data-history-month-label]").hidden = yearly; month.disabled = yearly; month.required = !yearly;
    find("[data-history-year-label]").hidden = !yearly; year.disabled = !yearly; year.required = yearly;
    invalidate();
  });
  month.addEventListener("input", invalidate); year.addEventListener("input", invalidate);
  form.addEventListener("submit", event => { event.preventDefault(); void load(); });
  refresh.addEventListener("click", () => void load());
  for (const [control, event] of [[search, "input"], [statusFilter, "change"]]) control.addEventListener(event, () => { page = 0; if (report) renderHistory(); });
  find("[data-history-previous]").addEventListener("click", () => { if (report) { page--; renderHistory(); } });
  find("[data-history-next]").addEventListener("click", () => { if (report) { page++; renderHistory(); } });
  return { load };
}
