import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class ArtifactStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
  }

  async ensure() {
    await mkdir(this.baseDir, { recursive: true });
  }

  jobDir(jobId) {
    return path.join(this.baseDir, 'jobs', jobId);
  }

  async createJobDir(jobId) {
    const dir = this.jobDir(jobId);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  pathFor(jobId, filename) {
    return path.join(this.jobDir(jobId), filename);
  }

  async writeJson(jobId, filename, value) {
    const target = this.pathFor(jobId, filename);
    await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    return target;
  }

  async readJson(jobId, filename) {
    return JSON.parse(await readFile(this.pathFor(jobId, filename), 'utf8'));
  }

  async writeText(jobId, filename, value) {
    const target = this.pathFor(jobId, filename);
    await writeFile(target, value, 'utf8');
    return target;
  }

  async removeJob(jobId) {
    await rm(this.jobDir(jobId), { recursive: true, force: true });
  }
}
