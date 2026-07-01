export const xhsMediaDomains = ['xhscdn.com', 'xhscdn.net', 'ci.xiaohongshu.com'];

export const supportedDomains = [
  { domains: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'], name: 'YouTube' },
  { domains: ['bilibili.com', 'b23.tv'], name: 'Bilibili' },
  { domains: ['douyin.com', 'iesdouyin.com'], name: '抖音' },
  { domains: ['xiaohongshu.com', 'xhslink.com', 'rednote.com'], name: '小红书' },
];

export function matchesDomain(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function extractFirstUrlCandidate(value) {
  const text = String(value || '').trim();
  const match = text.match(/https:\/\/[^\s<>"'，。；！？、【】《》（）()]+/i);
  return match?.[0]?.replace(/[.,;!?]+$/u, '') || text;
}

export function isTestMediaUrl(url) {
  if (process.env.NODE_ENV !== 'test' || !process.env.XHS_TEST_MEDIA_ORIGIN) return false;
  try {
    return url.origin === new URL(process.env.XHS_TEST_MEDIA_ORIGIN).origin;
  } catch {
    return false;
  }
}

export function matchesAllowedXhsCdn(hostname) {
  return xhsMediaDomains.some((domain) => matchesDomain(hostname, domain));
}

export function normaliseXhsMediaUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4_096) return null;
  try {
    const url = new URL(value);
    const isProductionCdn = ['http:', 'https:'].includes(url.protocol) && matchesAllowedXhsCdn(url.hostname.toLowerCase());
    if (!isProductionCdn && !isTestMediaUrl(url)) return null;
    if (isProductionCdn && url.protocol === 'http:') url.protocol = 'https:';
    return url.toString();
  } catch {
    return null;
  }
}

export function parseSupportedUrl(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_048) {
    throw new Error('请输入一个有效的链接。');
  }

  let url;
  try {
    url = new URL(extractFirstUrlCandidate(value));
  } catch {
    throw new Error('链接格式不正确。');
  }

  if (url.username || url.password) {
    throw new Error('仅支持安全的 HTTPS 公开链接。');
  }

  const normalisedXhsMediaUrl = normaliseXhsMediaUrl(url.toString());
  if (normalisedXhsMediaUrl) {
    return { href: normalisedXhsMediaUrl, platform: '小红书媒体' };
  }

  const isLocalTestMedia = isTestMediaUrl(url);
  if (url.protocol !== 'https:' && !isLocalTestMedia) {
    throw new Error('仅支持安全的 HTTPS 公开链接。');
  }

  const host = url.hostname.toLowerCase();
  const source = supportedDomains.find(({ domains }) => domains.some((domain) => matchesDomain(host, domain)));
  if (!source) {
    throw new Error('目前仅支持 YouTube、Bilibili、抖音和小红书的公开链接。');
  }

  return { href: url.href, platform: source.name };
}
