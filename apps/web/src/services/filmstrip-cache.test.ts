import { beforeEach, describe, expect, it, vi } from "vitest";

const saved = vi.hoisted(() => new Map<string, unknown>());
vi.mock("idb-keyval", () => ({
  createStore: () => ({}),
  get: async (key: string) => saved.get(key),
  set: async (key: string, value: unknown) => void saved.set(key, value),
  del: async (key: string) => void saved.delete(key),
}));

import { loadFilmstrip } from "./filmstrip-cache";

const frames = [{ timestamp: 0.5, url: "data:image/jpeg;base64,AAAA" }];

describe("filmstrip cache", () => {
  beforeEach(() => {
    saved.clear();
    localStorage.clear();
  });

  it("makes a filmstrip once and reads it back from the phone after that", async () => {
    const make = vi.fn(async () => frames);
    expect(await loadFilmstrip("content://v/1", make)).toEqual(frames);
    await vi.waitFor(() => expect(saved.has("content://v/1")).toBe(true));
    expect(await loadFilmstrip("content://v/1", make)).toEqual(frames);
    expect(make).toHaveBeenCalledTimes(1);
  });

  it("saves nothing when no frames could be made", async () => {
    expect(await loadFilmstrip("content://v/2", async () => { throw new Error("bad file"); })).toEqual([]);
    expect(saved.size).toBe(0);
  });
});
