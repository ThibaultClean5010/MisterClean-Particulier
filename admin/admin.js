const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const login = document.querySelector("[data-login]");
const dashboard = document.querySelector("[data-dashboard]");
const weeklyContainer = document.querySelector("[data-weekly-hours]");
const exceptionList = document.querySelector("[data-exception-list]");
const bookingList = document.querySelector("[data-booking-list]");
const bookingsStatus = document.querySelector("[data-bookings-status]");
const appointmentSummary = document.querySelector("[data-appointment-summary]");
const calendarGrid = document.querySelector("[data-calendar-grid]");
const calendarLabel = document.querySelector("[data-calendar-label]");
const adminGreeting = document.querySelector("[data-admin-greeting]");
const manualBookingDialog = document.querySelector("[data-manual-booking-dialog]");
const manualBookingForm = document.querySelector("[data-manual-booking-form]");
const manualServiceOptions = document.querySelector("[data-manual-service-options]");
const manualSlotOptions = document.querySelector("[data-manual-slot-options]");
const manualSelection = document.querySelector("[data-manual-selection]");
const manualBookingMessage = document.querySelector("[data-manual-booking-message]");
const createManualBookingButton = document.querySelector("[data-create-manual-booking]");
let bookingsLoading = false;
let latestBookings = [];
let calendarMonth = adelaideDateKey().slice(0, 7);
let manualConfig;
let manualServices = [];
let manualSlot;
let manualIdempotencyKey = crypto.randomUUID();
let manualAvailabilityRequest = 0;

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: options.body ? { "content-type": "application/json", ...options.headers } : options.headers,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: response.status });
  return data;
}

function setMessage(selector, message, error = false) {
  const element = document.querySelector(selector);
  element.textContent = message;
  element.classList.toggle("is-error", error);
}

function timeValue(value, fallback) {
  return value ? value.slice(0, 5) : fallback;
}

function adelaideDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Adelaide", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}

function appointmentTime(value) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Adelaide", hour: "numeric", minute: "2-digit",
  }).format(new Date(value));
}

function appointmentDate(value) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Adelaide", weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date(value));
}

function updateGreeting() {
  const hour = Number(new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Adelaide", hour: "2-digit", hourCycle: "h23",
  }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  adminGreeting.textContent = `${greeting}, MisterClean.`;
}

function detailRow(label, content) {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  const detail = document.createElement("dd");
  term.textContent = label;
  if (content instanceof Node) detail.append(content);
  else detail.textContent = content;
  row.append(term, detail);
  return row;
}

async function cancelBooking(booking, button) {
  const confirmed = confirm(`Cancel booking ${booking.reference}? The customer and cleaner will both receive a cancellation email.`);
  if (!confirmed) return;

  button.disabled = true;
  button.textContent = "Cancelling…";
  try {
    await api("/api/admin/bookings/cancel", {
      method: "POST",
      body: JSON.stringify({ bookingId: booking.id }),
    });
    await loadBookings({ silent: true });
    bookingsStatus.textContent = `Booking ${booking.reference} cancelled. Cancellation emails have been queued for the customer and cleaner.`;
    bookingsStatus.classList.remove("is-error");
  } catch (error) {
    if (error.status === 401) return location.reload();
    bookingsStatus.textContent = "This booking could not be cancelled. Please try again.";
    bookingsStatus.classList.add("is-error");
    button.disabled = false;
    button.textContent = "Cancel booking";
  }
}

function renderAppointmentCalendar(bookings) {
  const [year, month] = calendarMonth.split("-").map(Number);
  const monthDate = new Date(Date.UTC(year, month - 1, 1, 12));
  const firstWeekday = monthDate.getUTCDay();
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cellCount = Math.ceil((firstWeekday + dayCount) / 7) * 7;
  const today = adelaideDateKey();
  const bookingsByDate = new Map();

  for (const booking of bookings) {
    const key = adelaideDateKey(booking.starts_at);
    if (!bookingsByDate.has(key)) bookingsByDate.set(key, []);
    bookingsByDate.get(key).push(booking);
  }

  calendarLabel.textContent = new Intl.DateTimeFormat("en-AU", {
    timeZone: "UTC", month: "long", year: "numeric",
  }).format(monthDate);
  calendarGrid.replaceChildren();

  for (const weekday of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
    const heading = document.createElement("div");
    heading.className = "calendar-weekday";
    heading.setAttribute("role", "columnheader");
    heading.textContent = weekday;
    calendarGrid.append(heading);
  }

  for (let index = 0; index < cellCount; index += 1) {
    const day = index - firstWeekday + 1;
    const cell = document.createElement("div");
    cell.className = "calendar-day";
    cell.setAttribute("role", "gridcell");
    if (day < 1 || day > dayCount) {
      cell.classList.add("is-outside");
      calendarGrid.append(cell);
      continue;
    }

    const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (key === today) cell.classList.add("is-today");
    const number = document.createElement("span");
    number.className = "calendar-day-number";
    number.textContent = String(day);
    cell.append(number);

    for (const booking of bookingsByDate.get(key) ?? []) {
      const event = document.createElement("button");
      event.className = "calendar-event";
      event.type = "button";
      event.textContent = `${appointmentTime(booking.starts_at)} ${booking.customer_first_name}`;
      event.title = `${booking.service_name} · ${booking.reference}`;
      event.setAttribute("aria-label", `${appointmentTime(booking.starts_at)}, ${booking.customer_first_name} ${booking.customer_last_name}, ${booking.service_name}`);
      event.addEventListener("click", () => {
        const card = document.getElementById(`booking-${booking.id}`);
        if (!card) return;
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.add("is-highlighted");
        setTimeout(() => card.classList.remove("is-highlighted"), 1800);
      });
      cell.append(event);
    }
    calendarGrid.append(cell);
  }
}

function changeCalendarMonth(offset) {
  const [year, month] = calendarMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  calendarMonth = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  renderAppointmentCalendar(latestBookings);
}

function renderAppointments(bookings) {
  latestBookings = bookings;
  renderAppointmentCalendar(bookings);
  bookingList.replaceChildren();
  const today = adelaideDateKey();
  const todayCount = bookings.filter((booking) => adelaideDateKey(booking.starts_at) === today).length;
  appointmentSummary.replaceChildren();
  for (const [value, label] of [[todayCount, "Today"], [bookings.length, "Upcoming"]]) {
    const item = document.createElement("div");
    const number = document.createElement("strong");
    const caption = document.createElement("span");
    number.textContent = String(value);
    caption.textContent = label;
    item.append(number, caption);
    appointmentSummary.append(item);
  }

  if (!bookings.length) {
    const empty = document.createElement("p");
    empty.className = "appointment-empty";
    empty.textContent = "No confirmed appointments are currently scheduled.";
    bookingList.append(empty);
    return;
  }

  const groups = new Map();
  for (const booking of bookings) {
    const key = adelaideDateKey(booking.starts_at);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(booking);
  }

  for (const dailyBookings of groups.values()) {
    const group = document.createElement("section");
    group.className = "appointment-day";
    const heading = document.createElement("h3");
    heading.textContent = appointmentDate(dailyBookings[0].starts_at);
    group.append(heading);

    for (const booking of dailyBookings) {
      const card = document.createElement("article");
      card.className = "appointment-item";
      card.id = `booking-${booking.id}`;
      const header = document.createElement("div");
      header.className = "appointment-item-header";
      const time = document.createElement("strong");
      time.className = "appointment-time";
      time.textContent = `${appointmentTime(booking.starts_at)}–${appointmentTime(booking.ends_at)}`;
      const reference = document.createElement("span");
      reference.className = "appointment-reference";
      reference.textContent = booking.reference;
      header.append(time, reference);

      const service = document.createElement("h4");
      service.textContent = booking.service_name;
      const details = document.createElement("dl");
      details.className = "appointment-details";
      details.append(detailRow("Duration", `${booking.duration_minutes} minutes`));
      details.append(detailRow("Customer", `${booking.customer_first_name} ${booking.customer_last_name}`));

      const phone = document.createElement("a");
      phone.href = `tel:${booking.customer_phone}`;
      phone.textContent = booking.customer_phone;
      details.append(detailRow("Phone", phone));

      const email = document.createElement("a");
      email.href = `mailto:${booking.customer_email}`;
      email.textContent = booking.customer_email;
      details.append(detailRow("Email", email));

      const address = [booking.address_line1, booking.address_line2, booking.suburb, `${booking.state} ${booking.postcode}`].filter(Boolean).join(", ");
      const map = document.createElement("a");
      map.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
      map.target = "_blank";
      map.rel = "noreferrer";
      map.textContent = address;
      details.append(detailRow("Address", map));
      if (booking.notes) details.append(detailRow("Notes", booking.notes));

      const actions = document.createElement("div");
      actions.className = "appointment-actions";
      const cancel = document.createElement("button");
      cancel.className = "button danger";
      cancel.type = "button";
      cancel.textContent = "Cancel booking";
      cancel.addEventListener("click", () => cancelBooking(booking, cancel));
      actions.append(cancel);

      card.append(header, service, details, actions);
      group.append(card);
    }
    bookingList.append(group);
  }
}

async function loadBookings({ silent = false } = {}) {
  if (bookingsLoading) return;
  bookingsLoading = true;
  if (!silent) bookingsStatus.textContent = "Loading appointments…";
  try {
    const data = await api("/api/admin/bookings");
    renderAppointments(data.bookings);
    bookingsStatus.textContent = `Updated ${appointmentTime(data.refreshedAt)} · refreshes automatically every 2 minutes`;
    bookingsStatus.classList.remove("is-error");
  } catch (error) {
    if (error.status === 401) return location.reload();
    bookingsStatus.textContent = "Could not refresh appointments. The previous list is still shown.";
    bookingsStatus.classList.add("is-error");
  } finally {
    bookingsLoading = false;
  }
}

function renderWeekly(rows) {
  weeklyContainer.replaceChildren();
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const existing = rows.find((row) => row.weekday === weekday);
    const row = document.createElement("div");
    row.className = "weekly-row";
    row.dataset.weekday = String(weekday);
    row.innerHTML = `<input type="checkbox" aria-label="Open on ${days[weekday]}"><strong></strong><input type="time" data-opens aria-label="${days[weekday]} opening time"><span>to</span><input type="time" data-closes aria-label="${days[weekday]} closing time">`;
    row.querySelector("strong").textContent = days[weekday];
    const checkbox = row.querySelector('input[type="checkbox"]');
    checkbox.checked = Boolean(existing);
    row.querySelector("[data-opens]").value = timeValue(existing?.opens_at, "07:00");
    row.querySelector("[data-closes]").value = timeValue(existing?.closes_at, "12:00");
    const update = () => row.querySelectorAll('input[type="time"]').forEach((input) => { input.disabled = !checkbox.checked; });
    checkbox.addEventListener("change", update);
    update();
    weeklyContainer.append(row);
  }
}

function renderExceptions(rows) {
  exceptionList.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.textContent = "No upcoming exceptions.";
    exceptionList.append(empty);
    return;
  }
  for (const exception of rows) {
    const item = document.createElement("div");
    item.className = "exception-item";
    const text = document.createElement("p");
    const date = new Intl.DateTimeFormat("en-AU", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${exception.local_date}T12:00:00Z`));
    text.textContent = exception.is_closed ? `${date} — Closed` : `${date} — ${timeValue(exception.opens_at, "")} to ${timeValue(exception.closes_at, "")}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", async () => {
      if (!confirm(`Remove the exception for ${date}?`)) return;
      await api(`/api/admin/availability?date=${encodeURIComponent(exception.local_date)}`, { method: "DELETE" });
      await loadAvailability();
    });
    item.append(text, remove);
    exceptionList.append(item);
  }
}

async function loadAvailability() {
  const data = await api("/api/admin/availability");
  renderWeekly(data.weekly);
  renderExceptions(data.exceptions);
}

function addDays(dateString, daysToAdd) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + daysToAdd);
  return date.toISOString().slice(0, 10);
}

function manualField(name) {
  return manualBookingForm.elements.namedItem(name);
}

function setManualMessage(message = "", error = false) {
  manualBookingMessage.textContent = message;
  manualBookingMessage.classList.toggle("is-error", error);
}

function manualTotalDuration() {
  return manualServices.reduce((total, service) => total + service.duration_minutes * service.quantity, 0);
}

function manualTotalPrice() {
  if (!manualServices.every((service) => Number.isInteger(service.price_cents))) return "Price confirmed separately";
  const cents = manualServices.reduce((total, service) => total + service.price_cents * service.quantity, 0);
  return `$${Number.isInteger(cents / 100) ? cents / 100 : (cents / 100).toFixed(2)}`;
}

function manualTotalQuantity() {
  return manualServices.reduce((total, service) => total + service.quantity, 0);
}

function renderManualSelection() {
  manualSelection.textContent = manualServices.length
    ? `${manualTotalQuantity()} item${manualTotalQuantity() === 1 ? "" : "s"} · ${manualTotalDuration()} min · ${manualTotalPrice()}`
    : "Choose at least one service.";
}

function renderManualServices() {
  manualServiceOptions.replaceChildren();
  for (const service of manualConfig.services) {
    const card = document.createElement("div");
    card.className = "manual-service-option";
    card.dataset.serviceId = service.id;
    const information = document.createElement("div");
    const name = document.createElement("strong");
    const detail = document.createElement("span");
    name.textContent = service.name;
    detail.textContent = `${service.duration_minutes} min · ${service.price_label ?? "Quote"}`;
    information.append(name, detail);

    const quantityLabel = document.createElement("label");
    const quantityText = document.createElement("span");
    quantityText.textContent = "Qty";
    const quantity = document.createElement("select");
    quantity.setAttribute("aria-label", `${service.name} quantity`);
    for (let value = 0; value <= 10; value += 1) {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = String(value);
      quantity.append(option);
    }
    quantity.addEventListener("change", () => {
      const selectedQuantity = Number(quantity.value);
      const withoutService = manualServices.filter((item) => item.id !== service.id);
      const projectedQuantity = withoutService.reduce((total, item) => total + item.quantity, 0) + selectedQuantity;
      if (projectedQuantity > 12) {
        quantity.value = String(manualServices.find((item) => item.id === service.id)?.quantity ?? 0);
        setManualMessage("A booking can contain up to 12 service items.", true);
        return;
      }
      manualServices = selectedQuantity > 0 ? [...withoutService, { ...service, quantity: selectedQuantity }] : withoutService;
      card.classList.toggle("is-selected", selectedQuantity > 0);
      manualSlot = undefined;
      createManualBookingButton.disabled = true;
      setManualMessage();
      renderManualSelection();
      loadManualAvailability();
    });
    quantityLabel.append(quantityText, quantity);
    card.append(information, quantityLabel);
    manualServiceOptions.append(card);
  }
  renderManualSelection();
}

async function loadManualConfig() {
  if (manualConfig) return;
  manualServiceOptions.innerHTML = "<p>Loading services…</p>";
  manualConfig = await api("/api/booking/config");
  const today = adelaideDateKey();
  manualField("date").min = today;
  manualField("date").max = addDays(today, manualConfig.settings.maximum_advance_booking_days);
  manualField("date").value = today;
  renderManualServices();
}

async function loadManualAvailability() {
  const requestId = ++manualAvailabilityRequest;
  const date = manualField("date").value;
  manualSlot = undefined;
  createManualBookingButton.disabled = true;
  if (!manualServices.length || !date) {
    manualSlotOptions.innerHTML = "<p>Select a service and date to see available times.</p>";
    return;
  }

  manualSlotOptions.innerHTML = "<p>Checking availability…</p>";
  const params = new URLSearchParams({ date });
  manualServices.forEach((service) => {
    params.append("serviceId", service.id);
    params.append("quantity", String(service.quantity));
  });
  try {
    const { slots } = await api(`/api/booking/availability?${params}`);
    if (requestId !== manualAvailabilityRequest) return;
    manualSlotOptions.replaceChildren();
    if (!slots.length) {
      manualSlotOptions.innerHTML = "<p>No times are available on this date.</p>";
      return;
    }
    for (const slot of slots) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "manual-slot-option";
      button.textContent = appointmentTime(slot.starts_at);
      button.addEventListener("click", () => {
        manualSlot = slot;
        manualSlotOptions.querySelectorAll("button").forEach((item) => item.classList.toggle("is-selected", item === button));
        createManualBookingButton.disabled = false;
        setManualMessage();
      });
      manualSlotOptions.append(button);
    }
  } catch (error) {
    if (requestId !== manualAvailabilityRequest) return;
    if (error.status === 401) return location.reload();
    manualSlotOptions.innerHTML = "<p>Availability could not be loaded. Please try again.</p>";
  }
}

function resetManualBooking() {
  manualBookingForm.reset();
  manualServices = [];
  manualSlot = undefined;
  manualIdempotencyKey = crypto.randomUUID();
  manualAvailabilityRequest += 1;
  createManualBookingButton.disabled = true;
  setManualMessage();
  if (manualConfig) {
    manualField("date").value = adelaideDateKey();
    renderManualServices();
  }
  manualSlotOptions.innerHTML = "<p>Select a service and date to see available times.</p>";
  resetBookingCustomerAutocomplete();
}

async function openManualBooking() {
  resetManualBooking();
  manualBookingDialog.showModal();
  try {
    await loadManualConfig();
    loadManualAvailability();
  } catch (error) {
    if (error.status === 401) return location.reload();
    setManualMessage("Services could not be loaded. Close this window and try again.", true);
  }
}

function closeManualBooking() {
  manualBookingDialog.close();
  resetManualBooking();
}

manualBookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!manualServices.length) return setManualMessage("Choose at least one service.", true);
  if (!manualSlot) return setManualMessage("Choose an available time.", true);
  if (!manualBookingForm.reportValidity()) return;

  createManualBookingButton.disabled = true;
  createManualBookingButton.textContent = "Creating…";
  setManualMessage("Creating the booking and sending confirmations…");
  try {
    const result = await api("/api/admin/bookings", {
      method: "POST",
      body: JSON.stringify({
        services: manualServices.map((service) => ({ serviceId: service.id, quantity: service.quantity })),
        startsAt: manualSlot.starts_at,
        idempotencyKey: manualIdempotencyKey,
        customer: {
          firstName: manualField("firstName").value,
          lastName: manualField("lastName").value,
          email: manualField("email").value,
          phone: manualField("phone").value,
        },
        address: {
          line1: manualField("addressLine1").value,
          line2: manualField("addressLine2").value,
          suburb: manualField("suburb").value,
          state: "SA",
          postcode: manualField("postcode").value,
        },
        notes: manualField("notes").value,
        website: "",
      }),
    });
    manualBookingDialog.close();
    resetManualBooking();
    await loadBookings({ silent: true });
    bookingsStatus.textContent = `Booking ${result.booking.reference} created. Confirmations have been queued.`;
    bookingsStatus.classList.remove("is-error");
  } catch (error) {
    if (error.status === 401) return location.reload();
    if (error.status === 409) {
      setManualMessage("That time has just been booked. Choose another available time.", true);
      await loadManualAvailability();
    } else {
      setManualMessage("The booking could not be created. Check the details and try again.", true);
      createManualBookingButton.disabled = false;
    }
  } finally {
    createManualBookingButton.textContent = "Create booking";
  }
});

// ── Customer autocomplete inside "New booking" dialog ─────────────────────
const bookingCustomerSearch = document.querySelector("[data-booking-customer-search]");
const bookingCustomerResults = document.querySelector("[data-booking-customer-results]");
const bookingCustomerClear = document.querySelector("[data-booking-customer-clear]");
let bookingCustomerTimer;
let bookingCustomerHasSelection = false;

function closeBookingCustomerResults() {
  bookingCustomerResults.hidden = true;
  bookingCustomerResults.replaceChildren();
  bookingCustomerSearch.setAttribute("aria-expanded", "false");
}

function resetBookingCustomerAutocomplete() {
  bookingCustomerSearch.value = "";
  bookingCustomerClear.hidden = true;
  bookingCustomerHasSelection = false;
  closeBookingCustomerResults();
}

function applyCustomerToBookingForm(customer) {
  manualField("firstName").value = customer.first_name;
  manualField("lastName").value = customer.last_name;
  manualField("email").value = customer.email;
  manualField("phone").value = customer.phone;
  bookingCustomerSearch.value = `${customer.first_name} ${customer.last_name}`;
  bookingCustomerHasSelection = true;
  bookingCustomerClear.hidden = false;
  closeBookingCustomerResults();
  // Move focus to the address field so the cleaner continues naturally.
  manualField("addressLine1")?.focus();
}

async function searchBookingCustomers(q) {
  if (q.length < 2) { closeBookingCustomerResults(); return; }
  try {
    const { customers } = await api(`/api/admin/customers?q=${encodeURIComponent(q)}`);
    bookingCustomerResults.replaceChildren();
    if (!customers.length) { closeBookingCustomerResults(); return; }
    for (const customer of customers.slice(0, 7)) {
      const item = document.createElement("li");
      item.className = "booking-customer-result";
      item.setAttribute("role", "option");
      item.setAttribute("tabindex", "-1");
      const nameEl = document.createElement("strong");
      nameEl.textContent = `${customer.first_name} ${customer.last_name}`;
      const detailEl = document.createElement("span");
      const bookingLabel = customer.confirmed_bookings > 0
        ? `${customer.confirmed_bookings} booking${customer.confirmed_bookings === 1 ? "" : "s"}`
        : "No bookings yet";
      detailEl.textContent = `${customer.email} · ${customer.phone} · ${bookingLabel}`;
      item.append(nameEl, detailEl);
      // mousedown fires before blur, so we can preventDefault to keep the input focused.
      item.addEventListener("mousedown", (e) => { e.preventDefault(); applyCustomerToBookingForm(customer); });
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); applyCustomerToBookingForm(customer); }
        if (e.key === "Escape") { closeBookingCustomerResults(); bookingCustomerSearch.focus(); }
        if (e.key === "ArrowDown") { e.preventDefault(); (item.nextElementSibling ?? item).focus(); }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          const prev = item.previousElementSibling;
          (prev ?? bookingCustomerSearch).focus();
        }
      });
      bookingCustomerResults.append(item);
    }
    bookingCustomerResults.hidden = false;
    bookingCustomerSearch.setAttribute("aria-expanded", "true");
  } catch {
    closeBookingCustomerResults();
  }
}

bookingCustomerSearch.addEventListener("input", () => {
  if (bookingCustomerHasSelection) {
    // User started typing again after a selection — clear the filled fields.
    manualField("firstName").value = "";
    manualField("lastName").value = "";
    manualField("email").value = "";
    manualField("phone").value = "";
    bookingCustomerHasSelection = false;
    bookingCustomerClear.hidden = true;
  }
  clearTimeout(bookingCustomerTimer);
  const q = bookingCustomerSearch.value.trim();
  bookingCustomerTimer = setTimeout(() => searchBookingCustomers(q), 250);
});

bookingCustomerSearch.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeBookingCustomerResults(); return; }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    const first = bookingCustomerResults.querySelector("[role='option']");
    first?.focus();
  }
});

bookingCustomerSearch.addEventListener("blur", () => {
  // Small delay lets the mousedown on a result fire first.
  setTimeout(closeBookingCustomerResults, 180);
});

bookingCustomerClear.addEventListener("click", () => {
  manualField("firstName").value = "";
  manualField("lastName").value = "";
  manualField("email").value = "";
  manualField("phone").value = "";
  resetBookingCustomerAutocomplete();
  bookingCustomerSearch.focus();
});

document.querySelector("[data-open-manual-booking]").addEventListener("click", openManualBooking);
document.querySelectorAll("[data-close-manual-booking]").forEach((button) => button.addEventListener("click", closeManualBooking));
manualField("date").addEventListener("change", loadManualAvailability);
manualBookingDialog.addEventListener("click", (event) => {
  if (event.target === manualBookingDialog) closeManualBooking();
});

document.querySelector("[data-login-form]").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  try {
    await api("/api/admin/auth/request", { method: "POST", body: JSON.stringify({ email: event.currentTarget.email.value }) });
    setMessage("[data-login-message]", "If this address is authorised, a login link has been sent.");
  } catch {
    setMessage("[data-login-message]", "The login link could not be sent. Please try again.", true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("[data-weekly-form]").addEventListener("submit", async (event) => {
  event.preventDefault();
  const weekly = [...weeklyContainer.querySelectorAll(".weekly-row")]
    .filter((row) => row.querySelector('input[type="checkbox"]').checked)
    .map((row) => ({ weekday: Number(row.dataset.weekday), opensAt: row.querySelector("[data-opens]").value, closesAt: row.querySelector("[data-closes]").value }));
  try {
    await api("/api/admin/availability", { method: "PUT", body: JSON.stringify({ weekly }) });
    setMessage("[data-weekly-message]", "Weekly hours saved.");
  } catch {
    setMessage("[data-weekly-message]", "Could not save these hours. Check that each opening time is before closing time.", true);
  }
});

const exceptionForm = document.querySelector("[data-exception-form]");
const adelaideToday = adelaideDateKey();
exceptionForm.date.min = adelaideToday;
exceptionForm.opensAt.value = "07:00";
exceptionForm.closesAt.value = "12:00";
exceptionForm.closed.addEventListener("change", () => {
  document.querySelectorAll("[data-exception-time] input").forEach((input) => {
    input.disabled = exceptionForm.closed.checked;
    input.required = !exceptionForm.closed.checked;
  });
});
exceptionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = { date: exceptionForm.date.value, closed: exceptionForm.closed.checked };
  if (!body.closed) Object.assign(body, { opensAt: exceptionForm.opensAt.value, closesAt: exceptionForm.closesAt.value });
  try {
    await api("/api/admin/availability", { method: "POST", body: JSON.stringify(body) });
    setMessage("[data-exception-message]", "Exception saved.");
    exceptionForm.reset();
    exceptionForm.opensAt.value = "07:00";
    exceptionForm.closesAt.value = "12:00";
    exceptionForm.closed.dispatchEvent(new Event("change"));
    await loadAvailability();
  } catch {
    setMessage("[data-exception-message]", "Could not save this exception. Check the date and times.", true);
  }
});

document.querySelector("[data-logout]").addEventListener("click", async () => {
  await api("/api/admin/auth/logout", { method: "POST" });
  location.reload();
});

document.querySelector("[data-refresh-bookings]").addEventListener("click", () => loadBookings());
document.querySelector("[data-calendar-previous]").addEventListener("click", () => changeCalendarMonth(-1));
document.querySelector("[data-calendar-next]").addEventListener("click", () => changeCalendarMonth(1));
document.querySelector("[data-calendar-today]").addEventListener("click", () => {
  calendarMonth = adelaideDateKey().slice(0, 7);
  renderAppointmentCalendar(latestBookings);
});
function navigateToAdminSection(hash, { behavior = "smooth", updateHistory = true } = {}) {
  const sectionHash = ["#dashboard-overview", "#schedule", "#availability", "#customers"].includes(hash) ? hash : "#dashboard-overview";
  const target = document.querySelector(sectionHash);
  if (!target || dashboard.hidden) return;
  const topbarHeight = document.querySelector(".admin-topbar")?.getBoundingClientRect().height ?? 0;
  const mobileNavigationHeight = window.matchMedia("(max-width: 760px)").matches
    ? document.querySelector(".admin-sidebar")?.getBoundingClientRect().height ?? 0
    : 0;
  const top = target.getBoundingClientRect().top + window.scrollY - topbarHeight - mobileNavigationHeight - 20;
  window.scrollTo({ top: Math.max(0, top), behavior });
  document.querySelectorAll('.admin-nav a[href^="#"]').forEach((item) => {
    item.classList.toggle("is-active", item.getAttribute("href") === sectionHash);
  });
  if (updateHistory && location.hash !== sectionHash) history.replaceState(null, "", sectionHash);
}

document.querySelectorAll('.admin-nav a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    navigateToAdminSection(link.getAttribute("href"));
  });
});
window.addEventListener("hashchange", () => navigateToAdminSection(location.hash, { updateHistory: false }));
setInterval(() => {
  if (!dashboard.hidden && document.visibilityState === "visible") loadBookings({ silent: true });
}, 120_000);
document.addEventListener("visibilitychange", () => {
  if (!dashboard.hidden && document.visibilityState === "visible") loadBookings({ silent: true });
});

async function init() {
  updateGreeting();
  if (new URLSearchParams(location.search).get("auth") === "invalid") {
    setMessage("[data-login-message]", "This login link is invalid or has expired. Request a new one.", true);
  }
  try {
    await api("/api/admin/auth/session");
    dashboard.hidden = false;
    await Promise.all([loadAvailability(), loadBookings()]);
    requestAnimationFrame(() => navigateToAdminSection(location.hash, { behavior: "auto", updateHistory: false }));
  } catch (error) {
    if (error.status === 401) login.hidden = false;
    else {
      dashboard.hidden = false;
      const authError = document.querySelector("[data-auth-error]");
      authError.hidden = false;
      authError.textContent = "The administration area is temporarily unavailable.";
    }
  }
}

// ── Customers ─────────────────────────────────────────────────────────────
const customerSearch = document.querySelector("[data-customer-search]");
const customerList = document.querySelector("[data-customer-list]");
const customerStatus = document.querySelector("[data-customer-status]");
const customerDialog = document.querySelector("[data-customer-dialog]");
const customerDialogName = document.querySelector("[data-customer-dialog-name]");
const customerContactBar = document.querySelector("[data-customer-contact-bar]");
const customerNotesInput = document.querySelector("[data-customer-notes]");
const customerNotesMessage = document.querySelector("[data-customer-notes-message]");
const customerBookingsContainer = document.querySelector("[data-customer-bookings]");
let customerSearchTimer;
let activeCustomerEmail = null;
let customersLoaded = false;

function formatCustomerDate(value) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Adelaide", day: "numeric", month: "short", year: "numeric",
  }).format(new Date(value));
}

function renderCustomers(customers) {
  customerList.replaceChildren();
  if (!customers.length) {
    const empty = document.createElement("p");
    empty.className = "customer-empty";
    empty.textContent = "No customers found.";
    customerList.append(empty);
    return;
  }
  for (const customer of customers) {
    const row = document.createElement("div");
    row.className = "customer-item";
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");

    const identity = document.createElement("div");
    identity.className = "customer-identity";
    const name = document.createElement("strong");
    name.textContent = `${customer.first_name} ${customer.last_name}`;
    const emailEl = document.createElement("span");
    emailEl.textContent = customer.email;
    identity.append(name, emailEl);

    const contacts = document.createElement("div");
    contacts.className = "customer-contacts";
    const callLink = document.createElement("a");
    callLink.href = `tel:${customer.phone}`;
    callLink.className = "customer-contact-link";
    callLink.textContent = customer.phone;
    callLink.addEventListener("click", (e) => e.stopPropagation());
    contacts.append(callLink);

    const stats = document.createElement("div");
    stats.className = "customer-stats";
    const bookingCount = document.createElement("span");
    bookingCount.className = "customer-stat";
    bookingCount.textContent = `${customer.confirmed_bookings} booking${customer.confirmed_bookings === 1 ? "" : "s"}`;

    const lastEl = document.createElement("span");
    lastEl.className = "customer-stat";
    lastEl.textContent = customer.last_service_at ? `Last: ${formatCustomerDate(customer.last_service_at)}` : "No past visits";

    const nextEl = document.createElement("span");
    nextEl.className = `customer-stat${customer.next_booking_at ? " is-upcoming" : ""}`;
    nextEl.textContent = customer.next_booking_at ? `Next: ${formatCustomerDate(customer.next_booking_at)}` : "";

    stats.append(bookingCount, lastEl);
    if (customer.next_booking_at) stats.append(nextEl);

    if (customer.notes) {
      const notesDot = document.createElement("span");
      notesDot.className = "customer-has-notes";
      notesDot.title = "Has internal notes";
      notesDot.setAttribute("aria-label", "Has internal notes");
      identity.append(notesDot);
    }

    row.append(identity, contacts, stats);
    row.addEventListener("click", () => openCustomerDialog(customer));
    row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCustomerDialog(customer); } });
    customerList.append(row);
  }
}

async function loadCustomers(q = "") {
  customerStatus.textContent = "Loading customers…";
  customerStatus.classList.remove("is-error");
  try {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const { customers } = await api(`/api/admin/customers?${params}`);
    renderCustomers(customers);
    customerStatus.textContent = customers.length ? `${customers.length} customer${customers.length === 1 ? "" : "s"} found` : "";
    customersLoaded = true;
  } catch (error) {
    if (error.status === 401) return location.reload();
    customerStatus.textContent = "Customers could not be loaded. Please try again.";
    customerStatus.classList.add("is-error");
  }
}

function renderCustomerBookings(bookings) {
  customerBookingsContainer.replaceChildren();
  if (!bookings.length) {
    const empty = document.createElement("p");
    empty.className = "customer-empty";
    empty.textContent = "No bookings found for this customer.";
    customerBookingsContainer.append(empty);
    return;
  }
  for (const booking of bookings) {
    const item = document.createElement("div");
    item.className = `customer-booking-item${booking.status === "cancelled" ? " is-cancelled" : ""}`;

    const header = document.createElement("div");
    header.className = "customer-booking-header";
    const dateEl = document.createElement("strong");
    dateEl.textContent = `${formatCustomerDate(booking.starts_at)} · ${appointmentTime(booking.starts_at)}`;
    const statusBadge = document.createElement("span");
    statusBadge.className = `customer-booking-status is-${booking.status}`;
    statusBadge.textContent = booking.status;
    header.append(dateEl, statusBadge);

    const serviceEl = document.createElement("p");
    serviceEl.className = "customer-booking-service";
    const priceText = booking.price_cents ? ` · $${(booking.price_cents / 100).toFixed(0)}` : (booking.price_label ? ` · ${booking.price_label}` : "");
    serviceEl.textContent = `${booking.service_name} · ${booking.duration_minutes} min${priceText}`;

    const addressParts = [booking.address_line1, booking.address_line2, booking.suburb].filter(Boolean);
    const addressEl = document.createElement("p");
    addressEl.className = "customer-booking-address";
    addressEl.textContent = addressParts.join(", ");

    const ref = document.createElement("span");
    ref.className = "appointment-reference";
    ref.textContent = booking.reference;

    item.append(header, serviceEl, addressEl, ref);
    if (booking.notes) {
      const notesEl = document.createElement("p");
      notesEl.className = "customer-booking-notes";
      notesEl.textContent = `Notes: ${booking.notes}`;
      item.append(notesEl);
    }
    customerBookingsContainer.append(item);
  }
}

async function openCustomerDialog(customer) {
  activeCustomerEmail = customer.email;
  customerDialogName.textContent = `${customer.first_name} ${customer.last_name}`;
  customerNotesInput.value = customer.notes ?? "";
  customerNotesMessage.textContent = "";
  customerBookingsContainer.innerHTML = "<p>Loading history…</p>";

  customerContactBar.replaceChildren();
  const callLink = document.createElement("a");
  callLink.href = `tel:${customer.phone}`;
  callLink.className = "button secondary";
  callLink.textContent = `Call ${customer.phone}`;
  const emailLink = document.createElement("a");
  emailLink.href = `mailto:${customer.email}`;
  emailLink.className = "button secondary";
  emailLink.textContent = `Email ${customer.email}`;
  customerContactBar.append(callLink, emailLink);

  customerDialog.showModal();

  try {
    const { bookings, notes } = await api(`/api/admin/customers?email=${encodeURIComponent(customer.email)}`);
    if (activeCustomerEmail !== customer.email) return;
    customerNotesInput.value = notes ?? "";
    renderCustomerBookings(bookings);
  } catch (error) {
    if (error.status === 401) return location.reload();
    customerBookingsContainer.innerHTML = "<p>Booking history could not be loaded.</p>";
  }
}

function closeCustomerDialog() {
  customerDialog.close();
  activeCustomerEmail = null;
}

document.querySelector("[data-close-customer-dialog]").addEventListener("click", closeCustomerDialog);
customerDialog.addEventListener("click", (e) => { if (e.target === customerDialog) closeCustomerDialog(); });

document.querySelector("[data-save-customer-notes]").addEventListener("click", async () => {
  if (!activeCustomerEmail) return;
  const saveButton = document.querySelector("[data-save-customer-notes]");
  saveButton.disabled = true;
  saveButton.textContent = "Saving…";
  customerNotesMessage.textContent = "";
  customerNotesMessage.classList.remove("is-error");
  try {
    await api("/api/admin/customers", {
      method: "PATCH",
      body: JSON.stringify({ email: activeCustomerEmail, notes: customerNotesInput.value }),
    });
    customerNotesMessage.textContent = "Notes saved.";
    // Refresh list silently so notes dot updates
    loadCustomers(customerSearch.value.trim());
  } catch (error) {
    if (error.status === 401) return location.reload();
    customerNotesMessage.textContent = "Could not save notes. Please try again.";
    customerNotesMessage.classList.add("is-error");
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save notes";
  }
});

// ── Add contact dialog ────────────────────────────────────────────────────
const addCustomerDialog = document.querySelector("[data-add-customer-dialog]");
const addCustomerForm = document.querySelector("[data-add-customer-form]");
const addCustomerMessage = document.querySelector("[data-add-customer-message]");
const addCustomerSubmit = document.querySelector("[data-add-customer-submit]");

function openAddCustomerDialog() {
  addCustomerForm.reset();
  addCustomerMessage.textContent = "";
  addCustomerMessage.classList.remove("is-error");
  addCustomerSubmit.disabled = false;
  addCustomerSubmit.textContent = "Add contact";
  addCustomerDialog.showModal();
}

function closeAddCustomerDialog() {
  addCustomerDialog.close();
}

document.querySelector("[data-open-add-customer]").addEventListener("click", openAddCustomerDialog);
document.querySelectorAll("[data-close-add-customer]").forEach((btn) => btn.addEventListener("click", closeAddCustomerDialog));
addCustomerDialog.addEventListener("click", (e) => { if (e.target === addCustomerDialog) closeAddCustomerDialog(); });

addCustomerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!addCustomerForm.reportValidity()) return;
  addCustomerSubmit.disabled = true;
  addCustomerSubmit.textContent = "Saving…";
  addCustomerMessage.textContent = "";
  addCustomerMessage.classList.remove("is-error");
  try {
    await api("/api/admin/customers", {
      method: "POST",
      body: JSON.stringify({
        email:     addCustomerForm.elements.namedItem("email").value,
        firstName: addCustomerForm.elements.namedItem("firstName").value,
        lastName:  addCustomerForm.elements.namedItem("lastName").value,
        phone:     addCustomerForm.elements.namedItem("phone").value,
        notes:     addCustomerForm.elements.namedItem("notes").value,
      }),
    });
    closeAddCustomerDialog();
    await loadCustomers(customerSearch.value.trim());
  } catch (error) {
    if (error.status === 401) return location.reload();
    const message = error.status === 409
      ? "This contact is already in the directory."
      : "The contact could not be saved. Please try again.";
    addCustomerMessage.textContent = message;
    addCustomerMessage.classList.add("is-error");
    addCustomerSubmit.disabled = false;
    addCustomerSubmit.textContent = "Add contact";
  }
});

customerSearch.addEventListener("input", () => {
  clearTimeout(customerSearchTimer);
  customerSearchTimer = setTimeout(() => loadCustomers(customerSearch.value.trim()), 320);
});

// Load customers lazily when the section first becomes visible via IntersectionObserver.
const customersSection = document.getElementById("customers");
if (customersSection) {
  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !customersLoaded) {
      loadCustomers();
      observer.disconnect();
    }
  }, { threshold: 0.05 });
  observer.observe(customersSection);
}

init();
