// Persistent local library of generated Canonical Documents ("笔记"/study notes).
//
// Unlike lib/core/artifact-store.mjs (30-minute, auto-expiring job scratch space), everything
// written here is meant to stick around indefinitely so a "paste a link, get a note" action
// leaves behind a browsable history instead of a one-shot, throwaway file. Plain filesystem,
// no database, no external infra — same style as ArtifactStore.
//
// Layout under baseDir:
//   <baseDir>/index.json          lightweight manifest: [{ id, title, author, platform, url, tags, createdAt }, ...]
//   <baseDir>/<id>/document.json  full Canonical Document (see lib/core/canonical-document.mjs)
//   <baseDir>/<id>/note.md        rendered markdown, if one was supplied at save() time
//
// get(id) / remove(id) THROW on an unknown id (they never resolve to `undefined`/`null`).
// This is a deliberate choice so callers can't accidentally treat a missing note as "no notes
// yet" — see the doc comments on each method below.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_BASE_DIR = 'runtime/notes';
const INDEX_FILENAME = 'index.json';
const DOCUMENT_FILENAME = 'document.json';
const MARKDOWN_FILENAME = 'note.md';

function summarise(document) {
  return {
    id: String(document.id),
    title: String(document.title || ''),
    author: String(document.author?.name || ''),
    platform: String(document.source?.platform || ''),
    url: String(document.source?.url || ''),
    tags: Array.isArray(document.tags) ? document.tags.slice() : [],
    createdAt: document.createdAt || null,
  };
}

function byNewestFirst(a, b) {
  const aTime = Date.parse(a?.createdAt || '') || 0;
  const bTime = Date.parse(b?.createdAt || '') || 0;
  return bTime - aTime;
}

export class NotebookStore {
  constructor(baseDir = DEFAULT_BASE_DIR) {
    this.baseDir = baseDir;
  }

  async ensure() {
    await mkdir(this.baseDir, { recursive: true });
  }

  noteDir(id) {
    return path.join(this.baseDir, id);
  }

  pathFor(id, filename) {
    return path.join(this.noteDir(id), filename);
  }

  indexPath() {
    return path.join(this.baseDir, INDEX_FILENAME);
  }

  /**
   * Read the manifest of lightweight note summaries. This is the ONLY file list() touches —
   * it never scans <baseDir> or reads individual document.json files, so list() stays cheap
   * (one small JSON read) even with hundreds of notes on disk.
   */
  async readIndex() {
    try {
      const raw = await readFile(this.indexPath(), 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.notes) ? parsed.notes : [];
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async writeIndex(notes) {
    await this.ensure();
    await writeFile(this.indexPath(), `${JSON.stringify({ notes }, null, 2)}\n`, 'utf8');
  }

  /**
   * Persist a Canonical Document (see lib/core/canonical-document.mjs) as note history.
   * `markdown`, if provided, is a pre-rendered markdown string written alongside the JSON —
   * this module never renders markdown itself, that's a separate exporter's job.
   * Saving with an id that already exists overwrites that note in place and moves it to the
   * front of list() (its createdAt is whatever the caller passed in the new document).
   * Returns the lightweight summary entry that was written to the index.
   */
  async save(document, markdown) {
    if (!document || typeof document !== 'object' || !document.id) {
      throw new Error('NotebookStore.save 需要一个带 id 的 Canonical Document。');
    }
    const id = String(document.id);
    await mkdir(this.noteDir(id), { recursive: true });
    await writeFile(this.pathFor(id, DOCUMENT_FILENAME), `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    if (typeof markdown === 'string') {
      await writeFile(this.pathFor(id, MARKDOWN_FILENAME), markdown, 'utf8');
    }

    const entry = summarise(document);
    const notes = await this.readIndex();
    const nextNotes = [entry, ...notes.filter((note) => note.id !== id)];
    await this.writeIndex(nextNotes);
    return entry;
  }

  /**
   * Lightweight index for a "历史笔记" list view — id, title, author, source platform/url,
   * createdAt, tags — sorted newest first. Reads only index.json, never the full documents.
   */
  async list() {
    const notes = await this.readIndex();
    return notes.slice().sort(byNewestFirst);
  }

  /**
   * Return the full Canonical Document for `id`.
   * THROWS (does not return null/undefined) if the id is unknown.
   */
  async get(id) {
    try {
      return JSON.parse(await readFile(this.pathFor(String(id), DOCUMENT_FILENAME), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`未找到笔记：${id}`);
      }
      throw error;
    }
  }

  /**
   * Delete a note's files and remove it from the index.
   * THROWS if the id is unknown (checked via the same lookup as get(), so the two methods
   * agree on what "exists" means).
   */
  async remove(id) {
    await this.get(id); // throws NotebookStore's standard "未找到笔记" error if missing
    await rm(this.noteDir(String(id)), { recursive: true, force: true });
    const notes = await this.readIndex();
    await this.writeIndex(notes.filter((note) => note.id !== String(id)));
  }
}

export default NotebookStore;
