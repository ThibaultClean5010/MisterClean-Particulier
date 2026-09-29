// Read-only reporting from booking snapshots, never from today's service prices.
export const HISTORY_TIMEZONE = "Australia/Adelaide";
export type HistoryMode = "month" | "year";
export type HistoryBooking = {
  id: string; reference: string; service_name: string; starts_at: string; ends_at: string;
  status: string; price_cents: number | null; customer_first_name: string; customer_last_name: string;
  booking_services: { service_id: string; service_name: string; quantity: number; price_cents: number | null }[];
};
const localFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: HISTORY_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
});
export function historyDateKey(value: Date | string) {
  const parts = Object.fromEntries(localFormatter.formatToParts(new Date(value)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function key(year: number, month: number, day = 1) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function shiftMonth(date: string, offset: number) {
  const [year, month] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  return key(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1);
}
function dayBefore(date: string) {
  return new Date(Date.parse(`${date}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
}
// Adelaide changes between UTC+09:30 and UTC+10:30. Do not hardcode an offset.
export function adelaideMidnight(date: string) {
  const target = Date.parse(`${date}T00:00:00Z`);
  let instant = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: HISTORY_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, Number(part.value)]));
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    instant += target - represented;
  }
  return new Date(instant).toISOString();
}
export function historyPeriod(mode: string, period: string, now = new Date()) {
  const today = historyDateKey(now);
  if (mode !== "month" && mode !== "year") throw new RangeError("INVALID_HISTORY_PERIOD");
  if (!(mode === "month" ? /^\d{4}-(0[1-9]|1[0-2])$/ : /^\d{4}$/).test(period)) throw new RangeError("INVALID_HISTORY_PERIOD");
  const year = Number(period.slice(0, 4));
  if (year < 2000 || year > Number(today.slice(0, 4)) || period > today.slice(0, mode === "month" ? 7 : 4)) throw new RangeError("INVALID_HISTORY_PERIOD");
  const start = mode === "month" ? `${period}-01` : `${period}-01-01`;
  const end = shiftMonth(start, mode === "month" ? 1 : 12);
  const previousStart = shiftMonth(start, mode === "month" ? -1 : -12);
  const label = (date: string) => new Intl.DateTimeFormat("en-AU", {
    timeZone: "UTC", year: "numeric", ...(mode === "month" ? { month: "long" as const } : {}),
  }).format(new Date(`${date}T12:00:00Z`));
  return {
    mode: mode as HistoryMode, period, start, end, previousStart, previousEnd: start,
    queryStart: adelaideMidnight(previousStart), queryEnd: adelaideMidnight(end),
    label: label(start), previousLabel: label(previousStart),
    currentRange: `${start} – ${dayBefore(end)}`, previousRange: `${previousStart} – ${dayBefore(start)}`,
    partial: end > today, asOf: now.toISOString(), timezone: HISTORY_TIMEZONE,
  };
}
function numericAmount(value: number | null) { return Number.isSafeInteger(value) && value !== null && value >= 0; }
function emptySummary() {
  return { valueCents: 0, visits: 0, items: 0, cancelled: 0, pricedVisits: 0, unpricedVisits: 0, averageCents: null as number | null };
}
export function buildHistoryReport(rows: HistoryBooking[], period: ReturnType<typeof historyPeriod>) {
  const current = emptySummary();
  const previous = emptySummary();
  const seriesLength = period.mode === "year" ? 12 : Math.max(Number(dayBefore(period.end).slice(8)), Number(dayBefore(period.start).slice(8)));
  const series = Array.from({ length: seriesLength }, (_, i) => ({
    label: period.mode === "year" ? new Intl.DateTimeFormat("en-AU", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2020, i, 1))) : String(i + 1),
    currentCents: 0, previousCents: 0, currentVisits: 0, previousVisits: 0,
  }));
  const services = new Map<string, { name: string; items: number; valueCents: number; unpricedItems: number }>();
  const bookings = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id) || !["confirmed", "cancelled"].includes(row.status)) continue;
    if (!Number.isFinite(Date.parse(row.ends_at)) || Date.parse(row.ends_at) > Date.parse(period.asOf)) continue;
    const date = historyDateKey(row.starts_at);
    const isCurrent = date >= period.start && date < period.end;
    if (!isCurrent && !(date >= period.previousStart && date < period.previousEnd)) continue;
    seen.add(row.id);
    const summary = isCurrent ? current : previous;
    const lines = row.booking_services ?? [];
    const quantity = lines.length ? lines.reduce((total, line) => total + line.quantity, 0) : 1;
    const priced = numericAmount(row.price_cents);
    if (isCurrent) bookings.push({
      id: row.id, reference: row.reference, date, startsAt: row.starts_at,
      customer: `${row.customer_first_name} ${row.customer_last_name}`.trim(),
      service: row.service_name, items: quantity, amountCents: priced ? row.price_cents : null,
      status: row.status === "confirmed" ? "past-confirmed" : "cancelled",
    });
    if (row.status === "cancelled") { summary.cancelled++; continue; }
    summary.visits++;
    summary.items += quantity;
    if (priced) { summary.valueCents += row.price_cents!; summary.pricedVisits++; }
    else summary.unpricedVisits++;
    const bucket = series[Number(date.slice(period.mode === "year" ? 5 : 8, period.mode === "year" ? 7 : 10)) - 1];
    if (isCurrent) { bucket.currentCents += priced ? row.price_cents! : 0; bucket.currentVisits++; }
    else { bucket.previousCents += priced ? row.price_cents! : 0; bucket.previousVisits++; }
    if (!isCurrent) continue;
    // A booking total already includes quantities and extras. Never add extras again.
    // Only allocate service totals when their snapshots reconcile with the booking.
    const reconciled = priced && lines.length && lines.every(line => numericAmount(line.price_cents)) &&
      lines.reduce((sum, line) => sum + line.price_cents! * line.quantity, 0) === row.price_cents;
    const breakdown = reconciled ? lines.map(line => ({
      id: line.service_id, name: line.service_name, items: line.quantity, amount: line.price_cents! * line.quantity,
    })) : [{ id: "unallocated", name: "Other / unallocated booking totals", items: quantity, amount: priced ? row.price_cents! : null }];
    for (const line of breakdown) {
      const group = services.get(line.id) ?? { name: line.name, items: 0, valueCents: 0, unpricedItems: 0 };
      group.items += line.items;
      if (line.amount === null) group.unpricedItems += line.items;
      else group.valueCents += line.amount;
      services.set(line.id, group);
    }
  }
  for (const summary of [current, previous]) summary.averageCents = summary.pricedVisits ? Math.round(summary.valueCents / summary.pricedVisits) : null;
  bookings.sort((a, b) => b.startsAt.localeCompare(a.startsAt) || a.id.localeCompare(b.id));
  return {
    period, current, previous, series,
    services: [...services.values()].sort((a, b) => b.valueCents - a.valueCents || a.name.localeCompare(b.name)),
    bookings,
    basis: "Past confirmed bookings at their saved prices, including selected extras. Cancelled and future appointments are excluded from totals. Completion and payment are not recorded or verified.",
  };
}
