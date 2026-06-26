import { LinearClient } from "../linear/client";
import { getIssuesQueryForDateRange } from "../linear/queries";
import type { LinearIssue, PeriodMetrics, CTOTicketMetrics } from "../types";

const BRAND_LABELS = [
  "Airalo", "B2B", "BackOffice", "Cuy", "Fimo",
  "Finanzas", "Guinea", "Habla+", "Legales", "PeruSim+",
  "SAC", "Tech", "Wings",
];

const TYPE_LABELS = ["Error", "Requerimiento", "Hallazgo"];

const EXCLUDED_STATES = ["Discarded", "Duplicate", "Cancelled"];

export class CTOMetricsService {
  constructor(private client: LinearClient) {}

  async getIssuesForDateRange(startDate: string, endDate: string): Promise<LinearIssue[]> {
    return this.client.queryAllIssues<LinearIssue>(
      (cursor) => getIssuesQueryForDateRange(startDate, endDate, cursor)
    );
  }

  calculateMetrics(issues: LinearIssue[], periodLabel: string): CTOTicketMetrics {
    const validIssues = issues.filter(
      (i) => !EXCLUDED_STATES.includes(i.state.name)
    );

    const total = this.calcPeriodMetrics(validIssues);

    const unbranded = validIssues.filter(
      (i) => !i.labels.nodes.some((l) => BRAND_LABELS.includes(l.name))
    );

    const by_brand: Record<string, PeriodMetrics> = {};
    for (const brand of BRAND_LABELS) {
      const brandIssues = validIssues.filter((i) =>
        i.labels.nodes.some((l) => l.name === brand)
      );
      by_brand[brand] = this.calcPeriodMetrics(brandIssues);
    }
    by_brand["Sin marca"] = this.calcPeriodMetrics(unbranded);

    const by_type: Record<string, PeriodMetrics> = {};
    for (const type of TYPE_LABELS) {
      const typeIssues = validIssues.filter((i) =>
        i.labels.nodes.some((l) => l.name === type)
      );
      by_type[type] = this.calcPeriodMetrics(typeIssues);
    }
    by_type["Sin tipo"] = this.calcPeriodMetrics(
      validIssues.filter(
        (i) => !i.labels.nodes.some((l) => TYPE_LABELS.includes(l.name))
      )
    );

    const by_brand_and_type: Record<string, Record<string, PeriodMetrics>> = {};
    const allBrands = [...BRAND_LABELS, "Sin marca"];
    for (const brand of allBrands) {
      const brandIssues = brand === "Sin marca"
        ? unbranded
        : validIssues.filter((i) => i.labels.nodes.some((l) => l.name === brand));
      by_brand_and_type[brand] = {};
      for (const type of TYPE_LABELS) {
        by_brand_and_type[brand][type] = this.calcPeriodMetrics(
          brandIssues.filter((i) => i.labels.nodes.some((l) => l.name === type))
        );
      }
      by_brand_and_type[brand]["Sin tipo"] = this.calcPeriodMetrics(
        brandIssues.filter(
          (i) => !i.labels.nodes.some((l) => TYPE_LABELS.includes(l.name))
        )
      );
    }

    return { period_label: periodLabel, total, by_brand, by_type, by_brand_and_type };
  }

  private calcPeriodMetrics(issues: LinearIssue[]): PeriodMetrics {
    const count = issues.length;

    const closedWithTime = issues.filter(
      (i) => i.state.name === "Closed" && i.startedAt && i.completedAt
    );

    if (closedWithTime.length === 0) {
      return { count, avg_attention_hours: null, total_time_hours: null, timed_count: 0 };
    }

    const times = closedWithTime
      .map((i) => {
        const started = new Date(i.startedAt!).getTime();
        const completed = new Date(i.completedAt!).getTime();
        return (completed - started) / (1000 * 60 * 60);
      })
      .filter((t) => t > 0);

    if (times.length === 0) {
      return { count, avg_attention_hours: null, total_time_hours: null, timed_count: 0 };
    }

    const total_time_hours = Math.round(times.reduce((a, b) => a + b, 0) * 10) / 10;
    const avg_attention_hours = Math.round((total_time_hours / times.length) * 10) / 10;

    return { count, avg_attention_hours, total_time_hours, timed_count: times.length };
  }
}
