import type { YearCalendar } from './calendar';
import { optimize, SCENARIOS, type ScenarioDef } from './optimizer';
import { allocate, summarize, type Budget, type Plan, type PlanSummary } from './plan';
import type { Settings } from './types';

export interface ScenarioResult {
  def: ScenarioDef;
  plan: Plan;
  summary: PlanSummary;
  warnings: string[];
}

export function runScenario(cal: YearCalendar, budget: Budget, settings: Settings, def: ScenarioDef): ScenarioResult {
  const { taken, warnings } = optimize(cal, def, {
    budget: budget.plannable,
    requireLongBreak: settings.requireLongBreak,
  });
  const plan = allocate(cal, taken, budget, settings);
  return { def, plan, summary: summarize(cal, plan, budget), warnings };
}

export function runScenarios(cal: YearCalendar, budget: Budget, settings: Settings): ScenarioResult[] {
  return SCENARIOS.map((def) => runScenario(cal, budget, settings, def));
}
