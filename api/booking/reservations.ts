import { createBooking } from "../../lib/server/create-booking.js";
import { errorResponse, json, methodNotAllowed, readJson, RequestError } from "../../lib/server/http.js";
import { bookingSchema, parseOrThrow } from "../../lib/server/validation.js";

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    try {
      const body = parseOrThrow(bookingSchema, await readJson(request));
      if (body.website) throw new RequestError("INVALID_REQUEST", 400);
      const booking = await createBooking(body);
      return json({ booking }, { status: 201 });
    } catch (error) {
      return errorResponse(error);
    }
  },
};
