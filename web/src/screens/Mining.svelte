<script lang="ts">
  import type { CommodityQuote, EdState, HotspotMatch, MiningSellQuery, Prospect, RingInfo } from '@et/shared';
  import Panel from '../lib/Panel.svelte';
  import Name from '../lib/Name.svelte';
  import MiningRadar from '../lib/MiningRadar.svelte';
  import { keyFor, sendCommand } from '../lib/link.svelte.ts';
  import { busy, canRun, plotTo, runMacro } from '../lib/macros.svelte.ts';
  import { ageLabel, ageTone, cr, short } from '../lib/format.ts';

  // MINING (ship), big monitor on its side: docs/design/MINING.md.
  // Left: the last asteroid the prospector read, and the ones before. Middle: the radar and the session.
  // Right: rings / hotspot finder / where to sell, in tabs, over the console.
  let { s, now }: { s: EdState; now: number } = $props();

  const m = $derived(s.mining);
  const ss = $derived(m.session);

  const load = <T,>(key: string, fallback: T): T => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? 'null');
      return v ?? fallback;
    } catch {
      return fallback;
    }
  };
  const save = (key: string, v: unknown) => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  };
  /** Journal names differ from the market's ("LowTemperatureDiamond", "Opal"): compare normalised labels. */
  const ALIASES: Record<string, string> = { lowtemperaturediamond: 'lowtemperaturediamonds', opal: 'voidopal', drones: 'limpet' };
  const norm = (v: string) => {
    const k = v.toLowerCase().replace(/^\$/, '').replace(/_name;$/, '').replace(/[^a-z0-9]/g, '');
    return ALIASES[k] ?? k;
  };

  // --- what the player mines for, and what the collectors should leave (remembered on this device) ---
  const VALUABLE = [
    'Platinum', 'Painite', 'Low Temperature Diamonds', 'Void Opal', 'Osmium', 'Palladium', 'Gold', 'Silver',
    'Alexandrite', 'Benitoite', 'Bromellite', 'Grandidierite', 'Monazite', 'Musgravite', 'Rhodplumsite', 'Serendibite', 'Tritium',
  ];
  const COMMON = [
    'Bauxite', 'Bertrandite', 'Cobalt', 'Coltan', 'Gallite', 'Indite', 'Lepidolite', 'Lithium Hydroxide', 'Methane Clathrate',
    'Methanol Monohydrate Crystals', 'Moissanite', 'Praseodymium', 'Rutile', 'Samarium', 'Uraninite', 'Water', 'Hydrogen Peroxide',
    'Liquid oxygen', 'Jadeite', 'Haematite', 'Pyrophyllite', 'Taaffeite', 'Cryolite', 'Goslarite', 'Lithium',
  ];
  let targets = $state<string[]>(load('et.mining.targets', ['Platinum', 'Painite', 'Low Temperature Diamonds', 'Void Opal']));
  let ignored = $state<string[]>(load('et.mining.ignored', []));
  /** A laser asteroid is worth mining from this share of a target (%). */
  let minPct = $state<number>(load('et.mining.minPct', 20));
  let editing = $state<'' | 'targets' | 'ignore'>('');
  const targetKeys = $derived(new Set(targets.map(norm)));
  const ignoredKeys = $derived(new Set(ignored.map(norm)));
  const isTarget = (name: string) => targetKeys.has(norm(name));
  const isIgnored = (name: string) => ignoredKeys.has(norm(name));
  function setLists(t: string[], i: string[]) {
    targets = t;
    ignored = i;
    save('et.mining.targets', t);
    save('et.mining.ignored', i);
  }
  const without = (list: string[], name: string) => list.filter((x) => norm(x) !== norm(name));
  const toggleTarget = (name: string) => setLists(isTarget(name) ? without(targets, name) : [...targets, name], without(ignored, name));
  const toggleIgnore = (name: string) => setLists(without(targets, name), isIgnored(name) ? without(ignored, name) : [...ignored, name]);
  /** A tap on a material of the last asteroid: plain → target → ignored → plain. */
  function cycle(name: string) {
    if (isTarget(name)) toggleIgnore(name);
    else if (isIgnored(name)) toggleIgnore(name);
    else toggleTarget(name);
  }
  function stepMin(d: number) {
    minPct = Math.min(60, Math.max(5, minPct + d));
    save('et.mining.minPct', minPct);
  }

  // --- prospector ---
  type Kind = 'core' | 'mine' | 'low' | 'skip';
  type Verdict = { kind: Kind; title: string; sub: string };
  const best = (p: Prospect) => p.materials.filter((x) => isTarget(x.label) || isTarget(x.name)).sort((a, b) => b.pct - a.pct)[0];
  function verdict(p: Prospect): Verdict {
    const b = best(p);
    if (p.motherlode) return { kind: 'core', title: 'CORE', sub: `${p.motherlode} · crack it` };
    if (b && b.pct >= minPct) return { kind: 'mine', title: 'MINE', sub: `${b.label} ${b.pct.toFixed(1)}%` };
    if (b) return { kind: 'low', title: 'LOW', sub: `${b.label} ${b.pct.toFixed(1)}% < ${minPct}%` };
    return { kind: 'skip', title: 'SKIP', sub: 'no target material' };
  }
  const kindOf = (p: Prospect) => verdict(p).kind;
  const last = $derived(m.prospects[0]);
  const lastVerdict = $derived(last ? verdict(last) : null);
  const kept = $derived(last ? last.materials.filter((x) => !isIgnored(x.label) && !isIgnored(x.name)) : []);
  const dropped = $derived(last ? last.materials.filter((x) => isIgnored(x.label) || isIgnored(x.name)) : []);
  const hits = $derived(m.prospects.filter((p) => ['mine', 'core'].includes(verdict(p).kind)).length);
  const cores = $derived(m.prospects.filter((p) => p.motherlode).length);
  const CONTENT: Record<string, number> = { High: 3, Medium: 2, Low: 1 };
  const ago = (iso: string) => {
    const sec = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
    return sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.floor(sec / 60)}m` : `${Math.floor(sec / 3600)}h`;
  };
  const ABBR: Record<string, string> = {
    'Low Temperature Diamonds': 'LTD', 'Void Opal': 'OPAL', Platinum: 'PLAT', Painite: 'PAIN', Alexandrite: 'ALEX',
    Benitoite: 'BENI', Bromellite: 'BROM', Grandidierite: 'GRAN', Monazite: 'MONA', Musgravite: 'MUSG',
    Rhodplumsite: 'RHOD', Serendibite: 'SERE', Tritium: 'TRIT', Osmium: 'OSM', Palladium: 'PALL',
  };
  const abbr = (n: string) => ABBR[n] ?? n.slice(0, 4).toUpperCase();

  // --- session ---
  const limpets = $derived(s.cargo.items.find((i) => norm(i.name) === 'limpet')?.count ?? 0);
  const refinedTons = $derived(ss.refined.reduce((a, r) => a + r.count, 0));
  const hours = $derived(ss.firstRefinedAt ? Math.max((now - Date.parse(ss.firstRefinedAt)) / 3.6e6, 1 / 60) : 0);
  const cap = $derived(s.ship.cargoCapacity);
  const used = $derived(s.cargo.count);
  /** The hold apart from limpets; what the player marked to ignore is junk taking room. */
  const ores = $derived(s.cargo.items.filter((i) => norm(i.name) !== 'limpet' && i.count > 0));
  const junk = $derived(ores.filter((i) => isIgnored(i.label) || isIgnored(i.name)));
  const junkTons = $derived(junk.reduce((a, i) => a + i.count, 0));
  const price = (name: string) => sells?.[norm(name)]?.[0]?.price ?? 0;
  const holdValue = $derived(ores.reduce((a, i) => a + i.count * price(i.name), 0));
  const refinedValue = $derived(ss.refined.reduce((a, r) => a + r.count * price(r.name), 0));
  const tools = $derived(m.tools);
  const me = $derived(
    s.status.latitude !== null && s.status.longitude !== null
      ? { lat: s.status.latitude, lon: s.status.longitude, alt: s.status.altitude ?? 0 } : null,
  );

  // --- right column tabs ---
  type Tab = 'rings' | 'finder' | 'sell';
  let tab = $state<Tab>(load('et.mining.tab', 'rings'));
  function setTab(t: Tab) {
    tab = t;
    save('et.mining.tab', t);
  }

  // --- rings of this system ---
  const here = $derived(s.location.body);
  const rings = $derived(
    (m.rings ?? []).slice().sort((a, b) => (b.name === here ? 1 : 0) - (a.name === here ? 1 : 0) || a.ls - b.ls),
  );
  const ringTone = (r: RingInfo) => ({ Icy: 'icy', 'Metal Rich': 'metal', Metallic: 'metal', Rocky: 'rocky' })[r.type] ?? '';
  const ringHasTarget = (r: RingInfo) => r.signals.some((x) => isTarget(x.name));

  // --- hotspot finder ---
  const HOT = [
    'Platinum', 'Painite', 'Low Temperature Diamonds', 'Void Opal', 'Alexandrite', 'Benitoite', 'Bromellite',
    'Grandidierite', 'Monazite', 'Musgravite', 'Rhodplumsite', 'Serendibite', 'Tritium',
  ];
  type Finder = { commodity: string; radius: number; minCount: number; pristine: boolean };
  let finder = $state<Finder>(load('et.mining.finder', { commodity: 'Platinum', radius: 50, minCount: 1, pristine: false }));
  let found = $state<HotspotMatch[] | null>(null);
  let finding = $state(false);
  let findError = $state('');
  function setFinder(next: Partial<Finder>) {
    finder = { ...finder, ...next };
    save('et.mining.finder', finder);
  }
  async function find() {
    finding = true;
    findError = '';
    try {
      const res = await fetch('/api/mining/hotspots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(finder),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      found = body;
    } catch (err) {
      findError = (err as Error).message;
    } finally {
      finding = false;
    }
  }
  const plotting = $derived(busy('Plot') ? s.macros.plot.system : '');

  // --- where to sell ---
  type SellOpts = { radius: number; pad: 'S' | 'M' | 'L'; maxAgeH: number; planetary: boolean; carriers: boolean; sort: 'price' | 'distance' | 'demand' };
  let sellOpts = $state<SellOpts>(load('et.mining.sell', { radius: 40, pad: 'L', maxAgeH: 24, planetary: true, carriers: false, sort: 'price' }));
  let sells = $state<Record<string, CommodityQuote[]> | null>(null);
  let selling = $state(false);
  let sellError = $state('');
  /** What to price: the hold's ores and what was refined this session, minus what the player ignores. */
  const sellNames = $derived([
    ...new Map<string, string>([...ores.map((i) => i.name), ...ss.refined.map((r) => r.name)].map((n) => [norm(n), n])).values(),
  ].filter((n) => !isIgnored(n) && !isIgnored(sellLabel(n))));
  /** The refined label is the game's display name; Cargo often gives only the internal one ("platinum"). */
  function sellLabel(name: string) {
    const refined = ss.refined.find((r) => norm(r.name) === norm(name))?.label;
    const held = ores.find((i) => norm(i.name) === norm(name))?.label;
    const label = refined && refined !== name ? refined : held ?? name;
    return label === label.toLowerCase() ? label.replace(/^./, (c) => c.toUpperCase()) : label;
  }
  function setSell(next: Partial<SellOpts>) {
    sellOpts = { ...sellOpts, ...next };
    save('et.mining.sell', sellOpts);
  }
  async function scanSells() {
    if (!sellNames.length) return;
    selling = true;
    sellError = '';
    const q: MiningSellQuery = {
      names: sellNames, radius: sellOpts.radius, maxAgeH: sellOpts.maxAgeH, pad: sellOpts.pad,
      planetary: sellOpts.planetary, carriers: sellOpts.carriers,
    };
    try {
      const res = await fetch('/api/mining/sell', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      sells = Object.fromEntries(Object.entries(body as Record<string, CommodityQuote[]>).map(([k, v]) => [norm(k), v]));
    } catch (err) {
      sellError = (err as Error).message;
    } finally {
      selling = false;
    }
  }
  // price the hold once there is something in it, and again when a new commodity shows up
  let pricedFor = '';
  $effect(() => {
    const key = sellNames.map(norm).sort().join(',');
    if (key && key !== pricedFor && s.location.system && !selling) {
      pricedFor = key;
      void scanSells();
    }
  });
  const sorted = (list: CommodityQuote[]) => list.slice().sort((a, b) =>
    sellOpts.sort === 'distance' ? a.end.fromMe - b.end.fromMe : sellOpts.sort === 'demand' ? b.volume - a.volume : b.price - a.price);
  const inHold = (name: string) => ores.find((i) => norm(i.name) === norm(name))?.count ?? 0;

  // --- console ---
  let ejectArmed = $state(false);
  let ejectTimer: ReturnType<typeof setTimeout> | undefined;
  function eject() {
    if (!ejectArmed) {
      ejectArmed = true;
      clearTimeout(ejectTimer);
      ejectTimer = setTimeout(() => (ejectArmed = false), 2500);
      return;
    }
    ejectArmed = false;
    sendCommand('EjectAllCargo');
  }
  const FG = ['A', 'B', 'C', 'D', 'E', 'F'];
  const pipBars = (sys: number, eng: number, wep: number) => [sys, eng, wep].map((v) => v * 5 + 2);
</script>

{#snippet keyTile(action: string, title: string, sub = '', cls = '', on: boolean | null = null)}
  {@const bound = keyFor(action)}
  <button class="act {cls}" class:disabled={!bound} class:live={on === true} disabled={!bound} onclick={() => sendCommand(action)}>
    {#if on !== null}<span class="led"></span>{/if}
    <b>{title}</b><small>{sub || ' '}</small>
    <span class="key" class:nobind={!bound}>{bound ?? 'NO BIND'}</span>
  </button>
{/snippet}

{#snippet macroTile(id: string, title: string, sub = '', cls = '', live: boolean | null = null)}
  {@const ok = canRun(id)}
  <button class="act macro {cls}" class:disabled={!ok} class:busy={busy(id)} class:live={live === true}
    disabled={!ok} onclick={() => runMacro(id)}>
    {#if live !== null}<span class="led"></span>{/if}
    <b>{title}</b>{#if sub}<small>{sub}</small>{/if}
    {#if !ok}<span class="key nobind">NO BIND</span>{/if}
  </button>
{/snippet}

{#snippet power(id: string, label: string, bars: number[])}
  {@const ok = canRun(id)}
  <button class="act macro" class:disabled={!ok} class:busy={busy(id)} disabled={!ok} onclick={() => runMacro(id)}>
    <b>{label}</b>
    <span class="pips">{#each bars as h, i (i)}<i style:height="{h}px"></i>{/each}</span>
  </button>
{/snippet}

{#snippet listEditor()}
  {@const pool = editing === 'targets' ? VALUABLE : [...COMMON, ...VALUABLE]}
  <div class="editor">
    <p class="hint">{editing === 'targets' ? 'Tap what you mine for: it lights up in the prospector, the rings and the radar.'
      : 'Tap what your collectors should leave: it drops out of the prospector, the sale and the value.'}</p>
    <div class="pickgrid">
      {#each pool as v (v)}
        {@const on = editing === 'targets' ? isTarget(v) : isIgnored(v)}
        <button class="chip" class:on class:ign={editing === 'ignore'} onclick={() => (editing === 'targets' ? toggleTarget(v) : toggleIgnore(v))}>{v}</button>
      {/each}
    </div>
  </div>
{/snippet}

<div class="mining">
  <!-- left: the prospector -->
  <div class="col">
    <Panel class="prospect" title="Prospector" aside={last ? `${ago(last.at)} ago` : 'launch a prospector limpet'} scroll={false}>
      <div class="lists">
        <button class="chip edit" class:open={editing === 'targets'} onclick={() => (editing = editing === 'targets' ? '' : 'targets')}>
          TARGETS <span class="n">{targets.length}</span></button>
        <button class="chip edit" class:open={editing === 'ignore'} onclick={() => (editing = editing === 'ignore' ? '' : 'ignore')}>
          IGNORE <span class="n">{ignored.length}</span></button>
        <span class="min">
          <button class="step" onclick={() => stepMin(-5)} aria-label="Lower the threshold">−</button>
          <span class="num">≥ {minPct}%</span>
          <button class="step" onclick={() => stepMin(5)} aria-label="Raise the threshold">+</button>
        </span>
      </div>
      {#if editing}
        {@render listEditor()}
      {:else if last && lastVerdict}
        <div class="verdict v-{lastVerdict.kind}">
          <b>{lastVerdict.title}</b>
          <span>{lastVerdict.sub}</span>
        </div>
        <div class="facts">
          <div><small>CONTENT</small>
            <span class="lvl">{#each [1, 2, 3] as n (n)}<i class:on={(CONTENT[last.content] ?? 0) >= n}></i>{/each}</span>
            <b>{last.content ? last.content.toUpperCase() : '—'}</b></div>
          <div><small>REMAINING</small><b class:warn={last.remaining < 100}>{last.remaining.toFixed(0)}%</b></div>
          <div><small>MOTHERLODE</small><b class:core={!!last.motherlode}>{last.motherlode || 'none'}</b></div>
        </div>
        <div class="mats">
          {#each kept as x (x.name)}
            {@const t = isTarget(x.label) || isTarget(x.name)}
            <button class="mat" class:target={t} onclick={() => cycle(x.label)} title="tap: target → ignore → plain">
              <span class="ml">{x.label}</span>
              <span class="mbar"><i style:width="{Math.min(100, x.pct * 2)}%"></i>{#if t}<em style:left="{Math.min(100, minPct * 2)}%"></em>{/if}</span>
              <span class="mp num">{x.pct.toFixed(1)}%</span>
            </button>
          {/each}
          {#if dropped.length}
            <p class="dropped">IGNORED · {#each dropped as x, i (x.name)}<button onclick={() => cycle(x.label)}>{x.label} {x.pct.toFixed(0)}%</button>{i < dropped.length - 1 ? ' · ' : ''}{/each}</p>
          {/if}
          <p class="hint">tap a material: target → ignore → plain</p>
        </div>
      {:else}
        <p class="none">No asteroid prospected this session. Fire a prospector limpet at a rock: its materials,
          content and any motherlode core show here.</p>
      {/if}
    </Panel>
    <Panel class="history" title="Asteroids" aside="{ss.prospected} prospected · {hits} worth it · {cores} cores" scroll={false}>
      {#if m.prospects.length > 1}
        <div class="scroll">
          <table>
            <thead><tr><th>AGO</th><th>VERDICT</th><th>BEST TARGET</th><th class="r">%</th><th>CONT.</th><th class="r">LEFT</th></tr></thead>
            <tbody>
              {#each m.prospects.slice(1) as p, i (i)}
                {@const v = verdict(p)}
                {@const b = best(p)}
                <tr>
                  <td class="dim">{ago(p.at)}</td>
                  <td><span class="vt v-{v.kind}">{v.title}</span></td>
                  <td class="cut">{p.motherlode ? `◆ ${p.motherlode}` : b?.label ?? '—'}</td>
                  <td class="num r">{b ? b.pct.toFixed(1) : ''}</td>
                  <td class="dim">{p.content ? p.content[0] : '—'}</td>
                  <td class="num r dim">{p.remaining.toFixed(0)}%</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <p class="none">The asteroids prospected before the last one, newest first.</p>
      {/if}
    </Panel>
  </div>

  <!-- middle: radar, session -->
  <div class="col">
    <Panel class="radar" title="Radar" aside={m.trail.body ? `${m.trail.body} · trail and prospects` : 'trail and prospects'} scroll={false}>
      <MiningRadar {me} heading={s.status.heading} radius={m.trail.radius || s.status.planetRadius || 0}
        trail={m.trail.points} prospects={m.prospects} {kindOf} />
    </Panel>
    <Panel class="session" title="Session" aside={hours ? `${(hours * 60).toFixed(0)} min since the first ton` : 'nothing refined yet'} scroll={false}>
      <div class="kpis">
        <div><small>REFINED</small><b class="ok">{refinedTons}t</b></div>
        <div><small>T/H</small><b class="tele">{hours ? (refinedTons / hours).toFixed(1) : '—'}</b></div>
        <div><small>VALUE</small><b class="warn">{refinedValue ? short(refinedValue) : '—'}</b></div>
        <div><small>CR/H</small><b class="tele">{hours && refinedValue ? short(refinedValue / hours) : '—'}</b></div>
        <div><small>CORES</small><b>{ss.cracked}</b></div>
      </div>
      <div class="hold">
        <div class="line"><span>HOLD <b>{used}</b>/{cap}t · free <b class:bad={cap > 0 && cap - used < 4}>{Math.max(0, cap - used)}t</b>{#if junkTons} · <b class="bad">{junkTons}t junk</b>{/if}</span>
          <span>LIMPETS <b class:bad={limpets < 4}>{limpets}</b> · used P{ss.prospectors} C{ss.collectors}</span></div>
        <div class="t"><i style:width="{cap ? Math.min(100, ((used - junkTons) / cap) * 100) : 0}%"></i><i class="junk"
          style:left="{cap ? Math.min(100, ((used - junkTons) / cap) * 100) : 0}%" style:width="{cap ? Math.min(100, (junkTons / cap) * 100) : 0}%"></i></div>
      </div>
      {#if ss.refined.length}
        <div class="refined">
          {#each ss.refined as r (r.name)}
            <span class="rf" class:target={isTarget(r.label)} class:ign={isIgnored(r.label)}><b>{r.count}t</b> {r.label}{#if price(r.name) && !isIgnored(r.label)}<small> · {short(r.count * price(r.name))}</small>{/if}</span>
          {/each}
        </div>
      {/if}
      <div class="tools">
        <span class:on={tools.lasers > 0}>LASER{tools.lasers > 1 ? ` ×${tools.lasers}` : ''}</span>
        <span class:on={tools.abrasion > 0}>ABRASION</span>
        <span class:on={tools.seismic > 0}>SEISMIC</span>
        <span class:on={tools.subsurface > 0}>SUB-SURFACE</span>
        <span class:on={tools.pulseWave}>PULSE WAVE</span>
        <span class:on={tools.prospector}>PROSPECTOR</span>
        <span class:on={tools.collector}>COLLECTOR</span>
        <span class:on={tools.refinery}>REFINERY</span>
      </div>
    </Panel>
  </div>

  <!-- right: rings / finder / sell, console -->
  <div class="col">
    <section class="tabbed">
      <nav class="tabs">
        <button class:on={tab === 'rings'} onclick={() => setTab('rings')}>RINGS <span class="n">{rings.length}</span></button>
        <button class:on={tab === 'finder'} onclick={() => setTab('finder')}>HOTSPOT FINDER</button>
        <button class:on={tab === 'sell'} onclick={() => setTab('sell')}>SELL {#if holdValue}<span class="n">{short(holdValue)}</span>{/if}</button>
      </nav>
      <div class="tbody">
        {#if tab === 'rings'}
          <p class="sub">{m.rings === null ? 'Asking Spansh about this system…' : `${s.location.system.toUpperCase()} · type, reserve and hotspots · own scans override Spansh`}</p>
          {#if rings.length}
            <div class="scroll">
              {#each rings as r (r.name)}
                <div class="ring {ringTone(r)}" class:here={r.name === here} class:hasT={ringHasTarget(r)}>
                  <span class="rn">{#if r.name === here}<span class="hereTag">HERE</span>{/if}<Name value={r.name} /></span>
                  <span class="rt">{r.type.toUpperCase() || '—'}</span>
                  <span class="rr" class:pristine={r.reserve === 'Pristine'}>{r.reserve.toUpperCase() || '—'}</span>
                  <span class="rl num dim">{r.ls ? `${cr(r.ls)} ls` : ''}</span>
                  <span class="sigs">
                    {#each r.signals as x (x.name)}<span class="sig" class:target={isTarget(x.name)} title={x.name}>{abbr(x.name)} {x.count}</span>{/each}
                    {#if !r.signals.length}<span class="dim">no hotspots known</span>{/if}
                    {#if r.own}<span class="own">OWN SCAN</span>{/if}
                  </span>
                </div>
              {/each}
            </div>
          {:else}
            <p class="none">{m.rings === null ? 'Rings and hotspots of this system come from Spansh.' : 'No ringed bodies known in this system.'}</p>
          {/if}
        {:else if tab === 'finder'}
          <div class="frow">
            <select value={finder.commodity} onchange={(e) => setFinder({ commodity: e.currentTarget.value })} aria-label="Commodity">
              {#each HOT as h (h)}<option value={h}>{h}</option>{/each}
            </select>
            <span class="seg">{#each [25, 50, 100, 200] as r (r)}<button class:on={finder.radius === r} onclick={() => setFinder({ radius: r })}>{r}</button>{/each}</span><em>ly</em>
          </div>
          <div class="frow">
            <span class="seg">{#each [1, 2, 3] as n (n)}<button class:on={finder.minCount === n} onclick={() => setFinder({ minCount: n })}>{n}+</button>{/each}</span><em>spots</em>
            <button class="chip" class:on={finder.pristine} onclick={() => setFinder({ pristine: !finder.pristine })}>PRISTINE</button>
            <button class="go" class:busy={finding} disabled={finding} onclick={find}>{finding ? 'SEARCHING' : 'FIND'}</button>
          </div>
          {#if findError}<p class="none warn">{findError}</p>
          {:else if found?.length}
            <div class="scroll">
              <table>
                <thead><tr><th>SYSTEM / RING</th><th>RESERVE</th><th class="r">SPOTS</th><th class="r">LY</th><th></th></tr></thead>
                <tbody>
                  {#each found as h (h.ring)}
                    {@const busy = plotting === h.system}
                    <tr class:here={h.system.toLowerCase() === s.location.system.toLowerCase()}>
                      <td class="cut"><Name value={h.system} system /><small class="dim"> {h.ring.slice(h.system.length + 1).replace(/ Ring$/i, '')} · {h.type} · {short(h.ls)} ls</small></td>
                      <td class:pristine={h.reserve === 'Pristine'}>{h.reserve}</td>
                      <td class="num r"><b class="warn">{h.count}</b></td>
                      <td class="num r">{h.distance.toFixed(1)}</td>
                      <td class="r"><button class="plot" class:busy disabled={!!plotting && !busy} onclick={() => plotTo(h.system)}>{busy ? 'STOP' : 'PLOT'}</button></td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else if found}
            <p class="none">No ring with {finder.minCount}+ {finder.commodity} hotspots within {finder.radius} ly.</p>
          {:else}
            <p class="none">Pick a commodity and FIND: rings around {s.location.system.toUpperCase() || 'you'}, nearest first. PLOT sets the route.</p>
          {/if}
          {#if s.macros.plot.error && s.macros.plot.system}<p class="none warn">{s.macros.plot.system.toUpperCase()}: {s.macros.plot.error}</p>{/if}
        {:else}
          <div class="frow">
            <span class="seg">{#each [20, 40, 80] as r (r)}<button class:on={sellOpts.radius === r} onclick={() => setSell({ radius: r })}>{r}</button>{/each}</span><em>ly</em>
            <span class="seg">{#each ['S', 'M', 'L'] as p (p)}<button class:on={sellOpts.pad === p} onclick={() => setSell({ pad: p as 'S' | 'M' | 'L' })}>{p}</button>{/each}</span><em>pad</em>
            <button class="chip" class:on={sellOpts.planetary} onclick={() => setSell({ planetary: !sellOpts.planetary })}>SURFACE</button>
            <button class="chip" class:on={sellOpts.carriers} onclick={() => setSell({ carriers: !sellOpts.carriers })}>CARRIERS</button>
          </div>
          <div class="frow">
            <span class="seg">{#each [['price', 'PRICE'], ['demand', 'DEMAND'], ['distance', 'NEAR']] as [k, l] (k)}<button class:on={sellOpts.sort === k} onclick={() => setSell({ sort: k as SellOpts['sort'] })}>{l}</button>{/each}</span><em>sort</em>
            <span class="dim worth">{holdValue ? `hold ~${short(holdValue)} Cr` : ''}</span>
            <button class="go" class:busy={selling} disabled={selling || !sellNames.length} onclick={scanSells}>{selling ? 'SCANNING' : 'SCAN'}</button>
          </div>
          {#if sellError}<p class="none warn">{sellError}</p>{/if}
          {#if !sellNames.length}
            <p class="none">Nothing mined in the hold yet. Refined ores get priced here: the best stations within {sellOpts.radius} ly.</p>
          {:else}
            <div class="scroll">
              {#each sellNames as name (name)}
                {@const list = sorted(sells?.[norm(name)] ?? []).slice(0, 4)}
                <div class="com">
                  <div class="ch"><b class:target={isTarget(sellLabel(name))}>{sellLabel(name)}</b>
                    <span class="dim">{inHold(name) ? `${inHold(name)}t in hold` : 'refined earlier'}{#if inHold(name) && price(name)} · <b class="warn">{short(inHold(name) * price(name))} Cr</b>{/if}</span></div>
                  {#if list.length}
                    <table>
                      <tbody>
                        {#each list as q (q.end.marketId)}
                          <tr>
                            <td class="cut"><Name value={q.end.station} stationType={q.end.type} icon /><small class="dim sys"><Name value={q.end.system} system /></small></td>
                            <td class="num r"><b>{cr(q.price)}</b></td>
                            <td class="num r dim">{short(q.volume)}</td>
                            <td class="num r">{q.end.fromMe.toFixed(1)}<small class="dim">ly</small></td>
                            <td class="dim">{q.end.pad}</td>
                            <td class="num r age {ageTone(q.end.ageH)}">{q.end.live ? 'OWN' : ageLabel(q.end.ageH)}</td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  {:else}
                    <p class="none">{selling ? 'scanning…' : sells ? 'no buyer within the filters' : ''}</p>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    </section>

    <div class="console">
      <section class="bay g-mine">
        <h4>MINING<span class="st">FG {FG[s.status.fireGroup] ?? '—'}</span></h4>
        <div class="tiles">
          {@render macroTile('MineReady', 'READY', 'scoop · hardpoints · lasers', 'x2')}
          {@render macroTile('MineLeave', 'LEAVE', 'all in · power to engines', 'x2')}
          {@render keyTile('ToggleCargoScoop', 'SCOOP', '', 'amber', s.flags.cargoScoopDeployed)}
          {@render keyTile('DeployHardpointToggle', 'HARDPTS', '', 'amber', s.flags.hardpointsDeployed)}
          {@render keyTile('NightVisionToggle', 'NIGHT VIS.', '', '', s.flags.nightVision)}
          {@render keyTile('ShipSpotLightToggle', 'LIGHTS', '', '', s.flags.lightsOn)}
          <div class="fgs">
            {#each FG as g, n (g)}
              {@render macroTile(`FireGroup${n}`, g, '', 'fg', s.status.fireGroup === n)}
            {/each}
            {@render keyTile('CycleFireGroupNext', 'FG ▶', '', 'cyan fg')}
          </div>
        </div>
      </section>
      <section class="bay g-power">
        <h4>POWER</h4>
        <div class="tiles">
          {@render power('PowerATK', 'LASERS', pipBars(2, 0, 4))}
          {@render power('PowerDEF', 'DEF', pipBars(4, 2, 0))}
          {@render power('PowerRUN', 'RUN', pipBars(2, 4, 0))}
          <button class="act danger" class:armed={ejectArmed} disabled={!keyFor('EjectAllCargo')} class:disabled={!keyFor('EjectAllCargo')} onclick={eject}>
            <b>{ejectArmed ? 'AGAIN' : 'EJECT ALL'}</b><small>{ejectArmed ? 'dumps the hold' : 'two taps'}</small>
            {#if !keyFor('EjectAllCargo')}<span class="key nobind">NO BIND</span>{/if}
          </button>
        </div>
      </section>
    </div>
  </div>
</div>

<style>
  .mining { height: 100%; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr); gap: 8px; min-height: 0; }
  .col { display: flex; flex-direction: column; gap: 8px; min-height: 0; min-width: 0; }
  .col > :global(.prospect) { flex: 1.15 1 0; }
  .col > :global(.history) { flex: 1 1 0; }
  .col > :global(.radar) { flex: 1 1 0; }
  .col > :global(.session) { flex: none; }
  .none { padding: 10px 4px; color: var(--dim); margin: 0; font-size: 12px; }
  .hint { margin: 6px 0 0; font-size: 10.5px; color: var(--dim); letter-spacing: .04em; }
  .r { text-align: right; }
  .ok { color: var(--ok); } .warn { color: var(--hud-hi); } .bad { color: var(--danger); } .tele { color: var(--telemetry); }
  .scroll { flex: 1; min-height: 0; overflow-y: auto; }
  :global(.panel.history .body), :global(.panel.radar .body), :global(.panel.prospect .body) { display: flex; flex-direction: column; }

  /* chips and segmented pickers, thumb-sized; never wrap inside */
  .chip, .seg button, .step, .go, .plot {
    min-height: 34px; padding: 0 9px; font-size: 11.5px; font-weight: 700; letter-spacing: .05em; color: var(--dim); white-space: nowrap;
    background: linear-gradient(to bottom, #2b2014, var(--steel)); border: 1px solid var(--rule);
  }
  .chip.on, .seg button.on { color: var(--void); background: var(--hud-hi); border-color: var(--hud-hi); }
  .chip.on.ign { background: var(--danger); border-color: var(--danger); color: #fff; }
  .chip.edit { color: var(--muted); }
  .chip.edit.open { color: var(--hud); border-color: var(--hud); }
  .chip .n { color: var(--hud-hi); margin-left: 4px; }
  .seg { display: inline-flex; flex: none; }
  .seg button + button { border-left: 0; }
  em { font-style: normal; font-size: 10px; color: var(--dim); letter-spacing: .08em; flex: none; }
  .go { color: var(--void); background: var(--telemetry); border-color: var(--telemetry); margin-left: auto; min-width: 92px; flex: none; }
  .go:disabled { opacity: .5; }
  .busy { animation: busy .5s linear infinite alternate; }
  .chip:active, .seg button:active, .go:active, .step:active, .plot:active { filter: brightness(1.35); transform: translateY(1px); }
  /* filter rows: one line each, by design; the select and the spacer take what is left */
  .frow { display: flex; flex-wrap: nowrap; align-items: center; gap: 6px; margin-bottom: 6px; min-width: 0; }
  .frow select { flex: 1; min-width: 0; }
  .worth { flex: 1; text-align: right; font-size: 11px; white-space: nowrap; overflow: hidden; }
  select { min-height: 34px; background: var(--steel); color: var(--hud-hi); border: 1px solid var(--rule); font: inherit; font-size: 12px; padding: 0 6px; }

  /* prospector */
  .lists { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
  .min { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--hud-hi); white-space: nowrap; }
  .step { min-width: 34px; padding: 0; font-size: 16px; }
  .editor { flex: 1; overflow-y: auto; min-height: 0; }
  .editor .hint { margin: 0 0 6px; }
  .pickgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 5px; }
  .pickgrid .chip { text-align: left; overflow: hidden; text-overflow: ellipsis; }
  .verdict { display: flex; align-items: baseline; gap: 14px; padding: 10px 14px; margin-bottom: 8px; border-left: 4px solid currentColor;
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%); }
  .verdict b { font-size: 34px; letter-spacing: .14em; line-height: 1; }
  .verdict span { font-size: 15px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .v-mine { color: var(--ok); background: rgb(53 208 127 / .12); }
  .v-core { color: var(--macro); background: rgb(184 108 230 / .16); }
  .v-low { color: var(--hud-hi); background: rgb(255 181 69 / .10); }
  .v-skip { color: var(--danger); background: rgb(209 72 58 / .10); }
  .facts { display: grid; grid-template-columns: 1.2fr .8fr 1.3fr; gap: 8px; margin-bottom: 8px; }
  .facts small, .kpis small { display: block; color: var(--dim); font-size: 10px; letter-spacing: .1em; }
  .facts b { font-size: 15px; }
  .facts b.core { color: var(--macro); }
  .lvl { display: inline-flex; gap: 2px; margin-right: 6px; vertical-align: middle; }
  .lvl i { width: 14px; height: 10px; background: var(--steel); border: 1px solid var(--rule); }
  .lvl i.on { background: var(--telemetry); border-color: var(--telemetry); }
  .mats { display: flex; flex-direction: column; gap: 2px; }
  .mat { display: grid; grid-template-columns: minmax(0, 11em) minmax(0, 1fr) 4.5em; align-items: center; gap: 8px; font-size: 13px;
    color: var(--muted); background: none; border: 0; padding: 4px 2px; text-align: left; }
  .mat:active { background: rgb(255 122 24 / .1); }
  .mat.target { color: var(--hud-hi); font-weight: 700; }
  .ml { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mbar { position: relative; height: 10px; background: var(--steel); }
  .mbar i { position: absolute; inset: 0 auto 0 0; background: var(--faint); }
  .mat.target .mbar i { background: var(--hud-hi); box-shadow: var(--glow); }
  .mbar em { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--text); opacity: .6; }
  .mp { text-align: right; }
  .dropped { margin: 4px 0 0; font-size: 11px; color: var(--dim); letter-spacing: .04em; }
  .dropped button { background: none; border: 0; padding: 2px 0; color: var(--danger); font: inherit; text-decoration: line-through; }

  table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: auto; }
  th { text-align: left; color: var(--dim); font-weight: 400; font-size: 10px; letter-spacing: .1em; padding: 4px 5px 5px; border-bottom: 1px solid var(--rule); white-space: nowrap; }
  td { padding: 5px; border-bottom: 1px solid #241708; white-space: nowrap; }
  td.cut { max-width: 0; width: 100%; overflow: hidden; text-overflow: ellipsis; }
  thead th { position: sticky; top: 0; background: var(--panel); }
  .vt { font-size: 10px; font-weight: 700; letter-spacing: .1em; padding: 1px 6px; }
  .vt.v-mine { background: var(--ok); color: var(--void); }
  .vt.v-core { background: var(--macro); color: var(--void); }

  /* session */
  .kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
  .kpis b { font-size: 16px; }
  .hold { margin-top: 8px; font-size: 12px; color: var(--dim); }
  .hold b { color: var(--text); }
  .hold b.bad { color: var(--danger); }
  .hold .line { display: flex; justify-content: space-between; gap: 8px; white-space: nowrap; }
  .hold .t { height: 6px; background: var(--steel); position: relative; margin-top: 3px; }
  .hold .t i { position: absolute; inset: 0 auto 0 0; background: var(--hud); }
  .hold .t i.junk { right: auto; background: var(--danger); }
  .refined { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 7px; font-size: 12px; color: var(--muted); }
  .rf.target { color: var(--hud-hi); }
  .rf.ign { color: var(--danger); text-decoration: line-through; }
  .rf b { color: var(--text); }
  .tools { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .tools span { font-size: 9.5px; letter-spacing: .08em; padding: 2px 6px; border: 1px solid var(--rule); color: var(--faint); }
  .tools span.on { color: var(--telemetry); border-color: var(--telemetry); }

  /* right column: one panel with tabs */
  .tabbed { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--panel); border: 1px solid var(--rule); }
  .tabs { display: grid; grid-template-columns: 1fr 1.4fr 1fr; flex: none; }
  .tabs button {
    min-height: 40px; font-size: 12px; font-weight: 800; letter-spacing: .14em; color: var(--muted); white-space: nowrap;
    background: linear-gradient(to bottom, #2b2014, var(--steel)); border: 0; border-bottom: 1px solid var(--rule); border-right: 1px solid var(--rule);
  }
  .tabs button:last-child { border-right: 0; }
  .tabs button.on { color: var(--hud); background: var(--panel); border-bottom-color: transparent; box-shadow: inset 0 3px var(--hud); }
  .tabs .n { color: var(--hud-hi); font-weight: 400; margin-left: 4px; }
  .tbody { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 8px 10px; }
  .sub { margin: 0 0 6px; font-size: 11px; color: var(--dim); }

  /* rings */
  .ring { display: grid; grid-template-columns: minmax(0, 1fr) auto auto 5.5em; column-gap: 10px; row-gap: 3px;
    padding: 6px 6px 7px 10px; border-bottom: 1px solid #241708; font-size: 12px; border-left: 3px solid var(--faint); }
  .ring.icy { border-left-color: var(--telemetry); }
  .ring.metal { border-left-color: var(--hud-hi); }
  .ring.rocky { border-left-color: #a7826a; }
  .ring.here { background: rgb(255 122 24 / .10); }
  .rn { min-width: 0; display: flex; gap: 6px; align-items: baseline; font-weight: 700; overflow: hidden; }
  .hereTag { font-size: 9px; letter-spacing: .1em; background: var(--hud); color: var(--void); padding: 0 4px; flex: none; }
  .rt, .rr { font-size: 10.5px; letter-spacing: .06em; color: var(--muted); white-space: nowrap; }
  .pristine { color: var(--ok) !important; }
  .rl { text-align: right; white-space: nowrap; }
  .sigs { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; }
  .sig { font-size: 10.5px; padding: 1px 6px; border: 1px solid var(--rule); color: var(--muted); }
  .sig.target { color: var(--void); background: var(--hud-hi); border-color: var(--hud-hi); font-weight: 700; }
  .own { font-size: 9.5px; letter-spacing: .08em; color: var(--ok); border: 1px solid var(--ok); padding: 1px 4px; }

  /* finder and sell */
  tr.here td { background: rgb(255 122 24 / .08); }
  .plot { min-height: 28px; color: var(--telemetry); border-color: var(--telemetry); }
  .plot.busy { color: var(--void); background: var(--telemetry); }
  .plot:disabled { opacity: .4; }
  .com { margin-bottom: 8px; }
  .ch { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 12.5px; padding: 3px 0; border-bottom: 1px solid var(--rule); white-space: nowrap; }
  .ch b.target { color: var(--hud-hi); }
  .sys { margin-left: 8px; }
  .age.fresh { color: var(--ok); } .age.ok { color: var(--muted); } .age.stale { color: var(--danger); }

  /* console: COMBAT's bays and tiles, four columns so the labels fit any monitor */
  .console { flex: none; display: flex; flex-direction: column; gap: 8px; height: 336px; }
  .bay { --g: var(--hud-hi); display: flex; background: var(--rail); border: 1px solid var(--rule); border-left: 0; min-height: 0; }
  .g-mine { --g: var(--hud); flex: 3 1 0; }
  .g-power { --g: var(--macro); flex: 1.1 1 0; }
  .bay h4 {
    margin: 0; flex: none; width: 30px; display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 10px 0; writing-mode: vertical-rl; transform: rotate(180deg);
    font-size: 12px; font-weight: 800; color: var(--g); letter-spacing: .22em; white-space: nowrap; overflow: hidden;
    background: linear-gradient(to left, color-mix(in srgb, var(--g) 26%, transparent), color-mix(in srgb, var(--g) 8%, transparent));
    border-right: 3px solid var(--g);
  }
  .bay h4 .st { font-size: 10px; font-weight: 400; color: var(--muted); letter-spacing: .08em; }
  .tiles { flex: 1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: minmax(0, 1fr); gap: 6px; padding: 7px; min-height: 0; min-width: 0; }
  .fgs { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)) minmax(0, 1.4fr); gap: 6px; min-height: 0; }
  .act {
    --tone: var(--faint);
    position: relative; display: flex; flex-direction: column; justify-content: center; gap: 3px;
    padding: 7px 9px 6px; text-align: left; min-width: 0; min-height: 0;
    background: linear-gradient(to bottom, #2b2014, var(--steel)); border: 1px solid var(--rule); border-top: 3px solid var(--tone);
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%);
  }
  .act b { letter-spacing: .04em; font-size: 13px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: clip; }
  .act small { color: var(--dim); font-size: 10.5px; white-space: nowrap; overflow: hidden; }
  .act .key { position: absolute; right: 12px; bottom: 3px; color: var(--dim); font-size: 9.5px; white-space: nowrap; }
  .act .key.nobind { color: var(--danger); }
  .act.fg { align-items: center; padding: 4px; }
  .act.fg b { font-size: 15px; }
  .act.fg small, .act.fg .key:not(.nobind) { display: none; }
  .act.fg .key.nobind { right: 50%; transform: translateX(50%); font-size: 8.5px; }
  .act.cyan { --tone: var(--telemetry); } .act.cyan b { color: var(--telemetry); }
  .act.amber { --tone: var(--hud-hi); } .act.amber b { color: var(--hud-hi); }
  .act.macro { --tone: var(--macro); background: linear-gradient(to bottom, #2d1d2c, var(--steel)); }
  .act.macro b { color: var(--macro); }
  .act.disabled { opacity: .38; cursor: not-allowed; }
  .act:active:not(:disabled) { filter: brightness(1.35); transform: translateY(1px); }
  .act.busy { animation: busy .5s linear infinite alternate; }
  @keyframes busy { to { filter: brightness(1.5); } }
  .act.x2 { grid-column: span 2; }
  .act .led { position: absolute; left: 9px; top: 6px; width: 18px; height: 3px; background: var(--faint); }
  .act.fg .led { left: 50%; transform: translateX(-50%); }
  .act.live .led { background: var(--ok); box-shadow: 0 0 6px var(--ok); }
  .act.live { background: linear-gradient(180deg, rgb(53 208 127 / .10), var(--steel) 60%); }
  .act.danger { background: linear-gradient(120deg, #c4412e, #8f2a20 55%, #5c1c15); border: 0; }
  .act.danger b, .act.danger small { color: #fff; }
  .act.danger .key.nobind { color: #ffd0c8; }
  .act.danger.armed { animation: busy .35s linear infinite alternate; box-shadow: 0 0 18px rgb(209 72 58 / .6); }
  .pips { display: flex; gap: 4px; align-items: flex-end; height: 22px; margin-top: 2px; }
  .pips i { width: 14px; background: var(--macro); }
</style>
