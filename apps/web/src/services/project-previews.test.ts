import { describe, expect, it } from "vitest";
import type { Project } from "@openreel/core";
import { firstPictureUrl } from "./project-previews";

function project(tracks: unknown[], items: unknown[]): Project {
  return { timeline: { tracks }, mediaLibrary: { items } } as unknown as Project;
}

describe("firstPictureUrl", () => {
  it("uses the earliest video or image clip on the timeline", () => {
    const p = project(
      [
        { id: "t1", type: "video", clips: [{ mediaId: "late", startTime: 5 }] },
        { id: "t2", type: "image", clips: [{ mediaId: "early", startTime: 1 }] },
        { id: "t3", type: "audio", clips: [{ mediaId: "song", startTime: 0 }] },
      ],
      [
        { id: "late", thumbnailUrl: "data:late" },
        { id: "early", thumbnailUrl: "data:early", filmstripThumbnails: [{ timestamp: 0, url: "data:strip" }] },
        { id: "song", thumbnailUrl: "data:song" },
      ],
    );
    expect(firstPictureUrl(p)).toBe("data:strip");
  });

  it("returns null when the timeline has no pictures", () => {
    expect(firstPictureUrl(project([{ id: "t", type: "text", clips: [] }], []))).toBeNull();
  });
});
