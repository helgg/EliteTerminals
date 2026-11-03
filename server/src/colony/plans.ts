// COLONY › PLAN settings, one per system, kept on disk: the profile, the weights, the points and the slots typed by the
// player, and the steps marked as built. The plan itself is computed from them (shared/colonyPlan.ts), never stored.
import { ECONS, PLAN_PROFILES, STATS, defaultPlanConfig, type PlanConfig } from '@et/shared';

const int = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};
const names = (v: unknown, max = 400) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length < 160).slice(0, max) : []);

/** Whatever the client sent → a valid PlanConfig (unknown fields dropped, numbers clamped). */
export function sanitizePlan(raw: unknown): PlanConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const d = defaultPlanConfig();
  const weights = { ...d.weights };
  for (const e of ECONS) {
    const n = Number(r.weights?.[e]);
    if (Number.isFinite(n)) weights[e] = Math.min(3, Math.max(0, Math.round(n * 10) / 10));
  }
  const stats = { ...d.stats };
  for (const st of STATS) {
    const n = Number(r.stats?.[st]);
    if (Number.isFinite(n)) stats[st] = Math.min(3, Math.max(0, Math.round(n * 2) / 2));
  }
  const slots: PlanConfig['slots'] = {};
  if (r.slots && typeof r.slots === 'object') {
    for (const [name, v] of Object.entries(r.slots as Record<string, any>).slice(0, 400)) {
      if (name.length > 160 || !v || typeof v !== 'object') continue;
      const one: { surface?: number; orbital?: number } = {};
      if (v.surface !== undefined && v.surface !== null && v.surface !== '') one.surface = int(v.surface, 0, 12, 0);
      if (v.orbital !== undefined && v.orbital !== null && v.orbital !== '') one.orbital = int(v.orbital, 0, 12, 0);
      if (Object.keys(one).length) slots[name] = one;
    }
  }
  return {
    profile: PLAN_PROFILES.some((p) => p.id === r.profile) ? r.profile : d.profile,
    weights,
    stats,
    points: { t2: int(r.points?.t2, 0, 99, d.points.t2), t3: int(r.points?.t3, 0, 99, d.points.t3) },
    slots,
    done: names(r.done),
    excluded: names(r.excluded),
    pirates: r.pirates === true,
    hub: typeof r.hub === 'string' && r.hub.length < 160 ? r.hub : '',
    steps: int(r.steps, 1, 200, d.steps),
  };
}
