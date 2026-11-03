<script lang="ts">
  import {
    ECONS, PLAN_PROFILES, STATS, STAT_LABEL, compareProfiles, defaultPlanConfig, planSystem, shortBody,
    type Econ, type ExploreSystem, type PlanConfig, type PlanProfileId, type PlanStep, type Stat,
  } from '@et/shared';
  import Panel from '../Panel.svelte';
  import Loading from '../Loading.svelte';
  import { viewport } from '../viewport.svelte.ts';

  // COLONY › PLAN: what to build next in a system whose first construction is done (docs/design/COLONY.md). The plan is
  // worked out here from Spansh's bodies and the settings kept on the server; BUILD stays for the site being supplied.
  // `hub`: the body of the finished build (where the carrier waits): bodies near it are worth more, far stars cost days of hauling
  let { system, hub = '' }: { system: string; hub?: string } = $props();

  const phone = $derived(viewport.device === 'phone');
  // raw: the plan reads the bodies thousands of times and reactive proxies made that take tens of seconds
  let sys = $state.raw<ExploreSystem | null>(null);
  let error = $state('');
  let cfg = $state<PlanConfig>(defaultPlanConfig());
  let ready = $state(false);

  $effect(() => {
    const name = system;
    sys = null;
    error = '';
    ready = false;
    let live = true;
    Promise.all([
      fetch('/api/explore/system', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) })
        .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error ?? r.statusText)))),
      fetch('/api/colony/plans').then(async (r) => (r.ok ? r.json() : Promise.reject(new Error('the saved plans could not be read')))),
    ])
      .then(([body, plans]) => {
        if (!live) return;
        sys = body as ExploreSystem;
        cfg = { ...defaultPlanConfig(), ...(plans[name.toLowerCase()] ?? {}) };
        // nothing is written until the player changes something: opening the screen never overwrites what was saved
        lastSaved = JSON.stringify($state.snapshot(cfg));
        ready = true;
      })
      .catch((e: Error) => live && (error = e.message));
    return () => (live = false);
  });

  // keep the settings on the server, a moment after the last change
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastSaved = '';
  $effect(() => {
    const snapshot = JSON.stringify($state.snapshot(cfg));
    if (!ready || snapshot === lastSaved) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      lastSaved = snapshot;
      void fetch('/api/colony/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ system, config: JSON.parse(snapshot) }) }).catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  });

  /** The first station's body: picked in settings, else the finished build's body, or its parent when that is a moon of a giant. */
  const hubBody = $derived.by(() => {
    if (!sys) return null;
    const find = (n: string) => {
      const h = n.trim().toLowerCase();
      return h ? sys!.bodies.find((b) => b.name.toLowerCase() === h || b.name.toLowerCase().endsWith(` ${h}`)) : undefined;
    };
    const picked = find(cfg.hub);
    if (picked) return picked;
    const site = find(hub);
    const parent = site && site.parent >= 0 ? sys.bodies.find((b) => b.id === site.parent) : undefined;
    return (parent && /giant/i.test(parent.subType) ? parent : site) ?? sys.bodies.find((b) => b.stations.length) ?? null;
  });
  const plan = $derived(sys ? planSystem(sys.name, sys.bodies, $state.snapshot(cfg) as PlanConfig, hubBody ? { ls: hubBody.ls, body: hubBody.name } : null) : null);
  const todo = $derived(plan?.steps.filter((s) => !s.done) ?? []);
  const built = $derived(plan?.steps.filter((s) => s.done) ?? []);
  const next = $derived(todo[0] ?? null);
  const profile = $derived(PLAN_PROFILES.find((p) => p.id === cfg.profile) ?? PLAN_PROFILES[0]);
  const weights = $derived(cfg.profile === 'custom' ? cfg.weights : profile.weights);
  const short = (n: string) => shortBody(n, system);

  function setProfile(id: PlanProfileId) {
    // CUSTOM starts from the profile you were on
    if (id === 'custom' && cfg.profile !== 'custom') cfg.weights = { ...(PLAN_PROFILES.find((p) => p.id === cfg.profile)?.weights ?? cfg.weights) };
    cfg.profile = id;
  }
  const toggleDone = (s: PlanStep) => {
    cfg.done = s.done ? cfg.done.filter((k) => k !== s.key) : [...cfg.done, s.key];
  };
  /** Marking a step built moves the points with it; only the first step of the list can be ticked, in order. */
  const canTick = (s: PlanStep) => s.done ? s.key === built[built.length - 1]?.key : s.key === next?.key;
  function setSlot(name: string, kind: 'surface' | 'orbital', v: string) {
    const cur = { ...(cfg.slots[name] ?? {}) };
    if (v === '') delete cur[kind];
    else cur[kind] = Math.max(0, Math.min(12, Math.round(Number(v)) || 0));
    if (Object.keys(cur).length) cfg.slots[name] = cur;
    else delete cfg.slots[name];
  }
  const toggleSkip = (name: string) => {
    cfg.excluded = cfg.excluded.includes(name) ? cfg.excluded.filter((n) => n !== name) : [...cfg.excluded, name];
  };
  const setPoint = (k: 't2' | 't3', v: string) => (cfg.points[k] = Math.max(0, Math.min(99, Math.round(Number(v)) || 0)));
  const ECON_LABEL: Record<Econ, string> = { extraction: 'EXTRACTION', industrial: 'INDUSTRIAL', refinery: 'REFINERY', hightech: 'HIGH TECH', tourism: 'TOURISM', agriculture: 'AGRICULTURE' };
  const ECON_COLOUR: Record<Econ, string> = { extraction: '#ff5a4a', industrial: '#ffd84a', refinery: '#ff9a3a', hightech: '#37c6d4', tourism: '#c58cff', agriculture: '#7ad050' };
  const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  // what the table adds up to, to compare with the game's system map (the first station's slot is taken off in the plan)
  const slotTotals = $derived.by(() => {
    const on = slotRows.filter((r) => !cfg.excluded.includes(r.name));
    const surface = on.reduce((n, r) => n + r.surface, 0);
    const orbital = on.reduce((n, r) => n + r.orbital, 0);
    const guessed = on.filter((r) => r.surfaceGuess || r.orbitalGuess).length;
    return { surface, orbital, guessed, usable: surface + orbital - (hubBody ? 1 : 0) };
  });
  const slotRows = $derived(
    (plan?.slots ?? []).filter((r) => r.surface > 0 || r.orbital > 0 || cfg.slots[r.name] || r.type !== 'Planet')
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
  );
  // the vocation: the same slots under each ready-made profile, run on demand (it plans the system five times)
  let vocation = $state.raw<ReturnType<typeof compareProfiles> | null>(null);
  let working = $state(false);
  function findVocation() {
    if (!sys) return;
    working = true;
    setTimeout(() => {
      vocation = compareProfiles(sys!.name, sys!.bodies, $state.snapshot(cfg) as PlanConfig, hubBody ? { ls: hubBody.ls, body: hubBody.name } : null);
      working = false;
    }, 30);
  }
  const mixText = (m: Partial<Record<Econ, number>>, n = 3) => ECONS.filter((e) => m[e]).sort((a, b) => (m[b] ?? 0) - (m[a] ?? 0)).slice(0, n).map((e) => `${ECON_LABEL[e].toLowerCase()} ${m[e]}`).join(' · ');
  let sideTab = $state<'result' | 'slots'>('result');
  const STAT_COLOUR: Record<Stat, string> = { security: '#e0705a', wealth: '#ffd84a', tech: '#37c6d4', sol: '#7ad050', dev: '#c58cff' };
  const statMax = $derived(Math.max(1, ...STATS.map((st) => Math.abs(plan?.stats[st] ?? 0))));
  const resetStats = () => (cfg.stats = { ...defaultPlanConfig().stats });
  const orbitalN = $derived(todo.filter((s) => s.slot === 'orbital').length);
  const surfaceN = $derived(todo.filter((s) => s.slot === 'surface').length);
  const mixTotal = $derived(Object.values(plan?.mix ?? {}).reduce((n, v) => n + (v ?? 0), 0));
</script>

{#snippet settings()}
  <div class="set">
    <div class="g">
      <span class="k">PROFILE</span>
      <div class="chips">
        {#each PLAN_PROFILES as p (p.id)}<button class:on={cfg.profile === p.id} onclick={() => setProfile(p.id)} title={p.hint}>{p.label}</button>{/each}
      </div>
      <span class="hint">{profile.hint}</span>
    </div>
    <div class="g">
      <span class="k">WHAT IT AIMS FOR {cfg.profile === 'custom' ? '· DRAG TO CHOOSE' : ''}</span>
      {#each ECONS as e (e)}
        <label class="w" style:--c={ECON_COLOUR[e]}>
          <span class="wn">{ECON_LABEL[e]}</span>
          {#if cfg.profile === 'custom'}
            <input type="range" min="0" max="3" step="0.5" bind:value={cfg.weights[e]} aria-label="{ECON_LABEL[e]} weight" />
          {:else}
            <span class="wb"><s style:width="{(weights[e] / 3) * 100}%"></s></span>
          {/if}
          <span class="wv num">{weights[e]}</span>
        </label>
      {/each}
    </div>
    <div class="g">
      <span class="k" title="Every facility also moves the system's numbers. Drag to say which ones you care about: 0 ignores it, 3 above all.">PRIORITY · SYSTEM NUMBERS</span>
      {#each STATS as st (st)}
        <label class="w" style:--c={STAT_COLOUR[st]}>
          <span class="wn">{STAT_LABEL[st]}</span>
          <input type="range" min="0" max="3" step="0.5" bind:value={cfg.stats[st]} aria-label="{STAT_LABEL[st]} priority" />
          <span class="wv num">{cfg.stats[st]}</span>
        </label>
      {/each}
      <span class="hint">decides what goes in the slots that give no economy <button class="lnk" onclick={resetStats}>RESET</button></span>
    </div>
    <div class="g">
      <span class="k" title="Pirate Outpost and Pirate Base Installation: wealth and a service economy, at a large cost in security">PIRATE BUILDS</span>
      <div class="chips">
        <button class:on={!cfg.pirates} onclick={() => (cfg.pirates = false)}>NOT ALLOWED</button>
        <button class:on={cfg.pirates} onclick={() => (cfg.pirates = true)}>ALLOWED</button>
      </div>
    </div>
    <div class="g">
      <span class="k" title="The body the first station orbits: it uses one orbital slot, and bodies near it are worth more (less hauling)">FIRST STATION AT</span>
      <select value={cfg.hub} onchange={(e) => (cfg.hub = e.currentTarget.value)} aria-label="Body of the first station">
        <option value="">{hubBody ? `auto · ${short(hubBody.name)}` : 'auto'}</option>
        {#each sys?.bodies.filter((b) => b.type === 'Planet') ?? [] as b (b.name)}<option value={b.name}>{short(b.name)} · {b.subType.replace(/ body$/, '')}</option>{/each}
      </select>
    </div>
    <div class="g">
      <span class="k" title="As the game's system map shows them. After the first Coriolis: 0 T2 and 1 T3.">POINTS NOW</span>
      <div class="pts">
        <label>T2 <input type="number" min="0" max="99" value={cfg.points.t2} onchange={(e) => setPoint('t2', e.currentTarget.value)} /></label>
        <label>T3 <input type="number" min="0" max="99" value={cfg.points.t3} onchange={(e) => setPoint('t3', e.currentTarget.value)} /></label>
      </div>
      <span class="hint">type what the game's system map shows; steps you tick as built are added on top</span>
    </div>
    <div class="g">
      <span class="k">STEPS TO PLAN</span>
      <div class="chips">
        {#each [14, 40, 80, 125, 200] as n (n)}<button class:on={cfg.steps === n} onclick={() => (cfg.steps = n)}>{n}</button>{/each}
      </div>
    </div>
  </div>
{/snippet}

{#snippet steps()}
  {#if plan}
    <div class="ledger">
      <div class="lh">
        <span>NOW <b class="num t2">{plan.start.t2} T2</b> <b class="num t3">{plan.start.t3} T3</b></span>
        <i></i>
        <span>AFTER THE PLAN <b class="num t2">{plan.end.t2} T2</b> <b class="num t3">{plan.end.t3} T3</b></span>
      </div>
      <div class="lh sub"><span>{orbitalN} ORBITAL · {surfaceN} SURFACE</span><i></i><span>tick a step when it is built, in order</span></div>
      {#if !plan.steps.length}
        <p class="dim">Nothing to plan yet.</p>
      {/if}
      {#each plan.steps as st, i (st.key)}
        <div class="step" class:done={st.done} class:anchor={st.purpose === 'anchor'} class:next={next?.key === st.key}>
          <button class="tick" class:on={st.done} disabled={!canTick(st)} onclick={() => toggleDone(st)}
            title={st.done ? 'Undo (the last built step only)' : canTick(st) ? 'Mark as built' : 'Steps are built in order'} aria-label={st.done ? 'Built' : 'Mark as built'}>{st.done ? '✓' : ''}</button>
          <span class="n num">{i + 1}</span>
          <div class="what">
            <div class="top">
              <b class="kn">{st.kind.name}</b>
              <span class="on">at <b>{short(st.body)}</b>{#if st.guess}<em class="gs" title="The slot count is an estimate: confirm it in the game's system map">slot ?</em>{/if}</span>
              {#if st.econ}<span class="chip" style:--c={ECON_COLOUR[st.econ]}>{ECON_LABEL[st.econ]}</span>{/if}
              {#if next?.key === st.key}<span class="nx">NEXT</span>{/if}
            </div>
            <div class="why">{st.why.filter(Boolean).join(' · ')}</div>
          </div>
          <div class="d">
            <span class="num t2" class:z={!st.t2}>{signed(st.t2)} T2</span>
            <span class="num t3" class:z={!st.t3}>{signed(st.t3)} T3</span>
          </div>
          <div class="bal num" title="Balance after this step"><span class="t2">{st.after.t2}</span> · <span class="t3">{st.after.t3}</span></div>
        </div>
      {/each}
      {#each plan.notes as n (n)}<div class="note">{n}</div>{/each}
    </div>
  {/if}
{/snippet}

{#snippet result()}
  {#if plan}
    <section class="sec">
      <header><span>SYSTEM VOCATION</span><i></i><em>{vocation ? 'with your slots' : ''}</em></header>
      <p class="dim small">Plans the system under each ready-made profile and shows which one puts the most of its potential to use.</p>
      <button class="find" onclick={findVocation} disabled={working}>{working ? 'WORKING…' : vocation ? 'RUN AGAIN' : 'FIND VOCATION'}</button>
      {#if vocation}
        {#each vocation as v, i (v.id)}
          <button class="voc" class:best={i === 0} class:on={cfg.profile === v.id} onclick={() => setProfile(v.id as PlanProfileId)} title="Use this profile">
            <b>{i === 0 ? '★ ' : ''}{v.label}</b>
            <span class="num">{v.used.toFixed(1)}</span>
            <small title="{v.builds} builds · {mixText(v.mix, 6)}">{mixText(v.mix, 2)}</small>
          </button>
        {/each}
        <p class="dim small">The number is how much the plan takes from what the bodies offer and from your priorities (the profile's weights are not counted, so profiles compare fairly).</p>
      {/if}
    </section>
    <section class="sec">
      <header><span>WHERE IT LEADS</span><i></i><em>{mixTotal} facilities</em></header>
      {#each ECONS as e (e)}
        {#if plan.mix[e]}
          <div class="mixrow" style:--c={ECON_COLOUR[e]}><span>{ECON_LABEL[e]}</span><span class="mb"><s style:width="{((plan.mix[e] ?? 0) / Math.max(1, mixTotal)) * 100}%"></s></span><b class="num">{plan.mix[e]}</b></div>
        {/if}
      {/each}
      {#if !mixTotal}<p class="dim">The plan has no economy-specific facility yet.</p>{/if}
      <div class="rsv" title="Ring reserve levels add 0.4 to extraction, industry and refining when major or pristine">
        RESERVES <b class:ok={plan.goodReserve}>{plan.reserve || 'unknown'}</b>{plan.goodReserve ? ' · +0.4 counted' : ''}</div>
    </section>
    <section class="sec">
      <header><span>WHAT IT DOES TO THE SYSTEM</span><i></i><em>chevrons, as RavenColonial</em></header>
      {#each STATS as st (st)}
        {@const v = plan.stats[st]}
        <div class="mixrow" style:--c={v < 0 ? 'var(--danger)' : STAT_COLOUR[st]}>
          <span>{STAT_LABEL[st]}</span>
          <span class="mb"><s style:width="{(Math.abs(v) / statMax) * 100}%"></s></span>
          <b class="num" class:neg={v < 0}>{signed(v)}</b>
        </div>
      {/each}
      <p class="dim small">Sum over every build in the plan, those already built included. The first Coriolis counts only when you tick it.</p>
    </section>
  {/if}
{/snippet}

{#snippet slotsTable()}
  {#if plan}
    <section class="sec">
      <header><span>BODY SLOTS</span><i></i><em>blank = estimate</em></header>
      <p class="dim small">Slots are not in any public data. Type the counts exactly as the game's system map shows them, the first station's slot included: the plan takes that slot off by itself. A number replaces the estimate (?). A body that gives nothing you asked for is left out of the plan.</p>
      <div class="slots">
        <div class="sh"><span>BODY</span><span>SURFACE</span><span>ORBITAL</span><span title="Leave out of the plan">SKIP</span></div>
        {#each slotRows as r (r.name)}
          <div class="sr" class:skip={cfg.excluded.includes(r.name)}>
            <span class="bn">{short(r.name)}</span>
            <input type="number" min="0" max="12" placeholder={r.surfaceGuess ? `${r.surface}?` : `${r.surface}`} value={cfg.slots[r.name]?.surface ?? ''}
              onchange={(e) => setSlot(r.name, 'surface', e.currentTarget.value)} aria-label="Surface slots of {short(r.name)}" />
            <input type="number" min="0" max="12" placeholder={r.orbitalGuess ? `${r.orbital}?` : `${r.orbital}`} value={cfg.slots[r.name]?.orbital ?? ''}
              onchange={(e) => setSlot(r.name, 'orbital', e.currentTarget.value)} aria-label="Orbital slots of {short(r.name)}" />
            <input type="checkbox" checked={cfg.excluded.includes(r.name)} onchange={() => toggleSkip(r.name)} aria-label="Skip {short(r.name)}" />
          </div>
        {/each}
        <div class="sr tot">
          <span class="bn">TOTAL</span><span class="num">{slotTotals.surface}</span><span class="num">{slotTotals.orbital}</span><span></span>
        </div>
      </div>
      <p class="dim small">{slotTotals.surface + slotTotals.orbital} slots in the table{slotTotals.guessed ? ` (${slotTotals.guessed} bodies still estimated)` : ''}; the first station's slot comes off, so {slotTotals.usable} can be built, and the plan uses {plan.steps.length}. If the game's map adds up to less, a number here is too high.</p>
    </section>
  {/if}
{/snippet}

{#snippet side()}
  <div class="chips tabs">
    <button class:on={sideTab === 'result'} onclick={() => (sideTab = 'result')}>RESULT</button>
    <button class:on={sideTab === 'slots'} onclick={() => (sideTab = 'slots')}>BODY SLOTS</button>
  </div>
  {#if sideTab === 'result'}{@render result()}{:else}{@render slotsTable()}{/if}
{/snippet}

{#if error}
  <Panel title="Plan"><p class="bad">{error}</p></Panel>
{:else if !sys || !plan}
  <Panel title="Plan"><Loading block label="LOADING SYSTEM" /></Panel>
{:else if phone}
  <div class="plan phone">
    <Panel title="Settings" aside={profile.label}>{@render settings()}</Panel>
    <Panel title="Plan" aside="{todo.length} to build · {built.length} built">{@render steps()}</Panel>
    <Panel title="System" aside="{todo.length} builds">{@render side()}</Panel>
  </div>
{:else}
  <div class="plan">
    <Panel title="Settings" aside={sys.name}>{@render settings()}</Panel>
    <Panel title="Plan" aside="{todo.length} to build · {built.length} built">{@render steps()}</Panel>
    <Panel title="System" aside="{todo.length} builds">{@render side()}</Panel>
  </div>
{/if}

<style>
  .plan { display: grid; gap: 8px; height: 100%; min-height: 0; grid-template-columns: 290px minmax(0, 1fr) 340px; }
  @media (max-width: 1250px) { .plan { grid-template-columns: 250px minmax(0, 1fr) 290px; } }
  @media (max-width: 1000px) { .plan { grid-template-columns: minmax(0, 1fr); height: auto; } }
  .plan.phone { display: flex; flex-direction: column; gap: 8px; height: auto; }
  .num { font-variant-numeric: tabular-nums; }
  .dim { color: var(--dim); font-size: 12px; }
  .small { font-size: 11px; margin: 0 0 6px; }
  .bad { color: var(--danger); font-size: 13px; }
  .k { color: var(--dim); font-size: 10px; letter-spacing: 0.1em; }
  .hint { color: var(--dim); font-size: 11px; }

  .set { display: flex; flex-direction: column; gap: 14px; }
  .g { display: flex; flex-direction: column; gap: 4px; }
  .chips { display: flex; flex-wrap: wrap; gap: 3px; }
  .chips button {
    padding: 5px 9px; background: var(--steel); border: 1px solid var(--rule); color: var(--muted); font: inherit; font-size: 10px; letter-spacing: 0.08em; cursor: pointer;
  }
  .chips button.on { background: var(--hud); border-color: var(--hud); color: #1a0f05; }
  .w { display: flex; align-items: center; gap: 8px; font-size: 10px; letter-spacing: 0.08em; min-height: 22px; }
  .wn { flex: none; width: 92px; color: var(--muted); }
  .wb { flex: 1; height: 6px; background: var(--steel); border: 1px solid var(--rule); }
  .wb s { display: block; height: 100%; background: var(--c); }
  .w input[type='range'] { flex: 1; min-width: 0; accent-color: var(--c); height: 22px; }
  .wv { flex: none; width: 24px; text-align: right; color: var(--hud-hi); }
  .pts { display: flex; gap: 10px; }
  .pts label { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; letter-spacing: 0.1em; color: var(--hud-hi); }
  input[type='number'] {
    width: 54px; padding: 5px 6px; background: var(--steel); border: 1px solid var(--rule); color: var(--text); font: inherit; font-size: 13px; text-align: right;
  }
  input[type='number']::placeholder { color: var(--faint); }
  input[type='number'] { appearance: textfield; -moz-appearance: textfield; }
  input[type='number']::-webkit-inner-spin-button, input[type='number']::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }

  .t2 { color: #ffb545; }
  .t3 { color: #37c6d4; }
  .z { opacity: 0.35; }
  .lh { display: flex; align-items: center; gap: 10px; font-size: 10px; letter-spacing: 0.12em; color: var(--dim); margin-bottom: 6px; }
  .lh i { flex: 1; height: 1px; background: var(--rule); }
  .lh b { margin-left: 6px; font-size: 12px; }
  .step {
    display: grid; grid-template-columns: 26px 24px minmax(0, 1fr) auto 62px; align-items: center; gap: 8px; padding: 6px 4px;
    border-bottom: 1px solid color-mix(in srgb, var(--rule) 60%, transparent);
  }
  .step.done { opacity: 0.55; }
  .step.anchor { background: color-mix(in srgb, var(--hud) 7%, transparent); }
  .step.next { outline: 1px solid var(--hud); outline-offset: -1px; background: color-mix(in srgb, var(--hud) 11%, transparent); }
  .tick { width: 24px; height: 24px; padding: 0; background: var(--steel); border: 1px solid var(--rule); color: var(--ok); font-weight: 800; cursor: pointer; }
  .tick:disabled { opacity: 0.3; cursor: default; }
  .tick.on { border-color: var(--ok); }
  .n { color: var(--dim); font-size: 11px; text-align: right; }
  .top { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; }
  .kn { font-size: 13px; color: var(--hud-hi); }
  .on { font-size: 12px; color: var(--muted); }
  .on b { color: var(--text); }
  .on em { font-style: normal; color: var(--dim); }
  .on .gs { margin-left: 8px; }
  select { padding: 5px 6px; background: var(--steel); border: 1px solid var(--rule); color: var(--text); font: inherit; font-size: 12px; max-width: 100%; }
  .chip { font-size: 9px; font-weight: 800; letter-spacing: 0.1em; padding: 0 5px; border: 1px solid var(--c); color: var(--c); }
  .nx { font-size: 9px; font-weight: 800; letter-spacing: 0.14em; padding: 0 5px; background: var(--hud); color: #1a0f05; }
  .why { font-size: 11px; color: var(--dim); margin-top: 1px; overflow-wrap: anywhere; }
  .d { display: flex; flex-direction: column; text-align: right; font-size: 11px; font-weight: 700; }
  .bal { text-align: right; font-size: 12px; }
  .note { margin-top: 8px; padding: 6px 8px; font-size: 11px; color: var(--muted); border-left: 2px solid var(--hud); background: var(--steel); }

  .sec { margin-bottom: 14px; }
  .sec header { display: flex; align-items: center; gap: 8px; font-size: 10px; letter-spacing: 0.14em; color: var(--hud); margin-bottom: 6px; }
  .sec header i { flex: 1; height: 1px; background: var(--rule); }
  .sec header em { font-style: normal; letter-spacing: 0; color: var(--dim); }
  .mixrow { display: flex; align-items: center; gap: 8px; font-size: 10px; letter-spacing: 0.08em; min-height: 20px; color: var(--muted); }
  .mixrow > span:first-child { flex: none; width: 92px; }
  .mb { flex: 1; height: 6px; background: var(--steel); border: 1px solid var(--rule); }
  .mb s { display: block; height: 100%; background: var(--c); }
  .find { width: 100%; margin: 6px 0; padding: 6px; font: inherit; font-size: 11px; letter-spacing: 0.12em; color: var(--hud-hi); background: transparent; border: 1px solid var(--hud); cursor: pointer; }
  .find:disabled { opacity: 0.6; cursor: wait; }
  .voc { display: grid; grid-template-columns: 1fr auto; gap: 0 8px; width: 100%; margin-bottom: 4px; padding: 5px 8px; text-align: left; font: inherit; color: var(--text); background: transparent; border: 1px solid var(--line); cursor: pointer; }
  .voc b { font-size: 11px; letter-spacing: 0.1em; }
  .voc small { grid-column: 1 / -1; color: var(--dim); font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .voc.best { border-color: var(--hud); }
  .voc.on { background: rgba(255, 122, 24, 0.12); }
  .lnk { margin-left: 6px; padding: 0 4px; background: none; border: 0; color: var(--hud); font: inherit; font-size: 10px; letter-spacing: 0.1em; cursor: pointer; text-decoration: underline; }
  .lh.sub { margin-top: -2px; font-size: 9px; }
  .tabs { margin-bottom: 10px; }
  .tabs button { flex: 1; padding: 7px 9px; }
  .mixrow b.neg { color: var(--danger); }
  .rsv { margin-top: 8px; font-size: 10px; letter-spacing: 0.1em; color: var(--dim); }
  .rsv b { color: var(--hud-hi); }
  .rsv b.ok { color: var(--ok); }
  .slots { display: flex; flex-direction: column; }
  .sh, .sr { display: grid; grid-template-columns: minmax(0, 1fr) 64px 64px 36px; gap: 6px; align-items: center; padding: 2px 0; }
  .sh { font-size: 9px; letter-spacing: 0.12em; color: var(--dim); }
  .sh span:not(:first-child) { text-align: right; }
  .sh span:last-child { text-align: center; }
  .sr { border-bottom: 1px solid color-mix(in srgb, var(--rule) 45%, transparent); }
  .sr.tot { border-top: 1px solid var(--hud); border-bottom: 0; font-weight: 800; color: var(--hud-hi); }
  .sr.tot .num { text-align: right; padding-right: 6px; }
  .sr .bn { font-size: 12px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sr input[type='number'] { width: 100%; padding: 3px 5px; font-size: 12px; }
  .sr input[type='checkbox'] { justify-self: center; width: 16px; height: 16px; accent-color: var(--hud); }
  .sr.skip .bn { text-decoration: line-through; color: var(--faint); }
</style>
