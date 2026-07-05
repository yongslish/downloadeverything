// Renders a Canonical Document (see lib/core/canonical-document.mjs) into Obsidian-flavoured
// Markdown. Keep this dependency-free of the download/transcription layers — it only ever reads
// the canonical shape, never platform-specific fields.

function pad2(value) {
  return String(Math.floor(value)).padStart(2, '0');
}

/**
 * Format seconds as `mm:ss`, or `hh:mm:ss` once the duration reaches an hour, so a reader can
 * jump back to the exact moment in the source video a claim came from.
 */
export function formatTimestamp(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}`;
}

function yamlScalar(value) {
  if (value === null || value === undefined || value === '') return 'null';
  // JSON string escaping is a valid subset of YAML double-quoted scalar escaping, so this is a
  // safe way to keep titles/urls containing colons, quotes, etc. from breaking the frontmatter.
  return JSON.stringify(String(value));
}

function yamlStringArray(values) {
  const list = Array.isArray(values) ? values : [];
  return `[${list.map((value) => JSON.stringify(String(value))).join(', ')}]`;
}

function renderFrontmatter(document) {
  const lines = [
    '---',
    `title: ${yamlScalar(document.title)}`,
    'author:',
    `  name: ${yamlScalar(document.author?.name)}`,
    `  id: ${yamlScalar(document.author?.id)}`,
    'source:',
    `  platform: ${yamlScalar(document.source?.platform)}`,
    `  url: ${yamlScalar(document.source?.url)}`,
    `  contentType: ${yamlScalar(document.source?.contentType)}`,
    `publishedAt: ${yamlScalar(document.publishedAt)}`,
    `createdAt: ${yamlScalar(document.createdAt)}`,
    `tags: ${yamlStringArray(document.tags)}`,
    'extraction:',
    `  stagesAttempted: ${yamlStringArray(document.extraction?.stagesAttempted)}`,
    `  stagesUsed: ${yamlStringArray(document.extraction?.stagesUsed)}`,
    `  asrProvider: ${yamlScalar(document.extraction?.asrProvider)}`,
    '---',
  ];
  return lines.join('\n');
}

/**
 * Render one content block. Time-anchored blocks (native-caption/asr) get a `**[mm:ss]**`
 * marker so a claim can be traced back to a moment in the source. OCR blocks are called out as
 * an image-derived blockquote so they never get silently blended in as the author's own words.
 */
function renderBlock(block) {
  const text = block.text;

  if (block.source === 'ocr') {
    const marker = block.start !== null ? `**[${formatTimestamp(block.start)}]** ` : '';
    return `> 📷 ${marker}图片文字：${text}`;
  }

  if (block.source === 'native-caption' || block.source === 'asr') {
    if (block.start !== null) {
      return `**[${formatTimestamp(block.start)}]** ${text}`;
    }
    return text;
  }

  // 'post-body' / 'metadata'
  return text;
}

/**
 * Render the LLM-synthesized learning-note summary (see lib/llm/deepseek-provider.mjs),
 * mirroring the result page's left pane: 一句话总结 / 核心观点(每条带跳转时间戳) / 行动建议.
 * Returns '' when there's no summary yet, so callers can skip the section entirely instead of
 * emitting an empty "## 学习笔记" heading.
 */
function renderSummarySection(document) {
  const summary = document.summary;
  if (!summary?.summary) return '';

  const lines = ['## 学习笔记', '', '### 一句话总结', '', summary.summary, ''];

  if (summary.keyPoints?.length) {
    lines.push('### 核心观点', '');
    for (const point of summary.keyPoints) {
      const marker = point.start !== null && point.start !== undefined ? ` **[${formatTimestamp(point.start)}]**` : '';
      lines.push(`- ${point.text}${marker}`);
    }
    lines.push('');
  }

  if (summary.actionItems?.length) {
    lines.push('### 行动建议', '');
    for (const item of summary.actionItems) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function renderImagesSection(images) {
  if (!images.length) return '';
  const items = images.map((image) => {
    const label = image.path || `image-${image.index}`;
    if (image.ocrText) {
      return `${image.index + 1}. \`${label}\`\n   - 图片文字：${image.ocrText}`;
    }
    return `${image.index + 1}. \`${label}\``;
  });
  return `## 图片\n\n${items.join('\n')}`;
}

/**
 * Render a Canonical Document to an Obsidian-compatible Markdown string: YAML frontmatter
 * carrying provenance (so a reader can judge whether to trust the note), an H1 title, the
 * content blocks in order, and an optional image gallery.
 */
export function renderCanonicalDocumentToMarkdown(document) {
  const sections = [
    renderFrontmatter(document),
    '',
    `# ${document.title}`,
    '',
    document.blocks.map(renderBlock).join('\n\n'),
  ];

  const summarySection = renderSummarySection(document);
  if (summarySection) {
    sections.push('', summarySection);
  }

  const imagesSection = renderImagesSection(document.images || []);
  if (imagesSection) {
    sections.push('', imagesSection);
  }

  return `${sections.join('\n')}\n`;
}

export function sanitizeFilenameStem(value) {
  const text = typeof value === 'string' ? value : '';
  const withoutControls = text.replace(/[\x00-\x1f<>:"/\\|?*]+/g, ' ').trim();
  return (withoutControls || 'untitled-note').slice(0, 80).replace(/\s+/g, ' ');
}

/** Derive a filesystem-safe `.md` filename from the document title. */
export function documentFilename(document) {
  return `${sanitizeFilenameStem(document?.title)}.md`;
}
