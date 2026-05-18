import { LinearClient } from "../linear/client";
import { getIssuesQueryForMonth } from "../linear/queries";
import type { LinearIssue, IssueMetrics } from "../types";

const CUSTOMER_LABELS = [
  "Cuy",
  "Guinea",
  "Habla+",
  "Wings",
  "PeruSim+",
  "Fimo",
  "Airalo",
  "B2B",
  "Finanzas",
  "Legales",
  "Partner",
];

const PENDING_STATES = [
  "Triage",
  "Planning",
  "Backlog",
  "In Progress",
  "In Review",
  "Blocked",
];

export class IssuesService {
  private client: LinearClient;

  constructor(client: LinearClient) {
    this.client = client;
  }

  async getIssuesForMonth(
    year: number,
    month: number,
    filter: "with_project" | "without_project" = "without_project"
  ): Promise<LinearIssue[]> {
    const query = getIssuesQueryForMonth(year, month);
    const result = await this.client.query<{ issues: { nodes: LinearIssue[] } }>(
      query
    );

    if (!result) return [];

    const issues = result.issues.nodes;

    if (filter === "with_project") {
      return issues.filter((i) => i.project && i.state.name !== "Discarded");
    }

    return issues.filter((i) => !i.project && i.state.name !== "Discarded");
  }

  async calculateMetrics(
    issues: LinearIssue[],
    monthName: string
  ): Promise<IssueMetrics> {
    const metrics: IssueMetrics = {
      month: monthName,
      total_issues: 0,
      untracked_issues: 0,
      pending_ce2: 0,
      active_issues: 0,
      backlog: 0,
      blocked: 0,
      closed: 0,
      by_state: {},
      by_product: {},
      by_team: { CE1: 0, CE2: 0 },
      by_state_by_team: {},
      pending_by_product: {},
      pending_issues_list: [],
      untracked_issues_list: [],
    };

    for (const issue of issues) {
      const state = issue.state.name;
      const team = issue.team.key || "Unknown";
      const labels = issue.labels.nodes.map((l) => l.name);
      const productLabels = labels.filter((l) => CUSTOMER_LABELS.includes(l));
      const isPending = PENDING_STATES.includes(state);
      const hasProductLabel = productLabels.length > 0;

      // Contar TODAS las issues
      metrics.total_issues += 1;

      // Contar issues en estados pendientes
      if (isPending) {
        metrics.pending_ce2 += 1;
      }

      // Contar issues sin etiqueta de producto
      if (!hasProductLabel) {
        metrics.untracked_issues += 1;
        // Agregar a lista solo si está en estado pendiente
        if (isPending) {
          metrics.untracked_issues_list.push({
            id: issue.identifier,
            title: issue.title,
            state,
            team,
            assignee: issue.assignee?.name || "Sin asignar",
            url: `https://linear.app/guinea/issue/${issue.identifier}`,
          });
        }
      }

      metrics.by_state[state] = (metrics.by_state[state] || 0) + 1;

      // Agregar estado por team (formato: "CE2_Backlog", "CE1_In Progress", etc.)
      const stateByTeamKey = `${team}_${state}`;
      if (!metrics.by_state_by_team) metrics.by_state_by_team = {};
      metrics.by_state_by_team[stateByTeamKey] = (metrics.by_state_by_team[stateByTeamKey] || 0) + 1;

      if (team in metrics.by_team) {
        metrics.by_team[team]++;
      }

      if (state === "In Progress") metrics.active_issues++;
      if (["Backlog", "Planning"].includes(state)) metrics.backlog++;
      if (state === "Blocked") metrics.blocked++;
      if (state === "Closed") metrics.closed++;

      if (hasProductLabel) {
        for (const product of productLabels) {
          metrics.by_product[product] = (metrics.by_product[product] || 0) + 1;
          if (isPending) {
            metrics.pending_by_product[product] =
              (metrics.pending_by_product[product] || 0) + 1;
          }
        }

        if (isPending) {
          metrics.pending_issues_list.push({
            id: issue.identifier,
            title: issue.title,
            state,
            team,
            products: productLabels.join(", "),
            assignee: issue.assignee?.name || "Sin asignar",
            url: `https://linear.app/guinea/issue/${issue.identifier}`,
          });
        }
      }
    }

    return metrics;
  }
}
