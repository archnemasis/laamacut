import { describe, expect, it } from "vitest";
import { addCaptionEmoji, removeFillerWords, stripNonSpeech } from "./caption-text";

describe("caption text", () => {
  it("drops Whisper's sound notes but keeps the words", () => {
    expect(stripNonSpeech("[Music]")).toBe("");
    expect(stripNonSpeech("♪ we are the champions ♪")).toBe("we are the champions");
    expect(stripNonSpeech("(upbeat music) so today we're building")).toBe("so today we're building");
  });

  it("drops filler sounds and tidies the gaps they leave", () => {
    expect(removeFillerWords("Um, so I went, uh, to the shop")).toBe("so I went, to the shop");
    expect(removeFillerWords("It was, you know, really good hmm")).toBe("It was, really good");
    expect(removeFillerWords("Umbrella under the hummus")).toBe("Umbrella under the hummus");
  });

  it("adds one emoji when a word calls for it", () => {
    expect(addCaptionEmoji("that was so funny")).toBe("that was so funny 😂");
    expect(addCaptionEmoji("the stairs are here")).toBe("the stairs are here");
  });
});
