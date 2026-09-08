const form = document.querySelector("#booking-form");
const steps = [...document.querySelectorAll("[data-step]")];
const serviceOptions = document.querySelector("[data-service-options]");
const slotOptions = document.querySelector("[data-slot-options]");
const errorBox = document.querySelector("[data-booking-error]");
const actions = document.querySelector("[data-booking-actions]");
const backButton = document.querySelector("[data-back]");
const nextButton = document.querySelector("[data-next]");
const labels = ["Services", "Address", "Date", "Time", "Your details", "Review", "Confirmation"];
const state = { step: 1, config: null, services: [], slot: null, idempotencyKey: crypto.randomUUID() };

function showError(message = "") {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

function showStep(number) {
  state.step = number;
  steps.forEach((step) => {
    const active = Number(step.dataset.step) === number;
    step.hidden = !active;
    step.classList.toggle("is-active", active);
  });
  document.querySelector("[data-step-number]").textContent = number;
  document.querySelector("[data-step-label]").textContent = labels[number - 1];
  document.querySelector("[data-progress-bar]").style.width = `${number / 7 * 100}%`;
  backButton.hidden = number === 1 || number === 7;
  actions.hidden = number === 7;
  nextButton.textContent = number === 6 ? "Confirm booking" : "Continue";
  showError();
  document.querySelector(`[data-step="${number}"]`)?.focus?.();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function field(name) {
  return form.elements.namedItem(name);
}

function validateFields(names) {
  for (const name of names) {
    const input = field(name);
    if (!input.checkValidity()) {
      input.reportValidity();
      return false;
    }
  }
  return true;
}

function formatTime(iso) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Adelaide", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Adelaide", weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(new Date(iso));
}

function adelaideDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Adelaide", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const SERVICE_IMAGES = {
  "sofa-up-to-3-seats": "/Images/Sofa%20up%20to%203%20seats.png",
  "sofa-4-seats": "/Images/Sofa%20up%20to%204%20seats.png",
  "sofa-5-seats-plus": "/Images/Sofa%20up%20to%205%20seats.png",
  "dining-chair": "/Images/Chaise%20salle%20a%20manger.png",
  "arm-chair": "/Images/Fauteuil.png",
  "rug": "/Images/Carpet.jpeg",
  "carpet-room": "/Images/Carpet.jpeg",
  "carpet-lounge": "/Images/Carpet.jpeg",
  "mattress-single": "/Images/Matelas%20Single.png",
  "mattress-queen": "/Images/Matelas%20Queen.png",
  "mattress-king": "/Images/Matelas%20King.png",
};

function renderServices() {
  serviceOptions.replaceChildren();
  for (const service of state.config.services) {
    const card = document.createElement("article");
    card.className = "service-option";
    card.dataset.serviceId = service.id;

    const imageDiv = document.createElement("div");
    imageDiv.className = "service-image";
    const imgSrc = SERVICE_IMAGES[service.slug];
    if (imgSrc) {
      const img = document.createElement("img");
      img.src = imgSrc;
      img.alt = service.name;
      img.loading = "lazy";
      imageDiv.append(img);
    }

    const body = document.createElement("div");
    body.className = "service-body";
    body.innerHTML = `<strong></strong><span></span><em></em>`;
    body.querySelector("strong").textContent = service.name;
    body.querySelector("span").textContent = `${service.duration_minutes} min`;
    body.querySelector("em").textContent = service.price_label ?? "Quote";

    const quantityLabel = document.createElement("label");
    quantityLabel.className = "service-quantity";
    const quantityText = document.createElement("span");
    quantityText.textContent = "Quantity";
    const quantity = document.createElement("select");
    quantity.setAttribute("aria-label", `${service.name} quantity`);
    for (let value = 0; value <= 10; value += 1) {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = value === 0 ? "Not selected" : String(value);
      quantity.append(option);
    }
    quantity.addEventListener("change", () => setServiceQuantity(service, Number(quantity.value)));
    quantityLabel.append(quantityText, quantity);

    card.append(imageDiv, body, quantityLabel);
    serviceOptions.append(card);
  }
  const requestedSlug = new URLSearchParams(location.search).get("service");
  const requestedService = state.config.services.find((service) => service.slug === requestedSlug);
  if (requestedService) setServiceQuantity(requestedService, 1);
}

function totalPriceLabel() {
  if (!state.services.every((service) => Number.isInteger(service.price_cents))) return "Confirmed separately";
  const cents = state.services.reduce((total, service) => total + service.price_cents * service.quantity, 0);
  return `$${Number.isInteger(cents / 100) ? cents / 100 : (cents / 100).toFixed(2)}`;
}

function totalDuration() {
  return state.services.reduce((total, service) => total + service.duration_minutes * service.quantity, 0);
}

function totalQuantity() {
  return state.services.reduce((total, service) => total + service.quantity, 0);
}

function renderServiceSelection() {
  const selection = document.querySelector("[data-service-selection]");
  selection.hidden = state.services.length === 0;
  selection.textContent = state.services.length
    ? `${totalQuantity()} item${totalQuantity() === 1 ? "" : "s"} selected · ${totalDuration()} min · ${totalPriceLabel()}`
    : "";
}

function setServiceQuantity(service, quantity) {
  const withoutService = state.services.filter((item) => item.id !== service.id);
  const projectedQuantity = withoutService.reduce((total, item) => total + item.quantity, 0) + quantity;
  if (projectedQuantity > 12) {
    showError("A booking can contain up to 12 service items.");
    document.querySelector(`.service-option[data-service-id="${service.id}"] select`).value = String(state.services.find((item) => item.id === service.id)?.quantity ?? 0);
    return;
  }
  showError();
  state.services = quantity > 0 ? [...withoutService, { ...service, quantity }] : withoutService;
  state.slot = null;
  document.querySelectorAll(".service-option").forEach((card) => {
    const selectedService = state.services.find((item) => item.id === card.dataset.serviceId);
    card.classList.toggle("is-selected", Boolean(selectedService));
    card.querySelector("select").value = String(selectedService?.quantity ?? 0);
  });
  renderServiceSelection();
}

async function loadAvailability() {
  slotOptions.innerHTML = "<p>Checking availability…</p>";
  state.slot = null;
  const params = new URLSearchParams({ date: field("date").value });
  state.services.forEach((service) => {
    params.append("serviceId", service.id);
    params.append("quantity", String(service.quantity));
  });
  const response = await fetch(`/api/booking/availability?${params}`);
  if (!response.ok) throw new Error("We could not load availability. Please try again.");
  const { slots } = await response.json();
  slotOptions.replaceChildren();
  document.querySelector("[data-selected-date]").textContent = new Intl.DateTimeFormat("en-AU", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(`${field("date").value}T12:00:00Z`));
  if (!slots.length) {
    slotOptions.innerHTML = "<p>No times are available on this date. Please choose another date.</p>";
    return;
  }
  for (const slot of slots) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot-option";
    button.textContent = formatTime(slot.starts_at);
    button.addEventListener("click", () => {
      state.slot = slot;
      document.querySelectorAll(".slot-option").forEach((item) => item.classList.toggle("is-selected", item === button));
    });
    slotOptions.append(button);
  }
}

function summaryRow(label, value) {
  const row = document.createElement("div");
  row.className = "summary-row";
  const name = document.createElement("span");
  const detail = document.createElement("strong");
  name.textContent = label;
  detail.textContent = value;
  row.append(name, detail);
  return row;
}

function renderSummary() {
  const summary = document.querySelector("[data-booking-summary]");
  summary.replaceChildren(
    summaryRow("Services", state.services.map((service) => `${service.quantity > 1 ? `${service.quantity} × ` : ""}${service.name}`).join(", ")),
    summaryRow("Duration", `${totalDuration()} min`),
    summaryRow("Total", totalPriceLabel()),
    summaryRow("When", `${formatDate(state.slot.starts_at)} at ${formatTime(state.slot.starts_at)}`),
    summaryRow("Address", `${field("addressLine1").value}, ${field("suburb").value} SA ${field("postcode").value}`),
    summaryRow("Customer", `${field("firstName").value} ${field("lastName").value}`),
    summaryRow("Contact", `${field("email").value} · ${field("phone").value}`),
  );
}

async function submitBooking() {
  nextButton.disabled = true;
  nextButton.textContent = "Confirming…";
  try {
    const response = await fetch("/api/booking/reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        services: state.services.map((service) => ({ serviceId: service.id, quantity: service.quantity })),
        startsAt: state.slot.starts_at,
        idempotencyKey: state.idempotencyKey,
        customer: { firstName: field("firstName").value, lastName: field("lastName").value, email: field("email").value, phone: field("phone").value },
        address: { line1: field("addressLine1").value, line2: field("addressLine2").value, suburb: field("suburb").value, state: "SA", postcode: field("postcode").value },
        notes: field("notes").value,
        website: field("website").value,
      }),
    });
    const result = await response.json();
    if (response.status === 409 && result.error === "SLOT_NOT_AVAILABLE") {
      await loadAvailability();
      showStep(4);
      showError("That time was just booked by someone else. Please choose another available time.");
      return;
    }
    if (!response.ok) throw new Error("We could not confirm your booking. Please check your details and try again.");
    document.querySelector("[data-booking-reference]").textContent = result.booking.reference;
    showStep(7);
  } catch (error) {
    showError(error.message || "Something went wrong. Please try again.");
  } finally {
    nextButton.disabled = false;
    if (state.step !== 7) nextButton.textContent = state.step === 6 ? "Confirm booking" : "Continue";
  }
}

nextButton.addEventListener("click", async () => {
  try {
    if (state.step === 1 && !state.services.length) return showError("Please choose at least one service.");
    if (state.step === 2 && !validateFields(["addressLine1", "suburb", "postcode"])) return;
    if (state.step === 3) {
      if (!validateFields(["date"])) return;
      await loadAvailability();
    }
    if (state.step === 4 && !state.slot) return showError("Please choose an available time.");
    if (state.step === 5) {
      if (!validateFields(["firstName", "lastName", "email", "phone"])) return;
      renderSummary();
    }
    if (state.step === 6) return submitBooking();
    showStep(state.step + 1);
  } catch (error) {
    showError(error.message || "Something went wrong. Please try again.");
  }
});

backButton.addEventListener("click", () => showStep(state.step - 1));

async function init() {
  try {
    const response = await fetch("/api/booking/config");
    if (!response.ok) throw new Error();
    state.config = await response.json();
    renderServices();
    const today = adelaideDate();
    field("date").min = today;
    field("date").max = addDays(today, state.config.settings.maximum_advance_booking_days);
    document.querySelector("[data-date-help]").textContent = `Bookings can be made up to ${state.config.settings.maximum_advance_booking_days} days ahead.`;
  } catch {
    serviceOptions.innerHTML = "<p>Online booking is temporarily unavailable. Please call 0474 597 325.</p>";
    nextButton.disabled = true;
  }
}

init();
