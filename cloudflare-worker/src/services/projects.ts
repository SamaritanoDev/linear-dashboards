import { LinearClient } from "../linear/client";
import { PROJECTS_QUERY } from "../linear/queries";
import type { LinearProject, ProjectMetrics } from "../types";

export class ProjectsService {
  private client: LinearClient;

  constructor(client: LinearClient) {
    this.client = client;
  }

  async getAllProjects(): Promise<LinearProject[]> {
    const result = await this.client.query<{
      projects: { nodes: LinearProject[] };
    }>(PROJECTS_QUERY);

    if (!result) return [];

    const allProjects = result.projects.nodes;

    return allProjects.filter((p) => {
      const teams = p.teams.nodes;
      return teams.some((t) => t.key === "CE2");
    });
  }

  async getProjectsForMonth(
    year: number,
    month: number,
    allProjects: LinearProject[]
  ): Promise<LinearProject[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(
      month === 12 ? year + 1 : year,
      month === 12 ? 0 : month,
      1
    );

    return allProjects.filter((p) => {
      try {
        const createdAt = new Date(p.createdAt);
        return createdAt >= startDate && createdAt < endDate;
      } catch {
        return false;
      }
    });
  }

  async calculateMetrics(projects: LinearProject[]): Promise<ProjectMetrics> {
    const isValidProject = (p: LinearProject) => {
      const state = (p.status?.name || "").toLowerCase();
      return !["canceled", "discarded"].includes(state);
    };

    const validProjects = projects.filter(isValidProject);

    const BRAND_LABELS = [
      "Cuy", "Guinea", "Habla+", "Wings", "PeruSim+", "Fimo", "Airalo",
      "B2B", "Finanzas", "Legales", "Partner"
    ];

    // States that count as "pending" - must match frontend definition
    const PENDING_STATES = ["backlog", "planned", "in progress", "blocked", "in review"];

    let completedCount = 0;
    let pendingCount = 0;

    const metrics: ProjectMetrics = {
      total_projects: validProjects.length,
      pending_ce2: 0,
      in_progress: 0,
      completed: 0,
      blocked: 0,
      by_state: {},
      by_lead: {},
      brands: {},
    };

    // Inicializar brands con 0
    for (const brand of BRAND_LABELS) {
      metrics.brands[brand] = { total: 0, pending: 0, completed: 0 };
    }
    metrics.brands["Sin clasificar"] = { total: 0, pending: 0, completed: 0 };

    for (const project of validProjects) {
      const state = (project.status?.name || "Unknown").toLowerCase();
      const leadName = project.lead?.name || "Sin asignar";
      const labels = project.labels.nodes.map((l) => l.name);

      metrics.by_state[state] = (metrics.by_state[state] || 0) + 1;
      metrics.by_lead[leadName] = (metrics.by_lead[leadName] || 0) + 1;

      const isCompleted = state === "completed";
      const isPending = PENDING_STATES.includes(state);

      if (isCompleted) {
        completedCount++;
        metrics.completed++;
      }
      if (isPending) {
        pendingCount++;
      }
      if (state === "in progress") metrics.in_progress++;
      if (state === "blocked") metrics.blocked++;

      // Calcular brands
      let foundBrand = false;
      for (const label of labels) {
        if (BRAND_LABELS.includes(label)) {
          metrics.brands[label].total++;
          if (isPending) metrics.brands[label].pending++;
          if (isCompleted) metrics.brands[label].completed++;
          foundBrand = true;
        }
      }

      // Si no tiene brand, contar como Sin clasificar
      if (!foundBrand) {
        metrics.brands["Sin clasificar"].total++;
        if (isPending) metrics.brands["Sin clasificar"].pending++;
        if (isCompleted) metrics.brands["Sin clasificar"].completed++;
      }
    }

    // Use whitelist-based calculation for pending: only states that explicitly count as pending
    metrics.pending_ce2 = pendingCount;

    return metrics;
  }
}
