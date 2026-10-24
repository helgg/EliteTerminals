// Galaxy lookups from Spansh's public system endpoint, cached in memory and on disk.
// Requests go out one at a time with a pause between them, to stay polite to a free service.
import { EventEmitter } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BodyInfo, StationInfo, SystemDetail, SystemInfo } from '@et/shared';

const ENDPOINT = 'https://spansh.co.uk/api/system/';
const USER_AGENT = 'EliteTerminals/0.1 (personal second-screen tool)';
const SPACING_MS = 400;
const TTL_MS = 24 * 3600e3;
const RETRY_FAILED_MS = 10 * 60e3;

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? v : 0);

/** Maps a Spansh `record` to our model. Pure, so it can be tested against a saved response. */
export function fromSpansh(r: any): SystemDetail {
  const bodies: BodyInfo[] = (r.bodies ?? []).map((b: any) => ({
    name: str(b.name),
    type: str(b.type),
    subType: str(b.subtype),
    distance: num(b.distance_to_arrival),
    mainStar: b.is_main_star === true,
    terraforming: str(b.terraforming_state),
  }));
  const stations: StationInfo[] = (r.stations ?? []).map((s: any) => ({
    name: str(s.name),
    type: str(s.type),
    distance: num(s.distance_to_arrival),
    pads: { s: num(s.small_pads), m: num(s.medium_pads), l: num(s.large_pads) },
    services: Array.isArray(s.services) ? s.services.map(String) : [],
    body: str(s.body_name),
  }));
  return {
    id64: num(r.id64),
    name: str(r.name),
    security: str(r.security),
    allegiance: str(r.allegiance),
    government: str(r.government),
    economy: str(r.primary_economy),
    population: num(r.population),
    controllingPower: str(r.controlling_power),
    powers: Array.isArray(r.power) ? r.power.map(String) : [],
    powerState: str(r.power_state),
    faction: str(r.controlling_minor_faction),
    factionState: str(r.controlling_minor_faction_state),
    needsPermit: r.needs_permit === true,
    primaryStar: bodies.find((b) => b.mainStar)?.subType ?? '',
    updatedAt: str(r.updated_at),
    bodies,
    stations,
  };
}

export function summary(d: SystemDetail): SystemInfo {
  const { bodies: _b, stations: _s, ...info } = d;
  return info;
}

type Entry = { detail: SystemDetail | null; fetchedAt: number };

export class Galaxy extends EventEmitter {
  private cache = new Map<number, Entry>();
  private queue: number[] = [];
  private running = false;
  private saveTimer: NodeJS.Timeout | null = null;
  readonly cacheFile: string;

  constructor(cacheDir: string) {
    super();
    this.cacheFile = join(cacheDir, 'spansh-systems.json');
  }

  async load() {
    try {
      const saved = JSON.parse(await readFile(this.cacheFile, 'utf8')) as [number, Entry][];
      this.cache = new Map(saved.filter(([, e]) => e.detail));
    } catch {
      // no cache yet
    }
  }

  get(id64: number): SystemDetail | null {
    return this.cache.get(id64)?.detail ?? null;
  }

  /** Queues lookups for systems we have no fresh data for; current/target go first. */
  want(ids: number[]) {
    const now = Date.now();
    for (const id of ids) {
      if (!id || this.queue.includes(id)) continue;
      const e = this.cache.get(id);
      const fresh = e && now - e.fetchedAt < (e.detail ? TTL_MS : RETRY_FAILED_MS);
      if (!fresh) this.queue.push(id);
    }
    void this.drain();
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const id = this.queue.shift()!;
        const detail = await this.fetchOne(id);
        this.cache.set(id, { detail, fetchedAt: Date.now() });
        if (detail) {
          this.emit('change');
          this.scheduleSave();
        }
        await new Promise((r) => setTimeout(r, SPACING_MS));
      }
    } finally {
      this.running = false;
    }
  }

  private async fetchOne(id64: number): Promise<SystemDetail | null> {
    try {
      const res = await fetch(ENDPOINT + id64, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as any;
      return body?.record ? fromSpansh(body.record) : null;
    } catch {
      return null;
    }
  }

  private scheduleSave() {
    this.saveTimer ??= setTimeout(async () => {
      this.saveTimer = null;
      await mkdir(join(this.cacheFile, '..'), { recursive: true });
      await writeFile(this.cacheFile, JSON.stringify([...this.cache].filter(([, e]) => e.detail)));
    }, 2000);
  }
}
