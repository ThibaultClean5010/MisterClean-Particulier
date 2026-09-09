const button = document.querySelector("[data-cancel-button]");
const errorBox = document.querySelector("[data-cancel-error]");
const token = new URLSearchParams(location.search).get("token");

if (!token) {
  errorBox.textContent = "This cancellation link is invalid.";
  errorBox.hidden = false;
  button.disabled = true;
}

button.addEventListener("click", async () => {
  button.disabled = true;
  button.textContent = "Cancelling…";
  errorBox.hidden = true;
  try {
    const response = await fetch("/api/booking/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const result = await response.json();
    if (!response.ok) {
      const message = result.error === "CANCELLATION_TOO_LATE"
        ? "This booking is too close to its start time to cancel online. Please call us."
        : "This cancellation link is invalid or has expired.";
      throw new Error(message);
    }
    document.querySelector("[data-cancel-title]").textContent = "Booking cancelled";
    document.querySelector("[data-cancel-copy]").textContent = `Booking ${result.booking.reference} has been cancelled. A confirmation email is on its way.`;
    button.remove();
    history.replaceState({}, "", "/booking/cancel");
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    button.disabled = false;
    button.textContent = "Confirm cancellation";
  }
});
