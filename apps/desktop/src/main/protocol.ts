import { protocol, net } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SCHEME = "app";

/**
 * The renderer only runs scripts bundled with the app. 'unsafe-eval' stays
 * because keyframe expressions compile with new Function, and online
 * features (text-to-speech, model downloads) need https connections.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "connect-src 'self' data: blob: https: wss:",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

export function registerAppSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

export function handleAppScheme(rendererRoot: string): void {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/" || pathname === "") pathname = "/index.html";
    if (pathname === "/motion") pathname = "/index.html";

    const root = path.normalize(rendererRoot);
    const resolved = path.normalize(path.join(root, pathname));
    const rel = path.relative(root, resolved);
    if (rel !== "" && (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel))) {
      return new Response("Forbidden", { status: 403 });
    }

    let response: Response;
    try {
      response = await net.fetch(pathToFileURL(resolved).toString());
    } catch {
      response = await net.fetch(pathToFileURL(path.join(rendererRoot, "index.html")).toString());
    }

    const headers = new Headers(response.headers);
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    headers.set("Cross-Origin-Resource-Policy", "same-origin");
    headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });
}

export const APP_ORIGIN = `${SCHEME}://openreel`;
export const APP_INDEX = `${APP_ORIGIN}/index.html`;
