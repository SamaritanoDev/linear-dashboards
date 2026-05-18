import { LinearClient } from "./linear/client";
import { IssuesService } from "./services/issues";
import { ProjectsService } from "./services/projects";
import { getMonthNumber, getMonthName, getCurrentYear, jsonResponse, errorResponse } from "./utils";

interface Env {
  LINEAR_API_KEY: string;
  CACHE?: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    const client = new LinearClient({ apiKey: env.LINEAR_API_KEY });

    if (pathname === "/api/issues-ce") {
      return handleIssuesCE(request, env, client);
    }

    if (pathname === "/api/projects-ce") {
      return handleProjectsCE(request, env, client);
    }

    if (pathname === "/api/metrics") {
      return handleMetrics(request, env, client);
    }

    if (pathname === "/api/regenerate" && request.method === "POST") {
      return handleRegenerate(request, env, client);
    }

    if (pathname === "/api/team-workload") {
      return handleTeamWorkload(request, env, client);
    }

    if (pathname === "/api/recognitions") {
      return handleRecognitions(request, env, client);
    }

    return errorResponse("Not found", 404);
  },
};

async function handleIssuesCE(
  request: Request,
  env: Env,
  client: LinearClient
): Promise<Response> {
  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month");
  const filterParam = url.searchParams.get("filter") as "with_project" | "without_project" | null;

  if (!monthParam) {
    return errorResponse("month parameter is required");
  }

  const monthNum = getMonthNumber(monthParam);
  const year = getCurrentYear();
  const filter = filterParam || "without_project";

  const issuesService = new IssuesService(client);
  const issues = await issuesService.getIssuesForMonth(year, monthNum, filter);

  return jsonResponse(issues);
}

async function handleProjectsCE(
  request: Request,
  env: Env,
  client: LinearClient
): Promise<Response> {
  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month");

  if (!monthParam) {
    return errorResponse("month parameter is required");
  }

  const monthNum = getMonthNumber(monthParam);
  const year = getCurrentYear();

  const projectsService = new ProjectsService(client);
  const allProjects = await projectsService.getAllProjects();
  const projectsForMonth = await projectsService.getProjectsForMonth(
    year,
    monthNum,
    allProjects
  );

  return jsonResponse(projectsForMonth);
}

async function handleMetrics(
  request: Request,
  env: Env,
  client: LinearClient
): Promise<Response> {
  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month");
  const filterParam = url.searchParams.get("filter") as "with_project" | "without_project" | null;

  if (!monthParam) {
    return errorResponse("month parameter is required");
  }

  const monthNum = getMonthNumber(monthParam);
  const monthName = getMonthName(monthNum);
  const year = getCurrentYear();
  const filter = filterParam || "without_project";

  const issuesService = new IssuesService(client);
  const issues = await issuesService.getIssuesForMonth(year, monthNum, filter);
  const metrics = await issuesService.calculateMetrics(issues, monthName);

  const projectsService = new ProjectsService(client);
  const allProjects = await projectsService.getAllProjects();
  const projectsForMonth = await projectsService.getProjectsForMonth(
    year,
    monthNum,
    allProjects
  );
  const projectMetrics = await projectsService.calculateMetrics(projectsForMonth);

  const response = {
    issues: {
      ...metrics,
      filter: filter,
    },
    projects: projectMetrics,
  };

  return jsonResponse(response);
}

async function handleRegenerate(
  request: Request,
  env: Env,
  client: LinearClient
): Promise<Response> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    return jsonResponse({
      success: true,
      message: "Regeneration request received. Data will be fetched on next API call.",
    });
  } catch (error) {
    console.error("Regenerate error:", error);
    return errorResponse("Failed to process regeneration request", 500);
  }
}

async function handleTeamWorkload(
  request: Request,
  env: Env,
  client: LinearClient
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const filterParam = url.searchParams.get("filter") as "with_project" | "without_project" | "all" | null;
    const filter = filterParam || "all";

    const year = getCurrentYear();

    if (filter === "with_project") {
      // Proyectos pendientes acumulados
      const projectsService = new ProjectsService(client);
      const allProjects = await projectsService.getAllProjects();
      const PENDING_STATES = ["backlog", "planned", "in progress", "blocked", "in review"];

      const allPendingProjects: Array<{ lead: string; [key: string]: any }> = [];

      allProjects.forEach((project) => {
        const state = (project.status?.name || "").toLowerCase();
        if (PENDING_STATES.includes(state)) {
          const leadName = project.lead?.name || "Sin asignar";
          allPendingProjects.push({ ...project, lead: leadName } as any);
        }
      });

      const workloadByLead: {
        [key: string]: { count: number; percent: number };
      } = {};

      allPendingProjects.forEach((project) => {
        const lead = project.lead;
        if (!workloadByLead[lead]) {
          workloadByLead[lead] = { count: 0, percent: 0 };
        }
        workloadByLead[lead].count++;
      });

      const total = allPendingProjects.length;
      Object.values(workloadByLead).forEach((data) => {
        data.percent = total > 0 ? Math.round((data.count / total) * 100) : 0;
      });

      return jsonResponse({
        total_issues: total,
        by_assignee: workloadByLead,
        filter: filter,
        cached_at: new Date().toISOString(),
      });
    }

    // Para "all": obtener proyectos + issues
    // Para "without_project": obtener solo issues
    const workloadByPerson: {
      [key: string]: { count: number; percent: number };
    } = {};

    if (filter === "all") {
      // Agregar proyectos pendientes
      const projectsService = new ProjectsService(client);
      const allProjects = await projectsService.getAllProjects();
      const PENDING_STATES = ["backlog", "planned", "in progress", "blocked", "in review"];

      allProjects.forEach((project) => {
        const state = (project.status?.name || "").toLowerCase();
        if (PENDING_STATES.includes(state)) {
          const leadName = project.lead?.name || "Sin asignar";
          if (!workloadByPerson[leadName]) {
            workloadByPerson[leadName] = { count: 0, percent: 0 };
          }
          workloadByPerson[leadName].count++;
        }
      });
    }

    // Agregar issues (sin proyecto o ambos)
    const issuesService = new IssuesService(client);
    const allPendingIssues: Array<{ assignee?: string; [key: string]: any }> = [];

    for (let month = 1; month <= 12; month++) {
      if (filter === "all") {
        const issuesWithout = await issuesService.getIssuesForMonth(year, month, "without_project");
        const metricsWithout = await issuesService.calculateMetrics(issuesWithout, getMonthName(month));
        if (metricsWithout.pending_issues_list && metricsWithout.pending_issues_list.length > 0) {
          allPendingIssues.push(...metricsWithout.pending_issues_list);
        }

        const issuesWith = await issuesService.getIssuesForMonth(year, month, "with_project");
        const metricsWith = await issuesService.calculateMetrics(issuesWith, getMonthName(month));
        if (metricsWith.pending_issues_list && metricsWith.pending_issues_list.length > 0) {
          allPendingIssues.push(...metricsWith.pending_issues_list);
        }
      } else {
        const issues = await issuesService.getIssuesForMonth(year, month, filter);
        const metrics = await issuesService.calculateMetrics(issues, getMonthName(month));

        if (metrics.pending_issues_list && metrics.pending_issues_list.length > 0) {
          allPendingIssues.push(...metrics.pending_issues_list);
        }
      }
    }

    allPendingIssues.forEach((issue) => {
      const assignee = issue.assignee || "Sin asignar";
      if (!workloadByPerson[assignee]) {
        workloadByPerson[assignee] = { count: 0, percent: 0 };
      }
      workloadByPerson[assignee].count++;
    });

    const total = Object.values(workloadByPerson).reduce((sum, data) => sum + data.count, 0);
    Object.values(workloadByPerson).forEach((data) => {
      data.percent = total > 0 ? Math.round((data.count / total) * 100) : 0;
    });

    return jsonResponse({
      total_issues: total,
      by_assignee: workloadByPerson,
      filter: filter,
      cached_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Team workload error:", error);
    return errorResponse("Failed to calculate team workload", 500);
  }
}

async function handleRecognitions(
  request: Request,
  env: Env,
  client: LinearClient
): Promise<Response> {
  try {
    const year = getCurrentYear();
    const currentMonth = new Date().getMonth() + 1;
    const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;

    const issuesService = new IssuesService(client);

    // Get all unique assignees from the year
    const allAssignees = new Set<string>();
    for (let month = 1; month <= 12; month++) {
      const metrics = await issuesService.calculateMetrics(
        await issuesService.getIssuesForMonth(year, month, "without_project"),
        getMonthName(month)
      );
      if (metrics.pending_issues_list) {
        metrics.pending_issues_list.forEach((issue) => {
          if (issue.assignee && issue.assignee !== "Sin asignar") {
            allAssignees.add(issue.assignee);
          }
        });
      }
    }

    // Get "Mes Limpio" - assignees with 0 pending issues in previous month
    const prevMetrics = await issuesService.calculateMetrics(
      await issuesService.getIssuesForMonth(year, previousMonth, "without_project"),
      getMonthName(previousMonth)
    );

    const assigneesWithIssues = new Set<string>();
    if (prevMetrics.pending_issues_list) {
      prevMetrics.pending_issues_list.forEach((issue) => {
        if (issue.assignee) {
          assigneesWithIssues.add(issue.assignee);
        }
      });
    }

    const mesLimpioAssignees = Array.from(allAssignees).filter(
      (assignee) => !assigneesWithIssues.has(assignee)
    );

    // Get "Racha Perfecta" - count how many quarters each assignee completed without issues
    const quarters = [
      { name: "Q1", months: [1, 2, 3] },
      { name: "Q2", months: [4, 5, 6] },
      { name: "Q3", months: [7, 8, 9] },
      { name: "Q4", months: [10, 11, 12] },
    ];

    const rachaCount: { [key: string]: number } = {};

    for (const quarter of quarters) {
      const quarterAssignees = new Set<string>();
      for (const month of quarter.months) {
        const metrics = await issuesService.calculateMetrics(
          await issuesService.getIssuesForMonth(year, month, "without_project"),
          getMonthName(month)
        );
        if (metrics.pending_issues_list) {
          metrics.pending_issues_list.forEach((issue) => {
            if (issue.assignee && issue.assignee !== "Sin asignar") {
              quarterAssignees.add(issue.assignee);
            }
          });
        }
      }

      // Count assignees with 0 issues in this quarter
      Array.from(allAssignees).forEach((assignee) => {
        if (!quarterAssignees.has(assignee)) {
          rachaCount[assignee] = (rachaCount[assignee] || 0) + 1;
        }
      });
    }

    // Sort by count descending
    const rachaPerfect = Object.entries(rachaCount)
      .filter(([_, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .reduce(
        (acc, [name, count]) => {
          acc[name] = count;
          return acc;
        },
        {} as { [key: string]: number }
      );

    return jsonResponse({
      mes_limpio: {
        month: getMonthName(previousMonth),
        assignees: mesLimpioAssignees,
      },
      racha_perfecta: rachaPerfect,
      cached_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Recognitions error:", error);
    return errorResponse("Failed to calculate recognitions", 500);
  }
}
