import { LinearClient } from "../linear/client";
import { getIssuesQueryForDateRange, getProjectsQueryForDateRange } from "../linear/queries";
import type { LinearIssue, LinearProject, PeriodMetrics, CTOTicketMetrics, UnclassifiedIssue, UnclassifiedProject } from "../types";

const BRAND_LABELS = [
  "Airalo", "B2B", "BackOffice", "Cuy", "Fimo",
  "Finanzas", "Guinea", "Habla+", "Legales", "PeruSim+",
  "SAC", "Tech", "Wings",
];

const TYPE_LABELS = ["Error", "Requerimiento", "Hallazgo"];

const EXCLUDED_STATES_LOWER = new Set([
  "discarded", "descartado", "descartados",
  "duplicate", "duplicado",
  "cancelled", "canceled", "cancelado", "cancelados",
  "monitoring",
]);
const CE2_TEAM_KEYS = ["CE2", "CE1"];

function isExcludedState(name: string): boolean {
  return EXCLUDED_STATES_LOWER.has(name.toLowerCase());
}

// Infer issue type from solution labels when no direct type label exists
const SOLUTION_TO_TYPE: Record<string, string> = {
  bugfix: "Error", hotFix: "Error", workaround: "Error",
  feature: "Requerimiento", research: "Requerimiento",
};

export class CTOMetricsService {
  constructor(private client: LinearClient) {}

  async getIssuesForDateRange(startDate: string, endDate: string): Promise<LinearIssue[]> {
    return this.client.queryAllIssues<LinearIssue>(
      (cursor) => getIssuesQueryForDateRange(startDate, endDate, cursor)
    );
  }

  async getProjectsForDateRange(startDate: string, endDate: string): Promise<LinearProject[]> {
    const all = await this.client.queryAllNodes<LinearProject>(
      (cursor) => getProjectsQueryForDateRange(startDate, endDate, cursor),
      "projects"
    );
    return all.filter(
      (p) => p.teams.nodes.some((t) => CE2_TEAM_KEYS.includes(t.key)) &&
             !isExcludedState(p.state)
    );
  }

  // Returns brand label for a project (first matching brand or "Sin marca")
  private getProjectBrand(labels: string[]): string {
    return BRAND_LABELS.find((b) => labels.includes(b)) ?? "Sin marca";
  }

  // Returns type label from labels — direct label first, then infer from solution
  private getTypeFromLabels(labels: string[]): string {
    const direct = TYPE_LABELS.find((t) => labels.includes(t));
    if (direct) return direct;
    for (const [sol, type] of Object.entries(SOLUTION_TO_TYPE)) {
      if (labels.includes(sol)) return type;
    }
    return "Sin tipo";
  }

  private getProjectType(labels: string[]): string {
    return this.getTypeFromLabels(labels);
  }

  // Converts a project to a PeriodMetrics-compatible record (count=1, time from startedAt→completedAt)
  private projectToTimeHours(p: LinearProject): number | null {
    if (!p.startedAt || !p.completedAt) return null;
    const h = (new Date(p.completedAt).getTime() - new Date(p.startedAt).getTime()) / (1000 * 60 * 60);
    return h > 0 ? Math.round(h * 10) / 10 : null;
  }

  private mergeMetrics(a: PeriodMetrics, b: PeriodMetrics): PeriodMetrics {
    const count = a.count + b.count;
    const timedCount = a.timed_count + b.timed_count;
    const totalTime = (a.total_time_hours ?? 0) + (b.total_time_hours ?? 0);
    return {
      count,
      timed_count: timedCount,
      total_time_hours: timedCount > 0 ? Math.round(totalTime * 10) / 10 : null,
      avg_attention_hours: timedCount > 0 ? Math.round((totalTime / timedCount) * 10) / 10 : null,
    };
  }

  // Build a PeriodMetrics from a list of projects
  private calcProjectMetrics(projs: LinearProject[]): PeriodMetrics {
    const count = projs.length;
    const timed = projs.map((p) => this.projectToTimeHours(p)).filter((h): h is number => h !== null);
    if (timed.length === 0) return { count, avg_attention_hours: null, total_time_hours: null, timed_count: 0 };
    const total = Math.round(timed.reduce((a, b) => a + b, 0) * 10) / 10;
    return { count, timed_count: timed.length, total_time_hours: total, avg_attention_hours: Math.round((total / timed.length) * 10) / 10 };
  }

  calculateMetrics(issues: LinearIssue[], projects: LinearProject[], periodLabel: string): CTOTicketMetrics {
    const validIssues = issues.filter(
      (i) => i.state.type !== "cancelled" && !isExcludedState(i.state.name) && !i.project
    );

    const issueTotal = this.calcPeriodMetrics(validIssues);
    const projectTotal = this.calcProjectMetrics(projects);
    const total = this.mergeMetrics(issueTotal, projectTotal);

    const issueUnbranded = validIssues.filter(
      (i) => !i.labels.nodes.some((l) => BRAND_LABELS.includes(l.name))
    );

    const allBrands = [...BRAND_LABELS, "Sin marca"];

    const by_brand: Record<string, PeriodMetrics> = {};
    for (const brand of allBrands) {
      const bIssues = brand === "Sin marca"
        ? issueUnbranded
        : validIssues.filter((i) => i.labels.nodes.some((l) => l.name === brand));
      const bProjects = projects.filter((p) => this.getProjectBrand(p.labels.nodes.map((l) => l.name)) === brand);
      by_brand[brand] = this.mergeMetrics(this.calcPeriodMetrics(bIssues), this.calcProjectMetrics(bProjects));
    }

    const by_type: Record<string, PeriodMetrics> = {};
    const allTypes = [...TYPE_LABELS, "Sin tipo"];
    for (const type of allTypes) {
      const tIssues = validIssues.filter(
        (i) => this.getTypeFromLabels(i.labels.nodes.map((l) => l.name)) === type
      );
      const tProjects = projects.filter((p) => this.getProjectType(p.labels.nodes.map((l) => l.name)) === type);
      by_type[type] = this.mergeMetrics(this.calcPeriodMetrics(tIssues), this.calcProjectMetrics(tProjects));
    }

    const by_brand_and_type: Record<string, Record<string, PeriodMetrics>> = {};
    const by_brand_and_type_issues: Record<string, Record<string, PeriodMetrics>> = {};
    const by_brand_and_type_projects: Record<string, Record<string, PeriodMetrics>> = {};
    for (const brand of allBrands) {
      const bIssues = brand === "Sin marca"
        ? issueUnbranded
        : validIssues.filter((i) => i.labels.nodes.some((l) => l.name === brand));
      const bProjects = projects.filter((p) => this.getProjectBrand(p.labels.nodes.map((l) => l.name)) === brand);
      by_brand_and_type[brand] = {};
      by_brand_and_type_issues[brand] = {};
      by_brand_and_type_projects[brand] = {};
      for (const type of allTypes) {
        const tIssues = bIssues.filter(
          (i) => this.getTypeFromLabels(i.labels.nodes.map((l) => l.name)) === type
        );
        const tProjects = bProjects.filter((p) => this.getProjectType(p.labels.nodes.map((l) => l.name)) === type);
        by_brand_and_type[brand][type] = this.mergeMetrics(this.calcPeriodMetrics(tIssues), this.calcProjectMetrics(tProjects));
        by_brand_and_type_issues[brand][type] = this.calcPeriodMetrics(tIssues);
        by_brand_and_type_projects[brand][type] = this.calcProjectMetrics(tProjects);
      }
    }

    // Collect issues sin marca o sin tipo para mostrar en el dashboard
    const unclassified_issues: UnclassifiedIssue[] = validIssues
      .filter(i => {
        const labelNames = i.labels.nodes.map(l => l.name);
        const hasBrand = BRAND_LABELS.some(b => labelNames.includes(b));
        const hasType = this.getTypeFromLabels(labelNames) !== "Sin tipo";
        return !hasBrand || !hasType;
      })
      .map(i => {
        const labelNames = i.labels.nodes.map(l => l.name);
        const hasBrand = BRAND_LABELS.some(b => labelNames.includes(b));
        const hasType = this.getTypeFromLabels(labelNames) !== "Sin tipo";
        const missing: "brand" | "type" | "both" = !hasBrand && !hasType ? "both" : !hasBrand ? "brand" : "type";
        return {
          identifier: i.identifier,
          title: i.title,
          url: i.url,
          brand: BRAND_LABELS.find(b => labelNames.includes(b)) ?? "Sin marca",
          assignee: i.assignee?.name ?? null,
          state: i.state.name,
          missing,
        };
      })
      .sort((a, b) => a.brand.localeCompare(b.brand));

    const unclassified_projects: UnclassifiedProject[] = projects
      .filter(p => {
        const labelNames = p.labels.nodes.map(l => l.name);
        const hasBrand = BRAND_LABELS.some(b => labelNames.includes(b));
        const hasType = this.getTypeFromLabels(labelNames) !== "Sin tipo";
        return !hasBrand || !hasType;
      })
      .map(p => {
        const labelNames = p.labels.nodes.map(l => l.name);
        const hasBrand = BRAND_LABELS.some(b => labelNames.includes(b));
        const hasType = this.getTypeFromLabels(labelNames) !== "Sin tipo";
        const missing: "brand" | "type" | "both" = !hasBrand && !hasType ? "both" : !hasBrand ? "brand" : "type";
        return {
          name: p.name,
          url: p.url,
          brand: BRAND_LABELS.find(b => labelNames.includes(b)) ?? "Sin marca",
          lead: p.lead?.name ?? null,
          state: p.state,
          missing,
        };
      })
      .sort((a, b) => a.brand.localeCompare(b.brand));

    return {
      period_label: periodLabel,
      total,
      issues_total: issueTotal,
      projects_total: projectTotal,
      issues_count: validIssues.length,
      projects_count: projects.length,
      issues_timed_count: issueTotal.timed_count,
      projects_timed_count: projectTotal.timed_count,
      by_brand, by_type, by_brand_and_type, by_brand_and_type_issues, by_brand_and_type_projects,
      unclassified_issues,
      unclassified_projects,
    };
  }

  private calcPeriodMetrics(issues: LinearIssue[]): PeriodMetrics {
    const DEFAULT_HOURS = 4; // medio día laboral para issues cerrados sin startedAt
    const count = issues.length;

    const closed = issues.filter((i) => i.state.type === "completed" && i.completedAt);
    if (closed.length === 0) {
      return { count, avg_attention_hours: null, total_time_hours: null, timed_count: 0 };
    }

    const times = closed.map((i) => {
      if (i.startedAt) {
        const h = (new Date(i.completedAt!).getTime() - new Date(i.startedAt).getTime()) / (1000 * 60 * 60);
        return h > 0 ? h : DEFAULT_HOURS;
      }
      return DEFAULT_HOURS;
    });

    const total_time_hours = Math.round(times.reduce((a, b) => a + b, 0) * 10) / 10;
    const avg_attention_hours = Math.round((total_time_hours / times.length) * 10) / 10;

    return { count, avg_attention_hours, total_time_hours, timed_count: times.length };
  }
}
