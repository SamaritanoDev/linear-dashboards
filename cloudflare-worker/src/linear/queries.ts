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
