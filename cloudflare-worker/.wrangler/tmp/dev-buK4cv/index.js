var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-grjGvg/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// .wrangler/tmp/bundle-grjGvg/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// src/linear/client.ts
var LINEAR_API = "https://api.linear.app/graphql";
var LinearClient = class {
  apiKey;
  constructor(options) {
    this.apiKey = options.apiKey;
  }
  async query(query) {
    try {
      const response = await fetch(LINEAR_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.apiKey
        },
        body: JSON.stringify({ query })
      });
      const result = await response.json();
      if (result.errors) {
        console.error("Linear API error:", result.errors);
        return null;
      }
      return result.data;
    } catch (error) {
      console.error("Linear query failed:", error);
      return null;
    }
  }
};
__name(LinearClient, "LinearClient");

// src/linear/queries.ts
var PROJECTS_QUERY = `
{
  projects(
    first: 150
  ) {
    nodes {
      id
      name
      state
      status {
        name
        type
      }
      progress
      lead {name}
      createdAt
      labels(first: 10) {
        nodes {
          name
        }
      }
      teams(first: 5) {
        nodes {
          key
        }
      }
    }
  }
}
`;
function getIssuesQueryForMonth(year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(
    month === 12 ? year + 1 : year,
    month === 12 ? 0 : month,
    1
  );
  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];
  return `
{
  issues(
    first: 250
    filter: {
      team: {key: {in: ["CE1", "CE2"]}}
      createdAt: {gte: "${startStr}T00:00:00Z", lt: "${endStr}T00:00:00Z"}
      project: {null: true}
    }
  ) {
    nodes {
      id
      identifier
      title
      state {name}
      priority
      createdAt
      startedAt
      completedAt
      assignee {name}
      team {key}
      project {id}
      labels(first: 10) {
        nodes {name}
      }
    }
  }
}
`;
}
__name(getIssuesQueryForMonth, "getIssuesQueryForMonth");

// src/services/issues.ts
var CUSTOMER_LABELS = [
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
  "Partner"
];
var PENDING_STATES = [
  "Triage",
  "Planning",
  "Backlog",
  "In Progress",
  "In Review",
  "Blocked"
];
var IssuesService = class {
  client;
  constructor(client) {
    this.client = client;
  }
  async getIssuesForMonth(year, month, filter = "without_project") {
    const query = getIssuesQueryForMonth(year, month);
    const result = await this.client.query(
      query
    );
    if (!result)
      return [];
    const issues = result.issues.nodes;
    if (filter === "with_project") {
      return issues.filter((i) => i.project && i.state.name !== "Discarded");
    }
    return issues.filter((i) => !i.project && i.state.name !== "Discarded");
  }
  async calculateMetrics(issues, monthName) {
    const metrics = {
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
      untracked_issues_list: []
    };
    for (const issue of issues) {
      const state = issue.state.name;
      const team = issue.team.key || "Unknown";
      const labels = issue.labels.nodes.map((l) => l.name);
      const productLabels = labels.filter((l) => CUSTOMER_LABELS.includes(l));
      const isPending = PENDING_STATES.includes(state);
      const hasProductLabel = productLabels.length > 0;
      metrics.total_issues += 1;
      if (isPending) {
        metrics.pending_ce2 += 1;
      }
      if (!hasProductLabel) {
        metrics.untracked_issues += 1;
        if (isPending) {
          metrics.untracked_issues_list.push({
            id: issue.identifier,
            title: issue.title,
            state,
            team,
            assignee: issue.assignee?.name || "Sin asignar",
            url: `https://linear.app/guinea/issue/${issue.identifier}`
          });
        }
      }
      metrics.by_state[state] = (metrics.by_state[state] || 0) + 1;
      const stateByTeamKey = `${team}_${state}`;
      if (!metrics.by_state_by_team)
        metrics.by_state_by_team = {};
      metrics.by_state_by_team[stateByTeamKey] = (metrics.by_state_by_team[stateByTeamKey] || 0) + 1;
      if (team in metrics.by_team) {
        metrics.by_team[team]++;
      }
      if (state === "In Progress")
        metrics.active_issues++;
      if (["Backlog", "Planning"].includes(state))
        metrics.backlog++;
      if (state === "Blocked")
        metrics.blocked++;
      if (state === "Closed")
        metrics.closed++;
      if (hasProductLabel) {
        for (const product of productLabels) {
          metrics.by_product[product] = (metrics.by_product[product] || 0) + 1;
          if (isPending) {
            metrics.pending_by_product[product] = (metrics.pending_by_product[product] || 0) + 1;
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
            url: `https://linear.app/guinea/issue/${issue.identifier}`
          });
        }
      }
    }
    return metrics;
  }
};
__name(IssuesService, "IssuesService");

// src/services/projects.ts
var ProjectsService = class {
  client;
  constructor(client) {
    this.client = client;
  }
  async getAllProjects() {
    const result = await this.client.query(PROJECTS_QUERY);
    if (!result)
      return [];
    const allProjects = result.projects.nodes;
    return allProjects.filter((p) => {
      const teams = p.teams.nodes;
      return teams.some((t) => t.key === "CE2");
    });
  }
  async getProjectsForMonth(year, month, allProjects) {
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
  async calculateMetrics(projects) {
    const isValidProject = /* @__PURE__ */ __name((p) => {
      const state = (p.status?.name || "").toLowerCase();
      return !["canceled", "discarded"].includes(state);
    }, "isValidProject");
    const validProjects = projects.filter(isValidProject);
    const BRAND_LABELS = [
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
      "Partner"
    ];
    let completedCount = 0;
    const metrics = {
      total_projects: validProjects.length,
      pending_ce2: 0,
      in_progress: 0,
      completed: 0,
      blocked: 0,
      by_state: {},
      by_lead: {},
      brands: {}
    };
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
      const isPending = !isCompleted;
      if (isCompleted) {
        completedCount++;
        metrics.completed++;
      }
      if (state === "in progress")
        metrics.in_progress++;
      if (state === "blocked")
        metrics.blocked++;
      let foundBrand = false;
      for (const label of labels) {
        if (BRAND_LABELS.includes(label)) {
          metrics.brands[label].total++;
          if (isPending)
            metrics.brands[label].pending++;
          if (isCompleted)
            metrics.brands[label].completed++;
          foundBrand = true;
        }
      }
      if (!foundBrand) {
        metrics.brands["Sin clasificar"].total++;
        if (isPending)
          metrics.brands["Sin clasificar"].pending++;
        if (isCompleted)
          metrics.brands["Sin clasificar"].completed++;
      }
    }
    metrics.pending_ce2 = validProjects.length - completedCount;
    return metrics;
  }
};
__name(ProjectsService, "ProjectsService");

// src/utils.ts
function getMonthNumber(monthName) {
  const months = {
    enero: 1,
    febrero: 2,
    marzo: 3,
    abril: 4,
    mayo: 5,
    junio: 6,
    julio: 7,
    agosto: 8,
    septiembre: 9,
    octubre: 10,
    noviembre: 11,
    diciembre: 12
  };
  return months[monthName.toLowerCase()] || (/* @__PURE__ */ new Date()).getMonth() + 1;
}
__name(getMonthNumber, "getMonthNumber");
function getMonthName(month) {
  const months = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre"
  ];
  return months[month - 1] || "Unknown";
}
__name(getMonthName, "getMonthName");
function getCurrentYear() {
  return (/* @__PURE__ */ new Date()).getFullYear();
}
__name(getCurrentYear, "getCurrentYear");
function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      ...headers
    }
  });
}
__name(jsonResponse, "jsonResponse");
function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}
__name(errorResponse, "errorResponse");

// src/index.ts
var src_default = {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
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
  }
};
async function handleIssuesCE(request, env, client) {
  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month");
  const filterParam = url.searchParams.get("filter");
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
__name(handleIssuesCE, "handleIssuesCE");
async function handleProjectsCE(request, env, client) {
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
__name(handleProjectsCE, "handleProjectsCE");
async function handleMetrics(request, env, client) {
  const url = new URL(request.url);
  const monthParam = url.searchParams.get("month");
  const filterParam = url.searchParams.get("filter");
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
      filter
    },
    projects: projectMetrics
  };
  return jsonResponse(response);
}
__name(handleMetrics, "handleMetrics");
async function handleRegenerate(request, env, client) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return errorResponse("Unauthorized", 401);
  }
  try {
    return jsonResponse({
      success: true,
      message: "Regeneration request received. Data will be fetched on next API call."
    });
  } catch (error) {
    console.error("Regenerate error:", error);
    return errorResponse("Failed to process regeneration request", 500);
  }
}
__name(handleRegenerate, "handleRegenerate");

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-grjGvg/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-grjGvg/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
