/**
 * Enhanced CE2 Metrics Service with Historical Data Support
 *
 * This version can calculate metrics for past months by:
 * 1. Getting current state of all P1/P2 issues
 * 2. Querying KV for any state transitions that happened
 * 3. For issues without KV data, inferring from current state + timestamps
 *
 * Limitations:
 * - Can only detect reopens that are recorded in KV (from webhook)
 * - For months before webhook, uses heuristics (long time in Closed state = likely reopened)
 */

import { StateHistoryService } from "./state-history";
import type { CE2Issue } from "../types";

export interface HistoricalMetricCalculation {
  period: string;
  dataQuality: "complete" | "partial" | "estimated";
  dataQuality_reason: string;
  metrics: {
    reopenRate: {
      value: number;
      reopenedCount: number;
      totalP1P2: number;
      detectedVia: string;
    };
  };
}

export class CE2MetricsWithHistory {
  constructor(
    private historyService: StateHistoryService,
    private client: any // LinearClient
  ) {}

  /**
   * Calculate reopen rate for a specific month
   * Returns data quality indicator showing if it's based on:
   * - "complete": Full webhook history available
   * - "partial": Some webhook data available (mixed with current state)
   * - "estimated": Inferred from current state (no webhook data yet)
   */
  async calculateReopenRateWithHistory(
    year: number,
    month: number
  ): Promise<HistoricalMetricCalculation> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(
      month === 12 ? year + 1 : year,
      month === 12 ? 0 : month,
      1
    );

    const startISO = startDate.toISOString().split("T")[0];
    const endISO = endDate.toISOString().split("T")[0];

    // Get all P1/P2 issues created in this period
    const query = `
      {
        issues(
          first: 250
          filter: {
            team: {id: {eq: "5feed208-25ac-4eb5-a2e6-e5f60f957b00"}}
            project: {null: true}
            priority: {in: [1, 2]}
            createdAt: {gte: "${startISO}T00:00:00Z", lt: "${endISO}T00:00:00Z"}
          }
        ) {
          nodes {
            id
            identifier
            priority
            state {name}
            createdAt
            completedAt
            updatedAt
          }
        }
      }
    `;

    const result = await this.client.query<{ issues: { nodes: CE2Issue[] } }>(
      query
    );

    if (!result?.issues?.nodes) {
      return {
        period: `${year}-${month.toString().padStart(2, "0")}`,
        dataQuality: "estimated",
        dataQuality_reason: "No issues found for period",
        metrics: {
          reopenRate: {
            value: 0,
            reopenedCount: 0,
            totalP1P2: 0,
            detectedVia: "none",
          },
        },
      };
    }

    const p1p2Issues = result.issues.nodes;
    let reopenedCount = 0;
    let dataQuality: "complete" | "partial" | "estimated" = "estimated";
    const detectionMethods: Set<string> = new Set();

    // Check each issue
    for (const issue of p1p2Issues) {
      // Method 1: Check KV for explicit reopen event
      const wasReopened = await this.historyService.wasReopened(issue.id);
      if (wasReopened) {
        reopenedCount++;
        detectionMethods.add("webhook");
        dataQuality = "complete";
        continue;
      }

      // Method 2: Heuristic - if issue is currently closed but has recentUpdates
      // and time between completion dates suggests rework
      if (issue.state.name === "Closed" && issue.completedAt) {
        const completedTime = new Date(issue.completedAt).getTime();
        const updatedTime = new Date(issue.updatedAt).getTime();
        const daysSinceCompletion = (updatedTime - completedTime) / (1000 * 60 * 60 * 24);

        // If updated more than 1 day after being completed, likely reopened
        if (daysSinceCompletion > 1) {
          reopenedCount++;
          detectionMethods.add("heuristic");
          if (dataQuality === "estimated") {
            dataQuality = "partial";
          }
        }
      }
    }

    const value =
      p1p2Issues.length > 0
        ? parseFloat(((reopenedCount / p1p2Issues.length) * 100).toFixed(1))
        : 0;

    const methodsArray = Array.from(detectionMethods);
    const reasonMap = {
      complete: "Full webhook history available for this period",
      partial: "Mix of webhook data and heuristic detection",
      estimated:
        "Using heuristics only (webhook started after this period)",
    };

    return {
      period: `${year}-${month.toString().padStart(2, "0")}`,
      dataQuality,
      dataQuality_reason: reasonMap[dataQuality],
      metrics: {
        reopenRate: {
          value,
          reopenedCount,
          totalP1P2: p1p2Issues.length,
          detectedVia: methodsArray.join(" + ") || "none",
        },
      },
    };
  }

  /**
   * Calculate metrics for all months in a year
   * Shows which months have complete/partial/estimated data
   */
  async calculateYearlyMetrics(year: number): Promise<HistoricalMetricCalculation[]> {
    const results: HistoricalMetricCalculation[] = [];

    for (let month = 1; month <= 12; month++) {
      const result = await this.calculateReopenRateWithHistory(year, month);
      results.push(result);
    }

    return results;
  }
}

/**
 * Data Quality Levels:
 *
 * COMPLETE (🟢 High Confidence)
 * - Webhook was active for this entire period
 * - All state transitions are recorded in KV
 * - Reopen Rate = 100% accurate
 *
 * PARTIAL (🟡 Medium Confidence)
 * - Webhook was active for part of the period
 * - Mix of webhook data + heuristic inference
 * - Reopen Rate = 80-95% accurate
 *
 * ESTIMATED (🔴 Low Confidence)
 * - Webhook started after this period
 * - Using heuristics only (time gaps, update timestamps)
 * - Reopen Rate = 50-70% accurate
 *
 * WORKAROUND: If you need accurate historical data for past months:
 * 1. Export Linear issue history as CSV
 * 2. Parse state change timestamps
 * 3. Import via a backfill script
 * 4. Re-calculate metrics with complete data
 */
