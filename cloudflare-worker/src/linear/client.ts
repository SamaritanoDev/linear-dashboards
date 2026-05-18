const LINEAR_API = "https://api.linear.app/graphql";

export interface LinearClientOptions {
  apiKey: string;
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

      const result = (await response.json()) as Record<string, unknown>;

      if ((result as Record<string, unknown>).errors) {
        console.error("Linear API error:", (result as Record<string, unknown>).errors);
        return null;
      }

      return (result as Record<string, unknown>).data as T;
    } catch (error) {
      console.error("Linear query failed:", error);
      return null;
    }
  }
}
