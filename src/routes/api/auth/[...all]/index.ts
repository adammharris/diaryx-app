import type { RequestHandler } from "@builder.io/qwik-city";
import { getAuth } from "~/lib/auth";

export const onRequest: RequestHandler = async (event) => {
  try {
    const auth = getAuth(event);
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
  } catch (error) {
    console.error("Auth request failed", error);
    event.send(
      new Response(
        JSON.stringify({
          error: {
            message:
              error instanceof Error ? error.message : "Unexpected error while handling auth.",
          },
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        }
      )
    );
  }
};

export const config = {
  runtime: "nodejs22.x",
};
