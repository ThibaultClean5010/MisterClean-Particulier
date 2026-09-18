// Display estimates only. PostgreSQL recalculates prices and durations from its catalogue.
export function money(cents) {
  if (!Number.isInteger(cents)) return "Confirmed separately";
  return `$${Number.isInteger(cents / 100) ? cents / 100 : (cents / 100).toFixed(2)}`;
}

export function selectedAddons(service) {
  return (service.addons ?? []).filter((addon) => (service.selectedAddons ?? []).includes(addon.code));
}

export function selectionTotals(services) {
  return services.reduce((total, service) => {
    const addons = selectedAddons(service);
    const extraPrice = addons.reduce((sum, addon) => sum + addon.price_cents, 0);
    const extraMinutes = addons.reduce((sum, addon) => sum + addon.duration_minutes, 0);
    return {
      cents: total.cents !== null && Number.isInteger(service.price_cents)
        ? total.cents + (service.price_cents + extraPrice) * service.quantity : null,
      minutes: total.minutes + (service.duration_minutes + extraMinutes) * service.quantity,
    };
  }, { cents: 0, minutes: 0 });
}

export function servicePayload(service) {
  return { serviceId: service.id, quantity: service.quantity, addons: service.selectedAddons ?? [] };
}

export function serviceBreakdown(services) {
  return services.flatMap((service) => [
    [`${service.quantity} × ${service.name}`, Number.isInteger(service.price_cents) ? money(service.price_cents * service.quantity) : "Confirmed separately"],
    ...selectedAddons(service).map((addon) => [
      `${service.quantity} × ${addon.name} — ${service.name}`, `+${money(addon.price_cents * service.quantity)}`,
    ]),
  ]);
}

export function createAddonOptions(service, onChange) {
  const group = document.createElement("fieldset");
  group.className = "service-addons";
  group.disabled = true;
  const legend = document.createElement("legend");
  legend.textContent = "Optional extras";
  const help = document.createElement("p");
  help.className = "addon-help";
  help.dataset.addonHelp = "";
  help.textContent = "Select a quantity to add extras.";
  group.append(legend, help);
  for (const addon of service.addons ?? []) {
    const label = document.createElement("label");
    label.className = "addon-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = addon.code;
    checkbox.setAttribute("aria-label", `${addon.name} for ${service.name}, +${money(addon.price_cents)} per item`);
    checkbox.addEventListener("change", () => onChange(addon.code, checkbox.checked));
    const content = document.createElement("div");
    const title = document.createElement("b");
    title.textContent = addon.name;
    const price = document.createElement("small");
    price.textContent = `+${money(addon.price_cents)} per item · +${addon.duration_minutes} min`;
    const description = document.createElement("small");
    description.textContent = addon.description;
    content.append(title, price, description);
    label.append(checkbox, content);
    group.append(label);
  }
  group.hidden = !(service.addons ?? []).length;
  return group;
}

export function syncAddonOptions(card, service) {
  const group = card.querySelector(".service-addons");
  group.disabled = !service;
  group.querySelector("[data-addon-help]").textContent = service
    ? `Extras apply to all ${service.quantity} item${service.quantity === 1 ? "" : "s"} of this service.`
    : "Select a quantity to add extras.";
  group.querySelectorAll("input").forEach((input) => {
    input.checked = (service?.selectedAddons ?? []).includes(input.value);
  });
}
