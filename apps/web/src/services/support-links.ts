/**
 * Where people can chip in to keep Laamacut free. Empty for now: no donation
 * page is set up, so the Support buttons stay hidden until one is.
 */
export const DONATE_URL: string = "";

export const SOURCE_URL = "https://github.com/archnemasis/laamacut";
export const RELEASES_URL = `${SOURCE_URL}/releases`;
export const UPSTREAM_URL = "https://github.com/Augani/openreel-video";

/** OpenReel's MIT licence, which has to travel with every copy of the app. */
export const LICENSE_TEXT = `MIT License

Copyright (c) 2024-2026 Augustus Otu and Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

export const openLink = (url: string) => window.open(url, "_blank");
