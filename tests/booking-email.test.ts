import { afterEach, describe, expect, it } from "vitest";
import { renderBookingEmail } from "../lib/server/emails/booking-email.js";

const booking = {
  reference: "MC-TEST1234",
  service_name: "Sofa up to 3 seats, Rug",
  starts_at: "2026-09-14T07:00:00+09:30",
  price_label: "$110",
  customer_first_name: "Test",
  address_line1: "1 King William Street",
  suburb: "Adelaide",
  state: "SA",
  postcode: "5000",
};

const originalVercelEnv = process.env.VERCEL_ENV;
const originalVercelUrl = process.env.VERCEL_URL;

afterEach(() => {
  process.env.VERCEL_ENV = originalVercelEnv;
  process.env.VERCEL_URL = originalVercelUrl;
});

describe("booking confirmation cancellation URL", () => {
  it.each(["booking_customer_confirmation", "booking_customer_cancellation"])(
    "uses the company logo in the %s email header",
    (template) => {
      const email = renderBookingEmail(
        template,
        booking,
        { cancellation_token: "secret-token" },
        "https://misterclean.com.au/",
      );

      expect(email.html).toContain('src="https://misterclean.com.au/Images/logo.webp"');
      expect(email.html).toContain('alt="MisterClean Services"');
      expect(email.html).not.toContain('<strong style="font-size:24px">MisterClean</strong>');
    },
  );

  it("lists all selected services", () => {
    const email = renderBookingEmail(
      "booking_customer_confirmation",
      booking,
      { cancellation_token: "secret-token" },
      "https://misterclean.com.au",
    );

    expect(email.html).toContain("Sofa up to 3 seats, Rug");
  });

  it("uses the current deployment URL on Vercel previews", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_URL = "misterclean-preview.vercel.app";

    const email = renderBookingEmail(
      "booking_customer_confirmation",
      booking,
      { cancellation_token: "secret-token" },
      "https://misterclean.com.au",
    );

    expect(email.html).toContain(
      "https://misterclean-preview.vercel.app/booking/cancel?token=secret-token",
    );
  });

  it("uses the configured public site URL outside previews", () => {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_URL = "ignored.vercel.app";

    const email = renderBookingEmail(
      "booking_customer_confirmation",
      booking,
      { cancellation_token: "secret-token" },
      "https://misterclean.com.au",
    );

    expect(email.html).toContain(
      "https://misterclean.com.au/booking/cancel?token=secret-token",
    );
  });
});
