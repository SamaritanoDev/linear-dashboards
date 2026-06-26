const LINEAR_API = "https://api.linear.app/graphql";

export interface LinearClientOptions {
  apiKey: string;
}

export interface LinearNode {
  id: string;
}

export class LinearClient {
  private apiKey: string;

  constructor(options: LinearClientOptions) {
    this.apiKey = options.apiKey;
  }

  async query<T>(query: string): Promise<T | null> {
    try {
      const response = await fetch(LINEAR_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.apiKey,
        },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        console.error(`Linear API HTTP error: ${response.status} ${response.statusText}`);
        return null;
      }

      const result = (await response.json()) as Record<string, unknown>;

      if ((result as Record<string, unknown>).errors) {
        const errors = (result as Record<string, unknown>).errors;
        console.error("Linear GraphQL error:", JSON.stringify(errors, null, 2));
        console.error("Query that failed:", query.substring(0, 200));
        return null;
      }

      return (result as Record<string, unknown>).data as T;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Linear query failed:", errorMsg);
      return null;
    }
  }

  // Fetches all pages of a paginated issues query.
  // The queryFn receives an optional cursor and must embed pageInfo { hasNextPage endCursor } in the response.
  async queryAllIssues<N>(
    queryFn: (cursor: string | null) => string
  ): Promise<N[]> {
    const all: N[] = [];
    let cursor: string | null = null;

    do {
      interface PagedResult { issues: { nodes: N[]; pageInfo: { hasNextPage: boolean; endCursor: string } } }
      const result: PagedResult | null = await this.query<PagedResult>(queryFn(cursor));
      if (!result?.issues) break;
      all.push(...result.issues.nodes);
      cursor = result.issues.pageInfo.hasNextPage ? result.issues.pageInfo.endCursor : null;
    } while (cursor !== null);

    return all;
  }
}
