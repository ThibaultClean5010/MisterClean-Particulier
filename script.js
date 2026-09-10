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
  const counter = workCarousel.querySelector("[data-carousel-counter]");
  const pauseButton = workCarousel.querySelector("[data-carousel-pause]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let currentSlide = 0;
  let autoplayId;
  let paused = reducedMotion.matches;
  let hovered = false;
  let inView = true;
  let pointerStart;

  slides.forEach((slide, index) => {
    slide.setAttribute("role", "group");
    slide.setAttribute("aria-roledescription", "slide");
    slide.setAttribute("aria-label", `${index + 1} of ${slides.length}`);
  });

  const showSlide = (index) => {
    currentSlide = (index + slides.length) % slides.length;
    track.style.transform = `translateX(-${currentSlide * 100}%)`;
    slides.forEach((slide, slideIndex) => {
      slide.setAttribute("aria-hidden", String(slideIndex !== currentSlide));
    });
    counter.textContent = `${currentSlide + 1} / ${slides.length}`;
    counter.setAttribute("aria-label", `Photo ${currentSlide + 1} of ${slides.length}`);
    // Prepare the next image before it enters the viewport.
    [currentSlide, (currentSlide + 1) % slides.length].forEach((slideIndex) => {
      slides[slideIndex].querySelector("img").loading = "eager";
    });
  };

  const stopAutoplay = () => window.clearInterval(autoplayId);
  const startAutoplay = () => {
    stopAutoplay();
    pauseButton.textContent = paused ? "Play" : "Pause";
    pauseButton.setAttribute("aria-label", paused ? "Play slideshow" : "Pause slideshow");
    track.setAttribute("aria-live", paused ? "polite" : "off");
    if (slides.length > 1 && !paused && !hovered && inView && !document.hidden) {
      autoplayId = window.setInterval(() => showSlide(currentSlide + 1), 3500);
    }
  };

  const navigate = (offset) => {
    paused = true;
    startAutoplay();
    showSlide(currentSlide + offset);
  };

  workCarousel.querySelector("[data-carousel-prev]").addEventListener("click", () => navigate(-1));
  workCarousel.querySelector("[data-carousel-next]").addEventListener("click", () => navigate(1));
  pauseButton.addEventListener("click", () => {
    paused = !paused;
    startAutoplay();
  });
  workCarousel.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      navigate(event.key === "ArrowLeft" ? -1 : 1);
    }
  });
  workCarousel.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") {
      hovered = true;
      stopAutoplay();
    }
  });
  workCarousel.addEventListener("pointerleave", () => {
    hovered = false;
    startAutoplay();
  });
  workCarousel.addEventListener("focusin", (event) => {
    // Keep keyboard navigation stable until the visitor explicitly presses Play.
    if (event.target !== pauseButton) paused = true;
    startAutoplay();
  });
  const viewport = workCarousel.querySelector(".carousel-viewport");
  viewport.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "touch") pointerStart = { x: event.clientX, y: event.clientY };
  });
  viewport.addEventListener("pointerup", (event) => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = undefined;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) navigate(dx < 0 ? 1 : -1);
  });
  viewport.addEventListener("pointercancel", () => { pointerStart = undefined; });
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) paused = true;
    startAutoplay();
  });
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    startAutoplay();
  });
  visibilityObserver.observe(workCarousel);
  document.addEventListener("visibilitychange", startAutoplay);
  workCarousel.querySelector(".carousel-controls").hidden = false;
  showSlide(0);
  startAutoplay();
}

const photoDialog = document.querySelector(".photo-dialog");
if (photoDialog && typeof photoDialog.showModal === "function") {
  const enlargedPhoto = photoDialog.querySelector("img");
  const caption = photoDialog.querySelector("figcaption");
  document.querySelectorAll("[data-result-photo]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const thumbnail = link.querySelector("img");
      enlargedPhoto.src = link.href;
      enlargedPhoto.alt = thumbnail.alt;
      caption.textContent = thumbnail.alt;
      photoDialog.showModal();
      document.body.classList.add("photo-open");
    });
  });
  photoDialog.addEventListener("close", () => document.body.classList.remove("photo-open"));
  photoDialog.addEventListener("click", (event) => {
    if (event.target !== photoDialog) return;
    const bounds = photoDialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      photoDialog.close();
    }
  });
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
