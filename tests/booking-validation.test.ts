import { describe, expect, it } from "vitest";
import { availabilityQuerySchema, bookingSchema, cancellationSchema } from "../lib/server/validation.ts";

const validBooking = {
  services: [
    { serviceId: "11111111-1111-4111-8111-111111111111", quantity: 2 },
    { serviceId: "33333333-3333-4333-8333-333333333333", quantity: 1 },
  ],
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
  notes: "",
  website: "",
};

describe("booking request validation", () => {
  it("accepts a complete Adelaide booking", () => {
    expect(bookingSchema.safeParse(validBooking).success).toBe(true);
  });

  it("rejects a malformed email", () => {
    const input = structuredClone(validBooking);
    input.customer.email = "not-an-email";
    expect(bookingSchema.safeParse(input).success).toBe(false);
  });

  it("rejects a postcode that is not four digits", () => {
    const input = structuredClone(validBooking);
    input.address.postcode = "500";
    expect(bookingSchema.safeParse(input).success).toBe(false);
  });

  it("rejects the honeypot when populated", () => {
    const input = structuredClone(validBooking);
    input.website = "https://spam.example";
    expect(bookingSchema.safeParse(input).success).toBe(false);
  });

  it("requires at least one service", () => {
    const input = structuredClone(validBooking);
    input.services = [];
    expect(bookingSchema.safeParse(input).success).toBe(false);
  });

  it("rejects duplicate services", () => {
    const input = structuredClone(validBooking);
    input.services = [validBooking.services[0], validBooking.services[0]];
    expect(bookingSchema.safeParse(input).success).toBe(false);
  });

  it("rejects a quantity greater than ten for one service", () => {
    const input = structuredClone(validBooking);
    input.services[0].quantity = 11;
    expect(bookingSchema.safeParse(input).success).toBe(false);
  });

  it("rejects more than twelve total service items", () => {
    const input = structuredClone(validBooking);
    input.services[0].quantity = 10;
    input.services[1].quantity = 3;
    expect(bookingSchema.safeParse(input).success).toBe(false);
  });

  it("requires a dated availability query", () => {
    const result = availabilityQuerySchema.safeParse({
      services: validBooking.services,
      date: "2026-09-10",
    });
    expect(result.success).toBe(true);
  });

  it("requires a sufficiently long cancellation token", () => {
    expect(cancellationSchema.safeParse({ token: "short" }).success).toBe(false);
  });
});
