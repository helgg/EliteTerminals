// Follows the newest journal and the companion JSON files in the game's journal folder.
// Read-only: never writes to, truncates or deletes the game's files.
import { EventEmitter } from 'node:events';
import { open, readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { initialState, type EdState } from '@et/shared';
import { applyEvent, type JournalEvent } from './reducer.ts';
import { MISSION_EVENTS, missionHistory } from './combat.ts';

export const JOURNAL_RE = /^Journal(Alpha|Beta)?\.(.+)\.log$/;
const COMPANION_FILES = ['Status.json', 'Cargo.json', 'NavRoute.json', 'Market.json'];
const POLL_MS = 250;
const DIR_SCAN_MS = 2000;
/** Massacre missions last up to a week: older journals cannot hold one that is still active. */
const MISSION_HISTORY_MS = 8 * 24 * 3600 * 1000;

/** Splits a chunk into complete lines, returning the unterminated tail separately. */
export function splitLines(buffered: string): { lines: string[]; rest: string } {
  const parts = buffered.split(/\r?\n/);
  const rest = parts.pop() ?? '';
  return { lines: parts.filter((l) => l.trim() !== ''), rest };
}

export function applyLine(state: EdState, line: string): boolean {
  try {
    applyEvent(state, JSON.parse(line) as JournalEvent);
    return true;
  } catch {
    state.meta.parseErrors += 1;
    return false;
  }
}

export class JournalReader extends EventEmitter {
  readonly state: EdState = initialState();
  private journal = '';
  private offset = 0;
  private rest = '';
  private companionMtimes = new Map<string, number>();
  private timers: NodeJS.Timeout[] = [];
  private busy = false;

  readonly dir: string;

  constructor(dir: string) {
    super();
    this.dir = dir;
  }

  async start() {
    await this.scanDir();
    await this.loadMissionHistory();
    await this.poll();
    this.timers.push(setInterval(() => void this.poll(), POLL_MS));
    this.timers.push(setInterval(() => void this.scanDir(), DIR_SCAN_MS));
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  private changed() {
    this.emit('change', this.state);
  }

  private async scanDir() {
    let names: string[];
    try {
      names = (await readdir(this.dir)).filter((n) => JOURNAL_RE.test(n));
    } catch {
      if (this.state.meta.online) {
        this.state.meta.online = false;
        this.changed();
      }
      return;
    }
    let newest = '';
    let newestTime = -1;
    for (const name of names) {
      const mtime = (await stat(join(this.dir, name)).catch(() => null))?.mtimeMs ?? 0;
      if (mtime > newestTime || (mtime === newestTime && name > newest)) {
        newest = name;
        newestTime = mtime;
      }
    }
    if (newest && newest !== this.journal) {
      this.journal = newest;
      this.offset = 0;
      this.rest = '';
      this.state.meta.journal = newest;
    }
  }

  /** Missions taken in earlier sessions, from the journals before the one we follow. */
  private async loadMissionHistory() {
    let names: string[];
    try {
      names = (await readdir(this.dir)).filter((n) => JOURNAL_RE.test(n) && n !== this.journal);
    } catch {
      return;
    }
    const since = Date.now() - MISSION_HISTORY_MS;
    const files: { name: string; mtime: number }[] = [];
    for (const name of names) {
      const mtime = (await stat(join(this.dir, name)).catch(() => null))?.mtimeMs ?? 0;
      if (mtime >= since) files.push({ name, mtime });
    }
    files.sort((a, b) => a.mtime - b.mtime || a.name.localeCompare(b.name));
    const events: JournalEvent[] = [];
    for (const { name } of files) {
      const text = await readFile(join(this.dir, name), 'utf8').catch(() => '');
      for (const line of text.split(/\r?\n/)) {
        // Cheap pre-filter before JSON.parse: most lines are not mission events.
        if (!line.includes('"Mission') && !line.includes('"Bounty"')) continue;
        try {
          const e = JSON.parse(line) as JournalEvent;
          if (MISSION_EVENTS.has(e.event)) events.push(e);
        } catch {}
      }
    }
    this.state.combat.missions = missionHistory(events);
  }

  private async poll() {
    if (this.busy) return;
    this.busy = true;
    try {
      const journalChanged = await this.readJournal();
      const companionChanged = await this.readCompanions();
      if (journalChanged || companionChanged) this.changed();
    } finally {
      this.busy = false;
    }
  }

  private async readJournal(): Promise<boolean> {
    if (!this.journal) return false;
    const path = join(this.dir, this.journal);
    const size = (await stat(path).catch(() => null))?.size ?? 0;
    if (size <= this.offset) return false;
    const fh = await open(path, 'r');
    try {
      const buf = Buffer.alloc(size - this.offset);
      await fh.read(buf, 0, buf.length, this.offset);
      this.offset = size;
      const { lines, rest } = splitLines(this.rest + buf.toString('utf8'));
      this.rest = rest;
      lines.forEach((l) => applyLine(this.state, l));
      return lines.length > 0;
    } finally {
      await fh.close();
    }
  }

  private async readCompanions(): Promise<boolean> {
    let changed = false;
    for (const file of COMPANION_FILES) {
      const path = join(this.dir, file);
      const mtime = (await stat(path).catch(() => null))?.mtimeMs;
      if (mtime === undefined || mtime === this.companionMtimes.get(file)) continue;
      const json = await readJsonWithRetry(path);
      if (!json) continue; // keep the old mtime so the next poll tries again
      this.companionMtimes.set(file, mtime);
      applyEvent(this.state, json);
      changed = true;
    }
    return changed;
  }
}

/** The game rewrites these files in place, so a read can land on an empty or half-written file. */
async function readJsonWithRetry(path: string, attempts = 3): Promise<JournalEvent | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const text = await readFile(path, 'utf8');
      if (text.trim()) return JSON.parse(text);
    } catch {
      // fall through to retry
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}
