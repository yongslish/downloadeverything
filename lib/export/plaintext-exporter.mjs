// Renders a Canonical Document into clean, paragraph-broken plain text — no timestamps, no LLM
// summary, just the readable original content. This exists because the default .md export always
// interleaves a **[mm:ss]** marker before every block, and blocks are themselves short VAD/ASR
// segmentation chunks (one clause, not a sentence) — great for click-to-jump traceability, bad for
// reading straight through. Some users just want to paste the transcript somewhere else and read
// it like an article (docs/product-requirements.md's target user includes exactly this: "把访谈、
// 播客中的关键观点导入 Obsidian" — reading flow matters as much as traceability there).
//
// Keep this dependency-free of the download/transcription layers — it only ever reads the
// canonical shape, like markdown-exporter.mjs.

const PARAGRAPH_CHAR_TARGET = 180;
const PARAGRAPH_GAP_SECONDS = 2.5;

/**
 * A block has a "real" timeline position when its end is strictly after its start. Xiaohongshu
 * image-text extractors tag post-body/metadata blocks with start=end=0 as a "no timeline" sentinel
 * (see lib/content/extractors/xiaohongshu-extractor.mjs) — those should never be merged by a time
 * gap, they're already a full paragraph on their own.
 */
function hasRealTimeline(block) {
  return block.start !== null && block.end !== null && block.end > block.start;
}

/**
 * Merge consecutive same-source blocks with a real timeline into reading-length paragraphs,
 * breaking on either a character budget or a pause long enough to suggest a topic change. Blocks
 * without a real timeline (image-text post body, metadata) are never merged with anything —
 * they're already complete units.
 */
export function groupBlocksIntoParagraphs(blocks) {
  const groups = [];
  let current = null;

  for (const block of blocks) {
    const text = String(block.text || '').trim();
    if (!text) continue;

    const timed = hasRealTimeline(block);
    const canExtendCurrent = timed
      && current
      && current.source === block.source
      && current.charCount < PARAGRAPH_CHAR_TARGET
      && (block.start - current.lastEnd) <= PARAGRAPH_GAP_SECONDS;

    if (canExtendCurrent) {
      current.texts.push(text);
      current.charCount += text.length;
      current.lastEnd = block.end;
    } else {
      current = {
        source: block.source,
        texts: [text],
        charCount: text.length,
        start: timed ? block.start : null,
        lastEnd: timed ? block.end : null,
      };
      groups.push(current);
    }
  }

  return groups.map((g) => ({ text: g.texts.join(''), start: g.start }));
}

/**
 * Render a Canonical Document as clean plain text: title, a one-line byline, then paragraphs
 * separated by a blank line. No timestamps, no markdown syntax, no YAML frontmatter.
 */
export function renderCanonicalDocumentToPlainText(document) {
  const lines = [document.title || '未命名笔记'];
  const byline = [document.source?.platform, document.author?.name].filter(Boolean).join(' · ');
  if (byline) lines.push(byline);
  lines.push('');

  const paragraphs = groupBlocksIntoParagraphs(document.blocks || []);
  lines.push(paragraphs.map((p) => p.text).join('\n\n'));

  return `${lines.join('\n').trimEnd()}\n`;
}
