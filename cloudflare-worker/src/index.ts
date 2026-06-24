import { LinearClient } from "./linear/client";
import { IssuesService } from "./services/issues";
import { ProjectsService } from "./services/projects";
import { CE2MetricsService } from "./services/ce2-metrics";
import { CTOMetricsService } from "./services/cto-metrics";
import { StateHistoryService } from "./services/state-history";
import { LinearWebhookHandler } from "./linear/webhook-handler";
import {
  getMonthNumber, getMonthName, getCurrentYear,
  getWeekDateRange, getQuarterDateRange, getYearDateRange,
  jsonResponse, errorResponse,
} from "./utils";

interface Env {
  LINEAR_API_KEY: string;
  CACHE?: KVNamespace;
  CE2_HISTORY?: KVNamespace;
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

    if (pathname === "/test") {
      return jsonResponse({ message: "API is working" });
    }

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

    if (pathname === "/api/ce2/metrics/summary") {
      return handleCE2MetricsSummary(request, env, client);
    }

    if (pathname === "/api/cto/metrics") {
      return handleCTOMetrics(request, env, client);
    }

    if (pathname === "/api/debug/ce2-issues") {
      return handleDebugCE2Issues(request, env, client);
    }

    if (pathname === "/webhook/linear" && request.method === "POST") {
      return handleLinearWebhook(request, env);
    }

    if (pathname === "/api/debug/webhook") {
      return handleDebugWebhook(request, env);
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
    // Only count quarters that are fully completed (all months have passed)
    const today = new Date();
    const currentMonthForRacha = today.getMonth() + 1;
    const quarters = [
      { name: "Q1", months: [1, 2, 3] },
      { name: "Q2", months: [4, 5, 6] },
      { name: "Q3", months: [7, 8, 9] },
      { name: "Q4", months: [10, 11, 12] },
    ];

    const rachaCount: { [key: string]: number } = {};

    for (const quarter of quarters) {
      // Only count quarters where ALL months have passed
      const lastMonthInQuarter = Math.max(...quarter.months);
      if (currentMonthForRacha <= lastMonthInQuarter) {
        // This quarter hasn't finished yet, skip it
        continue;
      }

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

async function handleCE2MetricsSummary(
  request: Request,
  env: Env,
  client: LinearClient
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const monthParam = url.searchParams.get("month");
    const filterParam = url.searchParams.get("filter") as "with_project" | "without_project" | null;

    if (!monthParam) {
      return errorResponse("month parameter is required");
    }

    const monthNum = getMonthNumber(monthParam);
    const year = getCurrentYear();
    const filter = filterParam || "without_project";

    const historyService = new StateHistoryService(env.CE2_HISTORY!);
    const ce2Service = new CE2MetricsService(client, historyService);
    const metrics = await ce2Service.getMetricsForMonth(year, monthNum, filter);

    const summary = {
      period: metrics.vipResolutionRate.period,
      team: "CE2",
      summary: {
        vip_resolution_rate: {
          value: metrics.vipResolutionRate.value,
          unit: metrics.vipResolutionRate.unit,
          tooltip: metrics.vipResolutionRate.disclaimer.what_measures,
          audience: "Gerencia / Stakeholders",
        },
        fcrr: {
          value: metrics.fcrr.value,
          unit: metrics.fcrr.unit,
          tooltip: metrics.fcrr.disclaimer.what_measures,
          audience: "CTO / PM",
        },
        reopen_rate: {
          value: metrics.reopenRate.value,
          unit: metrics.reopenRate.unit,
          tooltip: metrics.reopenRate.disclaimer.what_measures,
          audience: "CTO / Tech Leads",
        },
        containment_rate: {
          value: metrics.containmentRate.value,
          unit: metrics.containmentRate.unit,
          tooltip: metrics.containmentRate.disclaimer.what_measures,
          audience: "PM / Back Office",
        },
        mttr_urgent_hours: {
          value: metrics.mttr.data.urgent.mttr_hours,
          unit: "hours",
          tooltip: `Tiempo promedio resolver P1 | Fórmula: ${metrics.mttr.disclaimer.how_calculated}`,
          audience: "CTO / PM",
        },
        mttr_high_hours: {
          value: metrics.mttr.data.high.mttr_hours,
          unit: "hours",
          tooltip: `Tiempo promedio resolver P2 | Fórmula: ${metrics.mttr.disclaimer.how_calculated}`,
          audience: "CTO / PM",
        },
        downtime_saved: {
          value: metrics.downtimeSaved.value,
          unit: metrics.downtimeSaved.unit,
          tooltip: metrics.downtimeSaved.disclaimer.what_measures,
          audience: "Gerencia / Stakeholders",
        },
        fire_prevention: {
          value: metrics.firePrevention.value,
          unit: metrics.firePrevention.unit,
          tooltip: metrics.firePrevention.disclaimer.what_measures,
          audience: "CTO / Gerencia",
        },
        noise_reduction: {
          value: metrics.noiseReduction.value,
          unit: metrics.noiseReduction.unit,
          tooltip: metrics.noiseReduction.disclaimer.what_measures,
          audience: "PM / Back Office",
        },
      },
      cached_at: new Date().toISOString(),
      _debug: {
        total_vip_issues: metrics.vipResolutionRate.total_vip_issues,
        completed_vip_issues: metrics.vipResolutionRate.completed_vip_issues,
        total_critical_issues: metrics.containmentRate.total_critical_issues,
        contained_issues: metrics.containmentRate.contained_issues,
      }
    };

    return jsonResponse(summary);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("CE2 Metrics Summary error:", errorMessage, error);
    return errorResponse(`Failed to calculate metrics summary: ${errorMessage}`, 500);
  }
}

async function handleCTOMetrics(
  request: Request,
  env: Env,
  client: LinearClient
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const period = url.searchParams.get("period") || "month";
    const year = parseInt(url.searchParams.get("year") || String(getCurrentYear()), 10);

    let startDate: string;
    let endDate: string;
    let periodLabel: string;

    if (period === "week") {
      const week = parseInt(url.searchParams.get("week") || "1", 10);
      const range = getWeekDateRange(week, year);
      startDate = range.start;
      endDate = range.end;
      periodLabel = `Semana ${week} · ${year}`;
    } else if (period === "quarter") {
      const quarter = parseInt(url.searchParams.get("quarter") || "1", 10);
      const range = getQuarterDateRange(quarter, year);
      startDate = range.start;
      endDate = range.end;
      periodLabel = `Q${quarter} · ${year}`;
    } else if (period === "year") {
      const range = getYearDateRange(year);
      startDate = range.start;
      endDate = range.end;
      periodLabel = `${year}`;
    } else {
      const monthParam = url.searchParams.get("month") || "Enero";
      const monthNum = getMonthNumber(monthParam);
      const startD = new Date(year, monthNum - 1, 1);
      const endD = new Date(monthNum === 12 ? year + 1 : year, monthNum === 12 ? 0 : monthNum, 1);
      startDate = startD.toISOString().split("T")[0];
      endDate = endD.toISOString().split("T")[0];
      periodLabel = `${getMonthName(monthNum)} · ${year}`;
    }

    const ctoService = new CTOMetricsService(client);
    const issues = await ctoService.getIssuesForDateRange(startDate, endDate);
    const metrics = ctoService.calculateMetrics(issues, periodLabel);

    return jsonResponse({ ...metrics, cached_at: new Date().toISOString() });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("CTO Metrics error:", msg);
    return errorResponse(`Failed to calculate CTO metrics: ${msg}`, 500);
  }
}

async function handleDebugCE2Issues(
  request: Request,
  env: Env,
  client: LinearClient
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const monthParam = url.searchParams.get("month") || "Mayo";
    const monthNum = getMonthNumber(monthParam);
    const year = getCurrentYear();

    const { getCE2MetricsQueryForMonth } = await import("./linear/queries");
    const query = getCE2MetricsQueryForMonth(year, monthNum);

    const result = await client.query<{ issues: { nodes: any[] } }>(query);

    if (!result?.issues?.nodes) {
      return jsonResponse({ error: "No issues found" });
    }

    const issues = result.issues.nodes;
    const stateNames = new Set(issues.map((i: any) => i.state?.name));
    const p1p2 = issues.filter((i: any) => i.priority === 1 || i.priority === 2);
    const closedCount = issues.filter((i: any) => i.state?.name === "Closed").length;

    return jsonResponse({
      total_issues: issues.length,
      p1p2_issues: p1p2.length,
      state_names: Array.from(stateNames),
      closed_issues_count: closedCount,
      sample_issues: issues.slice(0, 3).map((i: any) => ({
        id: i.identifier,
        state: i.state?.name,
        priority: i.priority,
        completedAt: i.completedAt || "null",
      })),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Debug error:", errorMessage);
    return errorResponse(errorMessage, 500);
  }
}

async function handleLinearWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    // Validar que KV está disponible
    if (!env.CE2_HISTORY) {
      console.error("[Webhook] CE2_HISTORY KV namespace not available");
      return errorResponse("KV namespace not configured", 500);
    }

    // Parsear el payload
    const payload = await request.json() as any;

    // Crear servicio de historial y manejador
    const historyService = new StateHistoryService(env.CE2_HISTORY);
    const webhookHandler = new LinearWebhookHandler(historyService);

    // Procesar el webhook
    const result = await webhookHandler.handleWebhook(payload);

    if (!result.success) {
      console.warn(`[Webhook] Processing failed: ${result.error}`);
      return jsonResponse({ success: false, error: result.error }, 400);
    }

    console.log(`[Webhook] Successfully processed: ${result.recorded}`);
    return jsonResponse({
      success: true,
      recorded: result.recorded,
      message: "Webhook processed successfully",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Webhook] Error: ${errorMessage}`);
    return errorResponse(`Webhook processing failed: ${errorMessage}`, 500);
  }
}

async function handleDebugWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    if (!env.CE2_HISTORY) {
      return jsonResponse({
        error: "CE2_HISTORY KV namespace not available",
        configuration: "missing",
      });
    }

    const historyService = new StateHistoryService(env.CE2_HISTORY);

    // Obtener estadísticas del almacenamiento
    const allKeys = await env.CE2_HISTORY.list({ prefix: "transition:" });

    return jsonResponse({
      status: "webhook system operational",
      kv_configured: true,
      stored_transitions: allKeys.keys.length,
      namespace_binding: "CE2_HISTORY",
      webhook_endpoint: "/webhook/linear",
      setup_instructions: {
        linear_webhook_url: `${request.url.split("/api/debug")[0]}/webhook/linear`,
        method: "POST",
        expected_content_type: "application/json",
      },
      sample_transitions: allKeys.keys.slice(0, 5).map((k) => k.name),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[Debug Webhook] Error:", errorMessage);
    return errorResponse(`Debug failed: ${errorMessage}`, 500);
  }
}
