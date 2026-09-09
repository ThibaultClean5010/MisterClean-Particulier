import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequestError } from "../lib/server/http.js";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  createBooking: vi.fn(),
}));

vi.mock("../lib/server/admin-auth.js", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("../lib/server/create-booking.js", () => ({ createBooking: mocks.createBooking }));

import handler from "../api/admin/bookings.js";

const validBooking = {
  services: [{ serviceId: "11111111-1111-4111-8111-111111111111", quantity: 2 }],
  startsAt: "2026-09-10T09:00:00+09:30",
  idempotencyKey: "22222222-2222-4222-8222-222222222222",
  customer: {
    firstName: "Alex",
    lastName: "Smith",
    email: "alex@example.com",
    phone: "0412345678",
  },
  address: {
    line1: "1 King William Street",
    line2: "",
    suburb: "Adelaide",
    state: "SA",
    postcode: "5000",
  },
  notes: "Manual admin booking",
  website: "",
};

function post(body: unknown) {
  return new Request("https://example.com/api/admin/bookings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("manual admin booking", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset().mockResolvedValue({ email: "admin@example.com" });
    mocks.createBooking.mockReset().mockResolvedValue({ id: "booking-id", reference: "MC-TEST1234" });
  });

  it("requires an authenticated administrator", async () => {
    mocks.requireAdmin.mockRejectedValue(new RequestError("UNAUTHORIZED", 401));
    const response = await handler.fetch(post(validBooking));
    expect(response.status).toBe(401);
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });

  it("creates a validated booking through the shared booking service", async () => {
    const response = await handler.fetch(post(validBooking));
    expect(response.status).toBe(201);
    expect(mocks.createBooking).toHaveBeenCalledWith(expect.objectContaining({
      services: validBooking.services,
      customer: expect.objectContaining({ email: "alex@example.com" }),
    }));
    await expect(response.json()).resolves.toMatchObject({ booking: { reference: "MC-TEST1234" } });
  });

  it("rejects invalid customer details before creating a booking", async () => {
    const response = await handler.fetch(post({ ...validBooking, customer: { ...validBooking.customer, email: "invalid" } }));
    expect(response.status).toBe(400);
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });
});
