// Reads the player's active control presets and resolves an action name to a keyboard chord.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { keyLabel, scanKey, type ScanKey } from './keys.ts';

export interface Chord {
  key: string;
  modifiers: string[];
}

export interface ResolvedChord {
  key: ScanKey;
  modifiers: ScanKey[];
  label: string;
}

/** Action name → first keyboard chord bound to it (Primary before Secondary). */
export type BindMap = Map<string, Chord>;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

export function parseBinds(xml: string): BindMap {
  const root = parser.parse(xml)?.Root ?? {};
  const map: BindMap = new Map();
  for (const [action, node] of Object.entries<any>(root)) {
    if (!node || typeof node !== 'object') continue;
    for (const slot of [node.Primary, node.Secondary]) {
      if (slot?.Device !== 'Keyboard' || !slot.Key) continue;
      const mods = [slot.Modifier ?? []].flat()
        .filter((m: any) => m?.Device === 'Keyboard' && m.Key)
        .map((m: any) => String(m.Key));
      map.set(action, { key: String(slot.Key), modifiers: mods });
      break;
    }
  }
  return map;
}

export function resolveChord(chord: Chord): ResolvedChord | null {
  const key = scanKey(chord.key);
  const modifiers = chord.modifiers.map(scanKey);
  if (!key || modifiers.some((m) => !m)) return null;
  return {
    key,
    modifiers: modifiers as ScanKey[],
    label: [...chord.modifiers, chord.key].map(keyLabel).join('+'),
  };
}

/**
 * StartPreset.4.start lists one preset name per line (general, ship, SRV, on-foot).
 * A name resolves to the newest `<name>.<major>.<minor>.binds` in the user's Bindings folder,
 * or to the game's built-in `ControlSchemes/<name>.binds`.
 */
export function presetFiles(bindingsDir: string, gameDir: string | null): { names: string[]; files: string[] } {
  const startFile = ['StartPreset.4.start', 'StartPreset.start']
    .map((f) => join(bindingsDir, f))
    .find(existsSync);
  const names = startFile
    ? readFileSync(startFile, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    : [];
  const userFiles = existsSync(bindingsDir) ? readdirSync(bindingsDir).filter((f) => f.endsWith('.binds')) : [];

  // Ship preset (line 2) wins over general, SRV and on-foot when an action appears in several.
  const order = [names[1], names[0], names[2], names[3]].filter(Boolean);
  const files: string[] = [];
  for (const name of [...new Set(order)]) {
    const own = userFiles
      .filter((f) => f.startsWith(`${name}.`))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
    if (own) files.push(join(bindingsDir, own));
    else if (gameDir) {
      const builtIn = join(gameDir, 'ControlSchemes', `${name}.binds`);
      if (existsSync(builtIn)) files.push(builtIn);
    }
  }
  return { names, files };
}

export function loadBindings(files: string[]): BindMap {
  const merged: BindMap = new Map();
  // Later files only fill gaps left by earlier (higher-priority) ones.
  for (const file of files) {
    for (const [action, chord] of parseBinds(readFileSync(file, 'utf8'))) {
      if (!merged.has(action)) merged.set(action, chord);
    }
  }
  return merged;
}

export function filesSignature(files: string[]): string {
  return files.map((f) => `${f}:${statSync(f, { throwIfNoEntry: false })?.mtimeMs ?? 0}`).join('|');
}

/** Finds the Odyssey product folder from Steam's library list, unless ED_GAME_DIR says otherwise. */
export function findGameDir(): string | null {
  const product = (root: string) => join(root, 'steamapps', 'common', 'Elite Dangerous', 'Products', 'elite-dangerous-odyssey-64');
  if (process.env.ED_GAME_DIR) return process.env.ED_GAME_DIR;
  const steam = 'C:/Program Files (x86)/Steam';
  const roots = [steam];
  const vdf = join(steam, 'steamapps', 'libraryfolders.vdf');
  if (existsSync(vdf)) {
    for (const m of readFileSync(vdf, 'utf8').matchAll(/"path"\s+"([^"]+)"/g)) roots.push(m[1].replace(/\\\\/g, '/'));
  }
  return roots.map(product).find(existsSync) ?? null;
}
