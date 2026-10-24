import {
  siFacebook,
  siInstagram,
  siSnapchat,
  siTiktok,
  siTwitch,
  siVimeo,
  siX,
  siYoutube,
  siYoutubeshorts,
  type SimpleIcon,
} from "simple-icons";

/** The apps each canvas ratio suits, shown in the editor's ratio menu. */
export const APPS_BY_RATIO: Record<string, SimpleIcon[]> = {
  "16:9": [siYoutube, siTwitch, siVimeo, siX],
  "9:16": [siTiktok, siYoutubeshorts, siInstagram, siSnapchat],
  "1:1": [siInstagram, siFacebook, siX],
  "4:5": [siInstagram, siFacebook],
};

export function AppIcon({ icon, size = 13 }: { icon: SimpleIcon; size?: number }) {
  // Black brand marks (TikTok, X) follow the text color so they stay visible in dark mode.
  const fill = icon.hex === "000000" ? "currentColor" : `#${icon.hex}`;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={icon.title}>
      <title>{icon.title}</title>
      <path d={icon.path} fill={fill} />
    </svg>
  );
}
