import * as log from "./logger.ts";
import { Context } from "https://deno.land/x/oak@v12.6.1/context.ts";
import { type Next } from "https://deno.land/x/oak@v12.6.1/middleware.ts";

// Static file server for Deno
export async function staticServer(context: Context, next: Next) {
  try {
    context.response.headers.set(
      "Cache-Control",
      "no-cache, no-store, must-revalidate",
    );
    context.response.headers.set("Pragma", "no-cache");
    context.response.headers.set("Expires", "0");

    const pathname = context.request.url.pathname;
    const root = `${Deno.cwd()}/public`;

    if (pathname === "/" || pathname === "") {
      await context.send({ root, path: "indexx.html" });
    } else {
      await context.send({ root, path: pathname.slice(1) });
    }
  } catch (error) {
    console.error("Static file error:", error);
    await next();
  }
}

export function createExitSignal() {
  const exitController = new AbortController();
  Deno.addSignalListener("SIGINT", () => {
    log.warn("Received SIGINT, exiting.");
    exitController.abort();
    Deno.exit();
  });
  return exitController.signal;
}
