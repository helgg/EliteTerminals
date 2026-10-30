// Exploration events → state.explore: what the commander has scanned, mapped and sampled in the current system.
// Pure apart from mutating the `state` it is given; no I/O here. Event fields: Frontier's Journal Manual.
import { initialExplore, type EdState, type OwnBody } from '@et/shared';
import type { JournalEvent } from '../reducer.ts';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** "$Codex_Ent_Bacterial_Genus_Name;" → "Bacterial". */
const genus = (v: unknown) => /Ent_([A-Za-z]+)_Genus/.exec(str(v))?.[1] ?? str(v).replace(/^\$|;$/g, '');

function own(state: EdState, id: number, name = ''): OwnBody {
  const x = state.explore;
  let b = x.bodies.find((v) => v.id === id);
  if (!b) {
    b = { id, name, scan: '', mapped: false, wasDiscovered: false, wasMapped: false, bio: null, geo: null, genuses: [] };
    x.bodies.push(b);
  }
  if (name && !b.name) b.name = name;
  return b;
}

/** Entering a system starts the picture again. */
function enter(state: EdState, address: number, system: string) {
  const x = state.explore;
  if (x.address === address && x.system === system) return;
  state.explore = { ...initialExplore(), address, system };
}

export function applyExplore(state: EdState, e: JournalEvent): void {
  const x = state.explore;
  switch (e.event) {
    case 'Location':
    case 'FSDJump':
    case 'CarrierJump':
      enter(state, num(e.SystemAddress), str(e.StarSystem));
      break;

    // The honk: how many bodies the system has.
    case 'FSSDiscoveryScan':
      x.bodyCount = num(e.BodyCount);
      x.nonBodyCount = num(e.NonBodyCount);
      break;
    case 'FSSAllBodiesFound':
      x.allFound = true;
      x.bodyCount = num(e.Count) || x.bodyCount;
      break;

    case 'Scan': {
      if (typeof e.BodyID !== 'number') break;
      // a scan of a body of another system (nav beacon data) is not this system's
      if (e.SystemAddress && x.address && e.SystemAddress !== x.address) break;
      const b = own(state, e.BodyID, str(e.BodyName));
      const kind = str(e.ScanType) === 'AutoScan' ? 'auto' : 'detailed';
      if (b.scan !== 'detailed') b.scan = kind;
      b.wasDiscovered = e.WasDiscovered === true;
      b.wasMapped = e.WasMapped === true;
      break;
    }

    case 'SAAScanComplete':
      own(state, num(e.BodyID), str(e.BodyName)).mapped = true;
      break;

    // Signals from the FSS (counts) and from the surface scan (counts and genera).
    case 'FSSBodySignals':
    case 'SAASignalsFound': {
      const b = own(state, num(e.BodyID), str(e.BodyName));
      for (const sig of Array.isArray(e.Signals) ? e.Signals : []) {
        const type = str(sig?.Type);
        if (/Biological/.test(type)) b.bio = num(sig.Count);
        else if (/Geological/.test(type)) b.geo = num(sig.Count);
      }
      if (Array.isArray(e.Genuses)) b.genuses = e.Genuses.map((g: any) => genus(g?.Genus)).filter(Boolean);
      break;
    }

    case 'ScanOrganic': {
      const stage = { Log: 1, Sample: 2, Analyse: 3 }[str(e.ScanType) as 'Log'];
      if (!stage) break;
      const species = str(e.Species_Localised) || str(e.Species);
      const variant = str(e.Variant_Localised) || str(e.Variant);
      const body = num(e.Body);
      const at = x.organics.findIndex((o) => o.body === body && o.species === species && o.stage < 3);
      const entry = { body, genus: str(e.Genus_Localised) || genus(e.Genus), species, variant, stage, at: str(e.timestamp) };
      if (at >= 0) x.organics[at] = entry;
      else x.organics.push(entry);
      if (x.organics.length > 200) x.organics.splice(0, x.organics.length - 200);
      break;
    }
  }
}
