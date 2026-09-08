const navToggle = document.querySelector(".nav-toggle");
const siteNav = document.querySelector(".site-nav");
const dropdown = document.querySelector(".dropdown");
const servicesToggle = document.querySelector(".services-toggle");
const serviceMapElement = document.querySelector("#service-map");
const workCarousel = document.querySelector("[data-work-carousel]");

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

if (workCarousel) {
  const track = workCarousel.querySelector(".carousel-track");
  const slides = Array.from(workCarousel.querySelectorAll(".carousel-slide"));
  let currentSlide = 0;
  let autoplayId;

  const showSlide = (index) => {
    currentSlide = (index + slides.length) % slides.length;
    track.style.transform = `translateX(-${currentSlide * 100}%)`;
    slides.forEach((slide, slideIndex) => {
      slide.setAttribute("aria-hidden", String(slideIndex !== currentSlide));
    });
  };

  const stopAutoplay = () => window.clearInterval(autoplayId);
  const startAutoplay = () => {
    stopAutoplay();
    if (slides.length > 1 && !document.hidden && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      autoplayId = window.setInterval(() => showSlide(currentSlide + 1), 3500);
    }
  };

  document.addEventListener("visibilitychange", startAutoplay);
  startAutoplay();
}

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
    radius: 17500,
    weight: 3,
  }).bindPopup("MisterClean service area: Adelaide and surrounding areas.").addTo(map);

  map.fitBounds(serviceArea.getBounds(), { padding: [28, 28] });

  serviceMapElement.querySelector(".map-fallback")?.remove();
}
