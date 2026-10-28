import { describe, it, expect } from "vitest";
import { buildUpstreamRequest } from "../src/main/ipc/cloud";

describe("buildUpstreamRequest", () => {
  it("elevenlabs: xi-api-key + base url + path", () => {
    const r = buildUpstreamRequest("elevenlabs", "/voices", "KEY", { method: "GET" });
    expect(r.url).toBe("https://api.elevenlabs.io/v1/voices");
    expect(r.method).toBe("GET");
    expect(r.headers["xi-api-key"]).toBe("KEY");
  });

  it("merges renderer-supplied non-secret headers and forwards the body", () => {
    const r = buildUpstreamRequest("elevenlabs", "/text-to-speech/voice", "KEY", {
      method: "POST",
      headers: { "content-type": "application/json", "xi-api-key": "injected" },
      body: "{}",
    });
    expect(r.headers["content-type"]).toBe("application/json");
    expect(r.headers["xi-api-key"]).toBe("KEY");
    expect(r.body).toBe("{}");
  });

  it("defaults method to GET when omitted", () => {
    const r = buildUpstreamRequest("elevenlabs", "/models", "KEY", {});
    expect(r.method).toBe("GET");
  });
});
