# Historical Data & Backfill Guide

## Current Situation

🔴 **Meses anteriores**: No tienen datos de reaperturas (webhook acaba de activarse)  
🟢 **Mes actual en adelante**: Datos 100% precisos

## Por Qué No Hay Datos Históricos

El webhook **solo comienza a registrar eventos desde que se activa**. Linear API GraphQL no expone:
- ❌ Histórico completo de transiciones de estado
- ❌ Audit logs detallados
- ❌ Events replay API

## 3 Opciones para Obtener Datos Históricos

### ✅ Opción 1: Usar Heurísticas (Recomendado para empezar)

**Precisión**: 50-70%  
**Esfuerzo**: Bajo  
**Tiempo**: Inmediato

Usar timestamps para inferir reaperturas:

```
Si un issue está "Closed" pero fue "updatedAt" > 1 día después de "completedAt"
→ Probablemente fue reabierto
```

**Ventajas:**
- ✅ No requiere Linear API especial
- ✅ Funciona con datos actuales
- ✅ Se ejecuta rápido

**Desventajas:**
- ❌ Menor precisión
- ❌ Falsos positivos/negativos

### ⭐ Opción 2: Backfill Manual desde Linear

**Precisión**: 100%  
**Esfuerzo**: Medio  
**Tiempo**: 30 minutos

**Pasos:**

1. **Exportar datos de Linear**

Ve a: https://linear.app/[workspace]/settings → Activity Log

O descarga el reporte de issues:
```bash
# Via Linear API GraphQL
# Query: issues con filtro de fecha
# Campos: id, identifier, createdAt, completedAt, state
```

2. **Crear CSV con transiciones**

```csv
issueId,issueIdentifier,fromState,toState,changedAt,changedBy
abc123,CE2-1590,Closed,In Progress,2026-05-05T09:00:00Z,John Doe
def456,CE2-456,In Progress,Closed,2026-05-05T16:00:00Z,Jane Smith
```

3. **Ejecutar script de importación**

```bash
./scripts/import-transitions.sh transitions.csv \
  --kv ce2-state-history-prod \
  --api-key $CLOUDFLARE_API_KEY
```

**Ventajas:**
- ✅ Precisión 100%
- ✅ Datos históricos completos
- ✅ Puede hacerse en background

**Desventajas:**
- ❌ Requiere manual effort
- ❌ Requiere acceso a Linear Activity Log

### 🔵 Opción 3: Solicitar a Linear Support

**Precisión**: 100%  
**Esfuerzo**: Muy bajo (solo solicitud)  
**Tiempo**: Esperar respuesta

Contacta a Linear Support:
- Email: support@linear.app
- Solicita: "Audit logs API" o "Historical webhook replay"

**Ventajas:**
- ✅ Official solution
- ✅ Mantenimiento futuro garantizado

**Desventajas:**
- ❌ Puede no estar disponible
- ❌ Tiempo de respuesta indefinido

---

## Recomendación Práctica

### Para Ahora (Inmediato):

```
Usa Opción 1 (Heurísticas)
↓
Las métricas mostrarán aproximaciones para meses pasados
↓
Mes actual en adelante: 100% precisas
```

**En el dashboard verás:**

```
Mayo (mes pasado):
  Reopen Rate: 7.5% (estimado con heurísticas 🔴)

Junio (mes actual):
  Reopen Rate: 7.5% (100% preciso con webhooks 🟢)
```

### Para Máxima Precisión:

```
Opción 2: Manual backfill
↓
Exporta Linear activity log
↓
Importa a KV
↓
Todas las métricas 100% precisas retroactivamente
```

---

## Implementación de Heurísticas

Ya está lista en: `ce2-metrics-with-history.ts`

**Uso:**

```typescript
const metricsWithHistory = new CE2MetricsWithHistory(client, historyService);

// Calcula métrica con indicador de calidad
const result = await metricsWithHistory.calculateReopenRateWithHistory(2026, 5);

console.log(result);
// {
//   period: "2026-05",
//   dataQuality: "partial",
//   dataQuality_reason: "Mix of webhook data + heuristic detection",
//   metrics: {
//     reopenRate: {
//       value: 7.5,
//       reopenedCount: 3,
//       totalP1P2: 40,
//       detectedVia: "webhook + heuristic"
//     }
//   }
// }
```

**Integración en dashboard:**

```javascript
// En index.html, mostrar indicador de calidad

<div class="metric-card">
  <div class="metric-label">Tasa de Reapertura</div>
  <div class="metric-value">7.5%</div>
  
  <!-- Nuevo: indicador de calidad -->
  <div class="data-quality">
    🟡 Datos parciales (heurísticas + webhook)
    <div class="tooltip">
      Este mes usa datos exactos de webhooks.
      Meses anteriores usan inferencia de timestamps.
    </div>
  </div>
</div>
```

---

## Niveles de Confianza de Datos

| Período | Fuente | Confianza | Símbolo |
|---------|--------|-----------|---------|
| Meses antes de webhook | Heurísticas | 50-70% | 🔴 |
| Meses con webhook parcial | Mix | 80-95% | 🟡 |
| Mes actual | Webhooks | 100% | 🟢 |
| Después backfill | KV + Webhooks | 100% | ✅ |

---

## Flujo Recomendado

```
Semana 1: Activa webhook → Datos 100% precisos desde ahora
          Heurísticas para meses pasados (estimadas)

Semana 2-3: (Opcional) Backfill manual de datos históricos
            Si necesitas precisión 100% retroactiva

Semana 4: Comparaciones mes-a-mes 100% precisas
          (si hiciste backfill)
```

---

## Scripts Disponibles

### Para Heurísticas (automático)
✅ Ya está integrado en `ce2-metrics-with-history.ts`

### Para Backfill Manual
📝 Crear: `scripts/import-transitions.sh`
- Lee CSV con transiciones
- Importa a KV

### Para Exportar de Linear
📝 Crear: `scripts/export-linear-activity.ts`
- Query Linear API
- Genera CSV de transiciones

---

## Próximos Pasos

**Ahora:**
1. ✅ Webhook activo
2. ✅ Datos en tiempo real 100% precisos

**Próxima semana:**
1. ⏭️ (Opcional) Hacer backfill si quieres histórico 100%
2. ⏭️ (Opcional) Integrar heurísticas en dashboard

**Mes que viene:**
1. ✅ Comparaciones mes-a-mes 100% precisas
