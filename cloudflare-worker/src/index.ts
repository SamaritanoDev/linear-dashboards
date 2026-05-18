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
