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

// New projects only choose a canvas shape. Resolution, frame rate and bitrate
// are picked at export, so every shape starts at 1080p and 30 fps.

export interface ProjectFormat {
  id: "vertical" | "horizontal" | "square" | "portrait";
  label: string;
  ratio: string;
  width: number;
  height: number;
  frameRate: number;
  apps: SimpleIcon[];
}

export const PROJECT_FORMATS: ProjectFormat[] = [
  {
    id: "vertical",
    label: "Vertical",
    ratio: "9:16",
    width: 1080,
    height: 1920,
    frameRate: 30,
    apps: [siTiktok, siYoutubeshorts, siInstagram, siSnapchat],
  },
  {
    id: "horizontal",
    label: "Horizontal",
    ratio: "16:9",
    width: 1920,
    height: 1080,
    frameRate: 30,
    apps: [siYoutube, siTwitch, siVimeo, siX],
  },
  {
    id: "square",
    label: "Square",
    ratio: "1:1",
    width: 1080,
    height: 1080,
    frameRate: 30,
    apps: [siInstagram, siFacebook, siX],
  },
  {
    id: "portrait",
    label: "Portrait",
    ratio: "4:5",
    width: 1080,
    height: 1350,
    frameRate: 30,
    apps: [siInstagram, siFacebook],
  },
];
