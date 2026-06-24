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
      team: {id: {in: ["5feed208-25ac-4eb5-a2e6-e5f60f957b00", "c79c921c-5ef9-4539-bf19-5d8161cfe6ee"]}}
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

export function getIssuesQueryForDateRange(startDate: string, endDate: string): string {
  return `
{
  issues(
    first: 250
    filter: {
      team: {id: {in: ["5feed208-25ac-4eb5-a2e6-e5f60f957b00", "c79c921c-5ef9-4539-bf19-5d8161cfe6ee"]}}
      createdAt: {gte: "${startDate}T00:00:00Z", lt: "${endDate}T00:00:00Z"}
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
      labels(first: 15) {
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
    first: 250
    filter: {
      team: {id: {eq: "5feed208-25ac-4eb5-a2e6-e5f60f957b00"}}
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
      updatedAt
      assignee {name}
      team {key}
    }
  }
}
`;
}
