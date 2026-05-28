export const PROJECTS_QUERY = `
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

export function getIssuesQueryForMonth(
  year: number,
  month: number,
  includeWithProject: boolean = false
): string {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(
    month === 12 ? year + 1 : year,
    month === 12 ? 0 : month,
    1
  );

  const startStr = startDate.toISOString().split("T")[0];
  const endStr = endDate.toISOString().split("T")[0];

  // Build filter object based on includeWithProject flag
  let filterStr = `
      team: {key: {in: ["CE1", "CE2"]}}
      createdAt: {gte: "${startStr}T00:00:00Z", lt: "${endStr}T00:00:00Z"}`;

  if (!includeWithProject) {
    filterStr += `
      project: {null: true}`;
  }

  return `
{
  issues(
    first: 250
    filter: {${filterStr}
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

export function getCE2MetricsQueryForMonth(
  year: number,
  month: number
): string {
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
    first: 500
    filter: {
      team: {key: "CE2"}
      project: {null: true}
      createdAt: {gte: "${startStr}T00:00:00Z", lt: "${endStr}T00:00:00Z"}
    }
  ) {
    nodes {
      id
      identifier
      title
      state {name}
      priority
      createdAt
      completedAt
      assignee {name}
      team {key}
      historyEntries(first: 100) {
        nodes {
          id
          type
          fromState {name}
          toState {name}
          fromPriority
          toPriority
          updatedAt
          actor {name}
        }
      }
    }
  }
}
`;
}
