import type { YearCalendar } from './calendar';
import { optimize, SCENARIOS, type ScenarioDef } from './optimizer';
import { allocate, summarize, type Budget, type Plan, type PlanSummary } from './plan';
import type { Settings } from './types';

/** Gewicht je Urlaubstag in (bzw. außerhalb) der Schulferien – ein Brückentag bleibt wertvoller. */
const SCHOOL_BIAS = 0.5;

export interface ScenarioResult {
  def: ScenarioDef;
  plan: Plan;
  summary: PlanSummary;
  warnings: string[];
}

export function runScenario(cal: YearCalendar, budget: Budget, settings: Settings, def: ScenarioDef): ScenarioResult {
  const hasSchool = cal.schoolHolidays.length > 0;
  const mode = settings.schoolMode;
  const { taken, warnings } = optimize(cal, def, {
    budget: budget.plannable,
    requireLongBreak: settings.requireLongBreak,
    schoolBias: !hasSchool ? 0 : mode === 'prefer' ? SCHOOL_BIAS : mode === 'avoid' ? -SCHOOL_BIAS : 0,
    summerWindow: (mode === 'prefer' || mode === 'only') && cal.summerSchool ? cal.summerSchool : undefined,
  });
  const plan = allocate(cal, taken, budget, settings);
  return { def, plan, summary: summarize(cal, plan, budget), warnings };
}

export function runScenarios(cal: YearCalendar, budget: Budget, settings: Settings): ScenarioResult[] {
  return SCENARIOS.map((def) => runScenario(cal, budget, settings, def));
}
