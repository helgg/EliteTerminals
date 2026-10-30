// Engineering events → state.engineering: materials held (with their grade and storage limit) and engineer progress.
// Pure apart from mutating the `state` it is given; no I/O here. Event fields: Frontier's Journal Manual.
import { MATERIAL_CAPS, type EdState, type MaterialCategory, type MaterialStock } from '@et/shared';
import { MATERIALS } from './engineeringData.ts';
import type { JournalEvent } from './reducer.ts';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const CATEGORIES: MaterialCategory[] = ['Raw', 'Manufactured', 'Encoded'];

function category(v: unknown): MaterialCategory | null {
  return CATEGORIES.find((c) => c.toLowerCase() === str(v).toLowerCase()) ?? null;
}

function stock(cat: MaterialCategory, rawName: unknown, label: unknown, count: number): MaterialStock {
  const name = str(rawName).toLowerCase();
  const known = MATERIALS[cat].get(name);
  const grade = known?.grade ?? 0;
  return { name, label: str(label) || known?.label || str(rawName), category: cat, grade, count, max: MATERIAL_CAPS[grade] ?? 0 };
}

function add(state: EdState, cat: MaterialCategory, rawName: unknown, label: unknown, by: number) {
  const list = state.engineering.materials;
  const name = str(rawName).toLowerCase();
  const at = list.findIndex((m) => m.category === cat && m.name === name);
  if (at < 0) {
    if (by > 0) list.push(stock(cat, rawName, label, by));
    return;
  }
  list[at].count = Math.max(0, list[at].count + by);
  if (list[at].count === 0) list.splice(at, 1);
}

/** Crafting and synthesis list what they used as [{ Name, Count }]; the category is found from what is held. */
function spend(state: EdState, items: unknown) {
  if (!Array.isArray(items)) return;
  for (const i of items) {
    const name = str(i?.Name).toLowerCase();
    const held = state.engineering.materials.find((m) => m.name === name);
    if (held) add(state, held.category, name, '', -num(i.Count));
  }
}

export function applyEngineering(state: EdState, e: JournalEvent): void {
  const g = state.engineering;
  switch (e.event) {
    // The whole inventory, written when the game loads: it replaces what was counted since.
    case 'Materials': {
      g.materials = [];
      for (const cat of CATEGORIES) {
        for (const m of Array.isArray(e[cat]) ? e[cat] : []) {
          const count = num(m.Count);
          if (count > 0) g.materials.push(stock(cat, m.Name, m.Name_Localised, count));
        }
      }
      g.updatedAt = str(e.timestamp);
      break;
    }

    case 'MaterialCollected':
    case 'MaterialDiscarded': {
      const cat = category(e.Category);
      if (cat) add(state, cat, e.Name, e.Name_Localised, (e.event === 'MaterialCollected' ? 1 : -1) * num(e.Count));
      break;
    }

    case 'MaterialTrade': {
      const paid = category(e.Paid?.Category);
      const got = category(e.Received?.Category);
      if (paid) add(state, paid, e.Paid.Material, e.Paid.Material_Localised, -num(e.Paid.Quantity));
      if (got) add(state, got, e.Received.Material, e.Received.Material_Localised, num(e.Received.Quantity));
      break;
    }

    case 'EngineerCraft':
      spend(state, e.Ingredients);
      break;
    case 'Synthesis':
    case 'TechnologyBroker':
      spend(state, e.Materials);
      break;

    // Once at load with every engineer, and one event for the engineer that changed.
    case 'EngineerProgress': {
      const list = Array.isArray(e.Engineers) ? e.Engineers : e.Engineer ? [e] : [];
      for (const x of list) {
        const id = num(x.EngineerID);
        const info = {
          id,
          name: str(x.Engineer),
          progress: str(x.Progress),
          rank: typeof x.Rank === 'number' ? x.Rank : null,
          rankProgress: typeof x.RankProgress === 'number' ? x.RankProgress : null,
        };
        const at = g.engineers.findIndex((v) => v.id === id);
        if (at < 0) g.engineers.push(info);
        else g.engineers[at] = { ...g.engineers[at], ...info, rank: info.rank ?? g.engineers[at].rank, rankProgress: info.rankProgress ?? g.engineers[at].rankProgress };
      }
      break;
    }
  }
}
