import { z } from "zod";
import { RequestError } from "./http.js";

const cleanText = (min: number, max: number) => z.string().trim().min(min).max(max);

const serviceSelectionSchema = z.object({
  serviceId: z.uuid(),
  quantity: z.coerce.number().int().min(1).max(10),
});

const serviceSelectionsSchema = z.array(serviceSelectionSchema)
  .min(1)
  .max(12)
  .refine((services) => new Set(services.map((service) => service.serviceId)).size === services.length)
  .refine((services) => services.reduce((total, service) => total + service.quantity, 0) <= 12);

export const availabilityQuerySchema = z.object({
  services: serviceSelectionsSchema,
  date: z.iso.date(),
});

export const bookingSchema = z.object({
  services: serviceSelectionsSchema,
  startsAt: z.iso.datetime({ offset: true }),
  idempotencyKey: z.uuid(),
  customer: z.object({
    firstName: cleanText(1, 80),
    lastName: cleanText(1, 80),
    email: z.email().max(254),
    phone: cleanText(6, 40),
  }),
  address: z.object({
    line1: cleanText(3, 160),
    line2: z.string().trim().max(160).default(""),
    suburb: cleanText(2, 100),
    state: z.string().trim().toUpperCase().regex(/^[A-Z]{2,3}$/).default("SA"),
    postcode: z.string().trim().regex(/^\d{4}$/),
  }),
  notes: z.string().trim().max(1000).default(""),
  website: z.string().max(0).default(""),
});

export type BookingInput = z.infer<typeof bookingSchema>;

export const cancellationSchema = z.object({ token: z.string().min(32).max(200) });

export function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new RequestError("VALIDATION_ERROR", 400);
  }
  return result.data;
}
