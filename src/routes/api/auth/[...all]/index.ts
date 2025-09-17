import type { RequestHandler } from "@builder.io/qwik-city";
import { auth } from "~/lib/auth";

export const onRequest: RequestHandler = async (event) => {
  const response = await auth.handler(event.request);
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    headers.append(key, value);
  });

  const body = response.body ? await response.arrayBuffer() : undefined;
  const safeResponse = new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });

  event.send(safeResponse);
};
