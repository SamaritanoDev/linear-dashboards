/**
 * Manejador de webhooks de Linear API
 * Recibe eventos cuando cambian estados, prioridades, etc.
 */

import { StateHistoryService, StateTransition } from "../services/state-history";

export interface LinearWebhookPayload {
  action: string;
  createdAt: string;
  data: {
    id: string;
    identifier: string;
    title: string;
    priority?: number;
    previousValues?: {
      state?: { name: string };
      priority?: number;
      assignee?: { name: string };
      team?: { name: string };
    };
    state?: {
      name: string;
    };
    createdAt?: string;
    completedAt?: string | null;
    assignee?: {
      name: string;
    } | null;
    team?: {
      key: string;
    };
    actor?: {
      name: string;
      email: string;
    };
  };
}

export class LinearWebhookHandler {
  private historyService: StateHistoryService;

  constructor(historyService: StateHistoryService) {
    this.historyService = historyService;
  }

  /**
   * Procesa un webhook de Linear
   */
  async handleWebhook(payload: LinearWebhookPayload): Promise<{
    success: boolean;
    recorded?: string;
    error?: string;
  }> {
    try {
      console.log(
        `[Webhook] Received event: ${payload.action} for ${payload.data.identifier}`
      );

      // Solo nos interesan los cambios de estado
      if (payload.action === "Issue.updated" && payload.data.previousValues?.state) {
        return await this.handleStateChange(payload);
      }

      // También registrar cambios de prioridad
      if (payload.action === "Issue.updated" && payload.data.previousValues?.priority !== undefined) {
        return await this.handlePriorityChange(payload);
      }

      return { success: true, recorded: "No relevant changes" };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      console.error(`[Webhook] Error processing event: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Maneja cambios de estado del issue
   */
  private async handleStateChange(
    payload: LinearWebhookPayload
  ): Promise<{ success: boolean; recorded?: string }> {
    const fromState = payload.data.previousValues?.state?.name || "Unknown";
    const toState = payload.data.state?.name || "Unknown";

    // Evitar registrar el mismo estado
    if (fromState === toState) {
      return { success: true, recorded: "Same state, skipped" };
    }

    const transition: StateTransition = {
      issueId: payload.data.id,
      issueIdentifier: payload.data.identifier,
      fromState,
      toState,
      changedAt: payload.createdAt,
      changedBy: payload.data.actor?.name,
      timestamp: new Date(payload.createdAt).getTime(),
    };

    await this.historyService.recordTransition(transition);

    // Log específico para reaperturas
    if (
      (fromState === "Closed" || fromState === "Done") &&
      (toState === "In Progress" || toState === "In Review")
    ) {
      console.warn(
        `[Webhook] 🔄 REOPEN DETECTED: ${payload.data.identifier} was reopened!`
      );
    }

    return {
      success: true,
      recorded: `${payload.data.identifier}: ${fromState} → ${toState}`,
    };
  }

  /**
   * Maneja cambios de prioridad del issue
   */
  private async handlePriorityChange(
    payload: LinearWebhookPayload
  ): Promise<{ success: boolean; recorded?: string }> {
    const fromPriority = payload.data.previousValues?.priority;
    const toPriority = payload.data.priority;

    // Convertir números a nombres legibles
    const priorityNames: Record<number, string> = {
      1: "P1 (Urgent)",
      2: "P2 (High)",
      3: "P3 (Medium)",
      4: "P4 (Low)",
    };

    const fromName = priorityNames[fromPriority!] || `P${fromPriority}`;
    const toName = priorityNames[toPriority!] || `P${toPriority}`;

    const transition: StateTransition = {
      issueId: payload.data.id,
      issueIdentifier: payload.data.identifier,
      fromState: `Priority ${fromName}`,
      toState: `Priority ${toName}`,
      changedAt: payload.createdAt,
      changedBy: payload.data.actor?.name,
      timestamp: new Date(payload.createdAt).getTime(),
    };

    await this.historyService.recordTransition(transition);

    // Log específico para downgrade (falsa alarma)
    if (fromPriority === 1 && toPriority === 3) {
      console.info(
        `[Webhook] 📉 FALSE ALARM DOWNGRADE: ${payload.data.identifier} downgraded P1 → P3`
      );
    }

    return {
      success: true,
      recorded: `${payload.data.identifier}: ${fromName} → ${toName}`,
    };
  }

  /**
   * Valida el webhook usando HMAC (si Linear lo proporciona)
   */
  static validateWebhook(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    // Implementar validación HMAC si Linear proporciona firma
    // Por ahora, solo retornamos true (en producción, validar)
    console.log("[Webhook] Signature validation skipped (TODO: implement)");
    return true;
  }
}

/**
 * Tipos para Linear webhook
 * Referencia: https://linear.app/docs/graphql/webhooks
 */
export interface WebhookEvent {
  id: string;
  createdAt: string;
  action: string;
  data: {
    id: string;
    identifier: string;
    title: string;
    priority: number;
    state: { id: string; name: string };
    team: { id: string; key: string };
    project: { id: string } | null;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    assignee: { id: string; name: string; email: string } | null;
    previousValues?: {
      state?: { id: string; name: string };
      priority?: number;
      assignee?: { id: string; name: string } | null;
    };
    actor?: {
      id: string;
      name: string;
      email: string;
    };
  };
}
