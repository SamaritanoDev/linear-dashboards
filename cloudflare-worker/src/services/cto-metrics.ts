import { LinearClient } from "../linear/client";
import { getIssuesQueryForDateRange } from "../linear/queries";
import type { LinearIssue, PeriodMetrics, CTOTicketMetrics } from "../types";

const BRAND_LABELS = [
  "Cuy", "Guinea", "Habla+", "Wings", "PeruSim+",
  "Fimo", "Airalo", "B2B", "Finanzas", "Legales", "Partner", "Tech",
];

const TYPE_LABELS = ["Error", "Requerimiento", "Hallazgo"];

const EXCLUDED_STATES = ["Discarded", "Duplicate", "Cancelled"];

export class CTOMetricsService {
  constructor(private client: LinearClient) {}

  async getIssuesForDateRange(startDate: string, endDate: string): Promise<LinearIssue[]> {
    const query = getIssuesQueryForDateRange(startDate, endDate);
    const result = await this.client.query<{ issues: { nodes: LinearIssue[] } }>(query);
    return result?.issues?.nodes ?? [];
  }

  calculateMetrics(issues: LinearIssue[], periodLabel: string): CTOTicketMetrics {
    const validIssues = issues.filter(
      (i) => !EXCLUDED_STATES.includes(i.state.name)
    );

    const total = this.calcPeriodMetrics(validIssues);

    const by_brand: Record<string, PeriodMetrics> = {};
    for (const brand of BRAND_LABELS) {
      const brandIssues = validIssues.filter((i) =>
        i.labels.nodes.some((l) => l.name === brand)
      );
      by_brand[brand] = this.calcPeriodMetrics(brandIssues);
    }

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
    for (const brand of BRAND_LABELS) {
      const brandIssues = validIssues.filter((i) =>
        i.labels.nodes.some((l) => l.name === brand)
      );
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
