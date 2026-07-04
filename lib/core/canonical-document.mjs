// Shared contract for turning a resolved platform post/video into one traceable document.
// Content extractors (bilibili/xiaohongshu), exporters (markdown/obsidian) and the notebook
// store all read/write this shape — do not let any of them invent their own ad hoc fields.

const BLOCK_SOURCES = ['native-caption', 'post-body', 'ocr', 'asr', 'metadata'];

function normaliseBlock(block, index) {
  const text = String(block?.text || '').trim();
  if (!text) return null;
  const source = BLOCK_SOURCES.includes(block?.source) ? block.source : 'metadata';
  const start = Number.isFinite(Number(block?.start)) ? Math.max(0, Number(block.start)) : null;
  const requestedEnd = Number(block?.end);
  const end = start !== null && Number.isFinite(requestedEnd) ? Math.max(start, requestedEnd) : null;
  return {
    index,
    type: 'text',
    source,
    start,
    end,
    text,
    imageIndex: Number.isInteger(block?.imageIndex) ? block.imageIndex : null,
  };
}

function normaliseImage(image, index) {
  return {
    index,
    path: String(image?.path || ''),
    ocrText: String(image?.ocrText || '').trim(),
  };
}

/**
 * Build a Canonical Document from whatever a content extractor collected.
 *
 * input.blocks: ordered text blocks with provenance (see BLOCK_SOURCES). This is what makes
 * a summary traceable later — every block keeps where it came from and, for video timelines,
 * its start/end so a claim can be pointed back at a timestamp or an image.
 */
export function createCanonicalDocument({
  id,
  source,
  title,
  author,
  publishedAt,
  tags,
  metrics,
  blocks,
  images,
  extraction,
}) {
  const normalisedImages = Array.isArray(images) ? images.map(normaliseImage) : [];
  const normalisedBlocks = (Array.isArray(blocks) ? blocks : [])
    .map(normaliseBlock)
    .filter(Boolean)
    .map((block, index) => ({ ...block, index }));

  if (!normalisedBlocks.length) {
    throw new Error('Canonical Document 至少需要一个非空文本块。');
  }

  // Extractors sometimes carry extra platform-specific diagnostics (e.g. xiaohongshu's
  // noteType/postTextThin, bilibili's per-stage detail). Spread those through instead of
  // silently dropping them, but always normalise the three fields every downstream consumer
  // (markdown exporter, notebook history) is guaranteed to find.
  const extraSource = source && typeof source === 'object' ? source : {};
  const extraExtraction = extraction && typeof extraction === 'object' ? extraction : {};

  return {
    schemaVersion: 1,
    id: String(id || ''),
    source: {
      ...extraSource,
      platform: String(source?.platform || ''),
      url: String(source?.url || ''),
      contentType: String(source?.contentType || ''),
    },
    title: String(title || '').trim(),
    author: {
      name: String(author?.name || '').trim(),
      id: String(author?.id || '').trim(),
    },
    publishedAt: source?.publishedAt || publishedAt || null,
    tags: Array.isArray(tags) ? tags.filter((tag) => typeof tag === 'string' && tag.trim()) : [],
    metrics: metrics && typeof metrics === 'object' ? metrics : {},
    blocks: normalisedBlocks,
    images: normalisedImages,
    extraction: {
      ...extraExtraction,
      stagesAttempted: Array.isArray(extraction?.stagesAttempted) ? extraction.stagesAttempted : [],
      stagesUsed: Array.isArray(extraction?.stagesUsed) ? extraction.stagesUsed : [],
      asrProvider: extraction?.asrProvider || null,
    },
    createdAt: new Date().toISOString(),
  };
}

export function fullText(document) {
  return document.blocks.map((block) => block.text).join('\n');
}

export { BLOCK_SOURCES };
