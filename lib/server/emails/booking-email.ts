type Booking = Record<string, unknown>;

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: unknown) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Adelaide",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(String(value)));
}

function resolvePublicSiteUrl(configuredUrl: string) {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return configuredUrl;
}

function layout(title: string, body: string, publicSiteUrl: string) {
  const logoUrl = `${publicSiteUrl.replace(/\/+$/, "")}/Images/logo.webp`;
  return `<!doctype html><html><body style="margin:0;background:#eef6f8;font-family:Arial,sans-serif;color:#10232d"><div style="max-width:620px;margin:0 auto;padding:32px 18px"><div style="background:#fff;border-bottom:6px solid #8ee600;padding:20px 24px"><img src="${escapeHtml(logoUrl)}" width="230" alt="MisterClean Services" style="display:block;width:230px;max-width:100%;height:auto;border:0"></div><div style="background:#fff;padding:28px;border:1px solid #c8d9e1"><h1 style="font-size:25px;margin:0 0 22px">${escapeHtml(title)}</h1>${body}</div></div></body></html>`;
}

function details(booking: Booking) {
  return `<table style="width:100%;border-collapse:collapse">
    <tr><td style="padding:8px 0;color:#516671">Reference</td><td style="padding:8px 0;text-align:right"><strong>${escapeHtml(booking.reference)}</strong></td></tr>
    <tr><td style="padding:8px 0;color:#516671">Services</td><td style="padding:8px 0;text-align:right">${escapeHtml(booking.service_name)}</td></tr>
    <tr><td style="padding:8px 0;color:#516671">Date</td><td style="padding:8px 0;text-align:right">${escapeHtml(formatDate(booking.starts_at))}</td></tr>
    <tr><td style="padding:8px 0;color:#516671">Price</td><td style="padding:8px 0;text-align:right">${escapeHtml(booking.price_label ?? "Confirmed separately")}</td></tr>
    <tr><td style="padding:8px 0;color:#516671">Payment</td><td style="padding:8px 0;text-align:right">After the service</td></tr>
  </table>`;
}

export function renderBookingEmail(
  template: string,
  booking: Booking,
  payload: Record<string, unknown>,
  publicSiteUrl: string,
) {
  const customerName = escapeHtml(booking.customer_first_name);
  const address = escapeHtml(`${booking.address_line1}, ${booking.suburb} ${booking.state} ${booking.postcode}`);
  const resolvedSiteUrl = resolvePublicSiteUrl(publicSiteUrl);

  if (template === "booking_customer_confirmation") {
    const cancellationUrl = `${resolvedSiteUrl.replace(/\/+$/, "")}/booking/cancel?token=${encodeURIComponent(String(payload.cancellation_token))}`;
    return {
      subject: `Booking confirmed — ${booking.reference}`,
      html: layout("Your cleaning is booked", `<p>Hi ${customerName},</p><p>Your MisterClean booking is confirmed.</p>${details(booking)}<p style="margin-top:24px">Address: ${address}</p><p style="margin-top:26px"><a href="${escapeHtml(cancellationUrl)}" style="color:#07516e">Cancel this booking</a></p>`, resolvedSiteUrl),
    };
  }

  if (template === "booking_business_notification") {
    return {
      subject: `New booking ${booking.reference} — ${booking.service_name}`,
      html: layout("New booking", `${details(booking)}<p><strong>Customer:</strong> ${customerName} ${escapeHtml(booking.customer_last_name)}<br><strong>Email:</strong> ${escapeHtml(booking.customer_email)}<br><strong>Phone:</strong> ${escapeHtml(booking.customer_phone)}<br><strong>Address:</strong> ${address}<br><strong>Notes:</strong> ${escapeHtml(booking.notes || "None")}</p>`, resolvedSiteUrl),
    };
  }

  const businessCancellation = template === "booking_business_cancellation";
  return {
    subject: `Booking cancelled — ${booking.reference}`,
    html: layout("Booking cancelled", `<p>${businessCancellation ? "The customer booking" : `Hi ${customerName}, your booking`} <strong>${escapeHtml(booking.reference)}</strong> has been cancelled.</p>${details(booking)}`, resolvedSiteUrl),
  };
}
