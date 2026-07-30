export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  state: {
    name: string;
    type: string;
  };
  priority: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  assignee: {
    name: string;
  } | null;
  team: {
    key: string;
  };
  project: {
    id: string;
  } | null;
  url: string;
  labels: {
    nodes: Array<{
      name: string;
    }>;
  };
  history?: {
    nodes: Array<{
      fromState: { name: string; type: string } | null;
      toState: { name: string; type: string } | null;
      fromPriority: number | null;
      toPriority: number | null;
      createdAt: string;
    }>;
  };
}

export interface LinearProject {
  id: string;
  name: string;
  state: string;
  status: {
    name: string;
    type: string;
  };
  progress: number;
  lead: {
    name: string;
  } | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  labels: {
    nodes: Array<{
      name: string;
    }>;
  };
  teams: {
    nodes: Array<{
      key: string;
    }>;
  };
}

export interface IssueMetrics {
  month: string;
  total_issues: number;
  untracked_issues: number;
  pending_ce2: number;
  active_issues: number;
  backlog: number;
  blocked: number;
  closed: number;
  by_state: Record<string, number>;
  by_product: Record<string, number>;
  by_team: Record<string, number>;
  by_state_by_team: Record<string, number>;
  pending_by_product: Record<string, number>;
  pending_issues_list: Array<{
    id: string;
    title: string;
    state: string;
    team: string;
    products: string;
    assignee: string;
    url: string;
  }>;
  untracked_issues_list: Array<{
    id: string;
    title: string;
    state: string;
    team: string;
    assignee: string;
    url: string;
  }>;
}

export interface ProjectMetrics {
  total_projects: number;
  pending_ce2: number;
  in_progress: number;
  completed: number;
  blocked: number;
  by_state: Record<string, number>;
  by_lead: Record<string, number>;
  brands: Record<string, { total: number; pending: number; completed: number }>;
}

export interface PeriodMetrics {
  count: number;
  avg_attention_hours: number | null;
  total_time_hours: number | null;
  timed_count: number;
}

export interface UnclassifiedIssue {
  identifier: string;
  title: string;
  url: string;
  brand: string;
  assignee: string | null;
  state: string;
}

export interface CTOTicketMetrics {
  period_label: string;
  total: PeriodMetrics;
  issues_count: number;
  projects_count: number;
  issues_timed_count: number;
  projects_timed_count: number;
  by_brand: Record<string, PeriodMetrics>;
  by_type: Record<string, PeriodMetrics>;
  by_brand_and_type: Record<string, Record<string, PeriodMetrics>>;
  unclassified_issues: UnclassifiedIssue[];
}

export interface LinearResponse<T> {
  data?: T;
  errors?: Array<{
    message: string;
  }>;
}
