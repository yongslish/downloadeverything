// Client-side URL sniffer. Mirrors the domain check in lib/download/url.mjs
// so we can flip HP-03 (invalid) purely from what's typed, without asking the
// server. The server still does the authoritative parse on submit — this only
// drives the pill highlight, red border and DownBot swap.

const BILIBILI_HOSTS = /^(?:www\.|m\.)?bilibili\.com$|^b23\.tv$/i;
const XIAOHONGSHU_HOSTS = /^(?:www\.)?xiaohongshu\.com$|^xhslink\.com$|\.xhscdn\.com$/i;

export type Platform = 'bilibili' | 'xiaohongshu' | null;

/** Returns the recognized platform for a URL string, or null if we can't tell.
 *  Empty / not-yet-a-URL strings are also null (callers treat null as "neutral"
 *  before the user has typed enough). */
export function detectPlatform(raw: string): Platform {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Accept bare host+path too — user might paste "b23.tv/xxx" without scheme.
  const candidate = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let host: string;
  try {
    host = new URL(candidate).hostname;
  } catch {
    return null;
  }
  if (BILIBILI_HOSTS.test(host)) return 'bilibili';
  if (XIAOHONGSHU_HOSTS.test(host)) return 'xiaohongshu';
  return null;
}

/** True when the user has typed *something* but it doesn't look like a
 *  supported link. Drives the HP-03 red state. */
export function isInvalidUrl(raw: string): boolean {
  return raw.trim().length > 0 && detectPlatform(raw) === null;
}

/** Ensure the URL sent to the server has an https:// scheme. The server's
 *  parseSupportedUrl() requires a valid URL string and returns "链接格式不
 *  正确" if the user pasted a bare host+path like www.bilibili.com/video/…. */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
