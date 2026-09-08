export const jsonHeaders = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
};

export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...jsonHeaders, ...init.headers },
  });
}

export function methodNotAllowed(allowed: string[]) {
  return json(
    { error: "METHOD_NOT_ALLOWED" },
    { status: 405, headers: { allow: allowed.join(", ") } },
  );
}

export async function readJson(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 20_000) throw new RequestError("PAYLOAD_TOO_LARGE", 413);
  try {
    const rawBody = await request.text();
    if (rawBody.length > 20_000) throw new RequestError("PAYLOAD_TOO_LARGE", 413);
    return JSON.parse(rawBody);
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("INVALID_JSON", 400);
  }
}

export class RequestError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof RequestError) {
    return json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return json({ error: "INTERNAL_ERROR" }, { status: 500 });
}
