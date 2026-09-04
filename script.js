const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector(".site-nav");
const dropdown = document.querySelector(".dropdown");
const servicesToggle = document.querySelector(".services-toggle");
const contactForm = document.querySelector("#contact-form");
const formStatus = document.querySelector("#form-status");
const serviceMapElement = document.querySelector("#service-map");

navToggle?.addEventListener("click", () => {
  const isOpen = siteNav.classList.toggle("is-open");
  document.body.classList.toggle("menu-open", isOpen);
  navToggle.setAttribute("aria-expanded", String(isOpen));
  navToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
});

servicesToggle?.addEventListener("click", (event) => {
  event.stopPropagation();
  const isOpen = dropdown.classList.toggle("is-open");
  servicesToggle.setAttribute("aria-expanded", String(isOpen));
});

siteNav?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLAnchorElement) {
    siteNav.classList.remove("is-open");
    dropdown?.classList.remove("is-open");
    document.body.classList.remove("menu-open");
    navToggle?.setAttribute("aria-expanded", "false");
    navToggle?.setAttribute("aria-label", "Open menu");
    servicesToggle?.setAttribute("aria-expanded", "false");
  }
});

document.addEventListener("click", () => {
  dropdown?.classList.remove("is-open");
  servicesToggle?.setAttribute("aria-expanded", "false");
});

contactForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  const fields = Array.from(contactForm.querySelectorAll("input[required], textarea[required]"));
  const hasInvalidField = fields.some((field) => !field.checkValidity());

  fields.forEach((field) => {
    field.setAttribute("aria-invalid", String(!field.checkValidity()));
  });

  if (hasInvalidField) {
    formStatus.textContent = "Please complete the required fields.";
    formStatus.classList.add("is-error");
    contactForm.querySelector("[aria-invalid='true']")?.focus();
    return;
  }

  formStatus.textContent = "Thank you. Your request is ready for the MisterClean team.";
  formStatus.classList.remove("is-error");
  contactForm.reset();
});

if (serviceMapElement && window.L) {
  const adelaide = [-34.9285, 138.6007];
  const map = window.L.map(serviceMapElement, {
    scrollWheelZoom: false,
  }).setView(adelaide, 9);

  window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);

  const serviceArea = window.L.circle(adelaide, {
    color: "#08749f",
    fillColor: "#13aee8",
    fillOpacity: 0.32,
    radius: 70000,
    weight: 3,
  }).bindPopup("MisterClean service area: Adelaide metro and surrounding regions.").addTo(map);

  map.fitBounds(serviceArea.getBounds(), { padding: [28, 28] });

  serviceMapElement.querySelector(".map-fallback")?.remove();
}
