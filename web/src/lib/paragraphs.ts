// Mirrors lib/export/plaintext-exporter.mjs's grouping heuristic (kept in sync by hand — this is
// a small, stable piece of logic and the two contexts differ enough — DOM refs vs. plain string
// output — that sharing one module across the Vite/Node boundary wasn't worth the build-config
// cost). Merges consecutive short ASR/caption blocks into reading-length paragraphs so
// transcript.log reads like prose instead of one timestamp-prefixed clause per line, while
// keeping every original block's index reachable for jump-to-timestamp (see NotePage.tsx's
// blockRefs, which registers every block index in a group to the same DOM node).

interface BlockLike {
  index: number;
  source: string;
  start: number | null;
  end: number | null;
  text: string;
}

export interface ParagraphGroup {
  text: string;
  start: number | null;
  blockIndexes: number[];
}

const PARAGRAPH_CHAR_TARGET = 180;
const PARAGRAPH_GAP_SECONDS = 2.5;

/** A block has a "real" timeline position when its end is strictly after its start — xiaohongshu
 *  post-body/metadata blocks use start=end=0 as a "no timeline" sentinel (see
 *  xiaohongshu-extractor.mjs), which should never be merged by a time gap since it's not one. */
function hasRealTimeline(block: BlockLike): boolean {
  return block.start !== null && block.end !== null && block.end > block.start;
}

export function groupBlocksIntoParagraphs(blocks: BlockLike[]): ParagraphGroup[] {
  const groups: {
    source: string;
    texts: string[];
    blockIndexes: number[];
    charCount: number;
    start: number | null;
    lastEnd: number | null;
  }[] = [];
  let current: (typeof groups)[number] | null = null;

  for (const block of blocks) {
    const text = block.text.trim();
    if (!text) continue;

    const timed = hasRealTimeline(block);
    const canExtendCurrent = Boolean(
      timed
      && current
      && current.source === block.source
      && current.charCount < PARAGRAPH_CHAR_TARGET
      && current.lastEnd !== null
      && block.start !== null
      && (block.start - current.lastEnd) <= PARAGRAPH_GAP_SECONDS,
    );

    if (canExtendCurrent && current) {
      current.texts.push(text);
      current.blockIndexes.push(block.index);
      current.charCount += text.length;
      current.lastEnd = block.end;
    } else {
      current = {
        source: block.source,
        texts: [text],
        blockIndexes: [block.index],
        charCount: text.length,
        start: timed ? block.start : null,
        lastEnd: timed ? block.end : null,
      };
      groups.push(current);
    }
  }

  return groups.map((g) => ({ text: g.texts.join(''), start: g.start, blockIndexes: g.blockIndexes }));
}
