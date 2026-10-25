/** Whisper's notes about sounds rather than words: [Music], (laughs), ♪ ... ♪. */
const NON_SPEECH = /\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|[♪♫]+|🎵|🎶/gu;

/** Keep only the words that were said, dropping "[Music]"-style notes. */
export function stripNonSpeech(text: string): string {
  return text.replace(NON_SPEECH, " ").replace(/\s{2,}/g, " ").replace(/^[\s,.-]+/, "").trim();
}

/** Sounds people make while thinking, dropped by "Identify filler words". */
const FILLERS = /(^|[\s,.!?])(?:um+|uh+|uhm+|umm+|erm+|er|ah+|hmm+|mhm|mm+|you know)(?=$|[\s,.!?])[,.]?/gi;

/** Take the "um"s and "uh"s out of a caption, keeping the rest as it was said. */
export function removeFillerWords(text: string): string {
  return text
    .replace(FILLERS, "$1")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/^[\s,.]+/, "")
    .replace(/,\s*,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Words that earn an emoji, checked in order; the first match wins. */
const EMOJI_WORDS: readonly [RegExp, string][] = [
  [/\b(lol|haha+|funny|laugh\w*|hilarious|joke)\b/i, "😂"],
  [/\b(love|heart|cute|adorable)\b/i, "❤️"],
  [/\b(fire|lit|insane|crazy|hot)\b/i, "🔥"],
  [/\b(money|cash|rich|dollars?|paid|robux)\b/i, "💰"],
  [/\b(wow|omg|whoa|shocked|what)\b/i, "😮"],
  [/\b(sad|cry\w*|miss|sorry)\b/i, "😢"],
  [/\b(angry|mad|hate)\b/i, "😡"],
  [/\b(win|won|winner|victory|first)\b/i, "🏆"],
  [/\b(game|gaming|play\w*|level)\b/i, "🎮"],
  [/\b(music|song|sing\w*|beat)\b/i, "🎵"],
  [/\b(food|eat\w*|hungry|pizza|delicious)\b/i, "🍕"],
  [/\b(cool|nice|awesome|amazing|great)\b/i, "😎"],
  [/\b(think\w*|idea|maybe|wonder)\b/i, "🤔"],
  [/\b(scary|scared|spooky|ghost|halloween)\b/i, "👻"],
  [/\b(yes|yeah|okay|ok|done)\b/i, "👍"],
];

/** Add one fitting emoji to the end of a caption, when a word calls for it. */
export function addCaptionEmoji(text: string): string {
  const match = EMOJI_WORDS.find(([pattern]) => pattern.test(text));
  return match ? `${text} ${match[1]}` : text;
}
