/**
 * Service para almacenar y consultar historial de transiciones de estado
 * Usa Cloudflare KV para persistencia
 */

export interface StateTransition {
  issueId: string;
  issueIdentifier: string;
  fromState: string;
  toState: string;
  changedAt: string;
  changedBy?: string;
  timestamp: number;
}

export interface IssueStateHistory {
  issueId: string;
  issueIdentifier: string;
  priority: number;
  team: string;
  transitions: StateTransition[];
  lastUpdated: string;
}

export class StateHistoryService {
  private kv: KVNamespace;
  private readonly HISTORY_PREFIX = "issue_history:";
  private readonly TRANSITION_PREFIX = "transition:";

  constructor(kvNamespace: KVNamespace) {
    this.kv = kvNamespace;
  }

  /**
   * Registra una transición de estado
   */
  async recordTransition(transition: StateTransition): Promise<void> {
    const key = `${this.TRANSITION_PREFIX}${transition.issueId}:${transition.timestamp}`;

    await this.kv.put(
      key,
      JSON.stringify(transition),
      {
        expirationTtl: 90 * 24 * 60 * 60, // 90 días
      }
    );

    // Actualizar índice de issue
    await this.updateIssueIndex(transition);

    console.log(
      `[StateHistory] Recorded transition: ${transition.issueIdentifier} ${transition.fromState} → ${transition.toState}`
    );
  }

  /**
   * Obtiene el historial completo de un issue
   */
  async getIssueHistory(issueId: string): Promise<StateTransition[]> {
    const prefix = `${this.TRANSITION_PREFIX}${issueId}:`;
    const list = await this.kv.list({ prefix });

    const transitions: StateTransition[] = [];
    for (const item of list.keys) {
      const jsonStr = await this.kv.get(item.name, "text");
      const data = jsonStr ? JSON.parse(jsonStr) as StateTransition : null;
      if (data) {
        transitions.push(data);
      }
    }

    // Ordenar por timestamp descendente (más reciente primero)
    return transitions.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Detecta si un issue fue reabierto
   * Busca transición: Closed → In Progress (o In Review)
   */
  async wasReopened(issueId: string): Promise<boolean> {
    const transitions = await this.getIssueHistory(issueId);

    return transitions.some(t =>
      (t.fromState === "Closed" || t.fromState === "Done") &&
      (t.toState === "In Progress" || t.toState === "In Review")
    );
  }

  /**
   * Obtiene todas las reaperturas en un rango de fechas
   */
  async getReopenedsInPeriod(
    startDate: string,
    endDate: string
  ): Promise<StateTransition[]> {
    // Nota: Esta es una búsqueda aproximada porque KV no tiene búsqueda avanzada
    // En producción, podrías usar Durable Objects o una base de datos externa
    const allKeys = await this.kv.list({ prefix: this.TRANSITION_PREFIX });
    const reopened: StateTransition[] = [];

    for (const item of allKeys.keys) {
      const jsonStr = await this.kv.get(item.name, "text");
      const data = jsonStr ? JSON.parse(jsonStr) as StateTransition : null;
      if (
        data &&
        data.changedAt >= startDate &&
        data.changedAt < endDate &&
        (data.fromState === "Closed" || data.fromState === "Done") &&
        (data.toState === "In Progress" || data.toState === "In Review")
      ) {
        reopened.push(data);
      }
    }

    return reopened;
  }

  /**
   * Detecta cambios de team (para Containment Rate)
   */
  async hadTeamChange(issueId: string): Promise<boolean> {
    const transitions = await this.getIssueHistory(issueId);

    // Buscar cualquier transición que sea un cambio de team
    // Nota: Esto requeriría que Linear webhook incluya el campo team en el historial
    // Por ahora, retornamos false hasta que tengamos esos datos
    return false;
  }

  /**
   * Detecta cambios de prioridad (para Noise Reduction)
   */
  async hasPriorityDowngrade(issueId: string): Promise<boolean> {
    const transitions = await this.getIssueHistory(issueId);

    // Buscar si hubo una reducción de prioridad: P1 → P3
    // Nota: El webhook debe incluir priority en los datos
    return transitions.some(t =>
      t.fromState === "Priority 1" &&
      t.toState === "Priority 3"
    );
  }

  /**
   * Obtiene estadísticas de un issue
   */
  async getIssueStats(issueId: string): Promise<{
    reopened: boolean;
    reopenCount: number;
    lastReopenDate: string | null;
    teamChanged: boolean;
    priorityDowngraded: boolean;
  }> {
    const transitions = await this.getIssueHistory(issueId);

    const reopens = transitions.filter(t =>
      (t.fromState === "Closed" || t.fromState === "Done") &&
      (t.toState === "In Progress" || t.toState === "In Review")
    );

    return {
      reopened: reopens.length > 0,
      reopenCount: reopens.length,
      lastReopenDate: reopens.length > 0 ? reopens[0].changedAt : null,
      teamChanged: await this.hadTeamChange(issueId),
      priorityDowngraded: await this.hasPriorityDowngrade(issueId),
    };
  }

  /**
   * Limpia el historial viejo
   */
  async cleanupOldHistory(daysToKeep: number = 90): Promise<void> {
    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    const allKeys = await this.kv.list({ prefix: this.TRANSITION_PREFIX });

    let deleted = 0;
    for (const item of allKeys.keys) {
      const jsonStr = await this.kv.get(item.name, "text");
      const data = jsonStr ? JSON.parse(jsonStr) as StateTransition : null;
      if (data && data.timestamp < cutoffTime) {
        await this.kv.delete(item.name);
        deleted++;
      }
    }

    console.log(`[StateHistory] Cleaned up ${deleted} old transitions`);
  }

  /**
   * Actualiza el índice del issue (para búsquedas rápidas)
   */
  private async updateIssueIndex(transition: StateTransition): Promise<void> {
    const indexKey = `${this.HISTORY_PREFIX}${transition.issueId}`;

    const jsonStr = await this.kv.get(indexKey, "text");
    const history = jsonStr ? JSON.parse(jsonStr) as IssueStateHistory : null;

    const updated: IssueStateHistory = {
      issueId: transition.issueId,
      issueIdentifier: transition.issueIdentifier,
      priority: history?.priority ?? 0,
      team: history?.team ?? "",
      transitions: history?.transitions ?? [],
      lastUpdated: new Date().toISOString(),
    };

    updated.transitions.push(transition);
    // Mantener solo las últimas 100 transiciones en el índice
    if (updated.transitions.length > 100) {
      updated.transitions = updated.transitions.slice(0, 100);
    }

    await this.kv.put(
      indexKey,
      JSON.stringify(updated),
      {
        expirationTtl: 180 * 24 * 60 * 60, // 180 días
      }
    );
  }
}
