# CE2 Dashboard Tabs - Data Structure Guide

## Overview Tab (Overview)
**API Call**: `GET /api/ce2/metrics/summary?month=Mayo`

**Expected Response Structure**:
```json
{
  "period": "2026-04-27 to 2026-05-27",
  "team": "CE2",
  "summary": {
    "vip_resolution_rate": {
      "value": 87.5,
      "unit": "%",
      "tooltip": "...",
      "audience": "Gerencia / Stakeholders"
    },
    "fcrr": {
      "value": 92.3,
      "unit": "%",
      "tooltip": "...",
      "audience": "CTO / PM"
    },
    "reopen_rate": { "value": 7.5, "unit": "%", ... },
    "containment_rate": { "value": 95.0, "unit": "%", ... },
    "mttr_urgent_hours": { "value": 2.3, "unit": "hours", ... },
    "mttr_high_hours": { "value": 5.7, "unit": "hours", ... },
    "downtime_saved": { "value": 18.5, "unit": "hours", ... },
    "fire_prevention": { "value": 25.5, "unit": "%", ... },
    "noise_reduction": { "value": 22.8, "unit": "%", ... }
  },
  "business_metrics": {
    "total_critical_issues": 40,
    "total_value_saved": "$100,000.00",
    "incidents_per_day": 1.3,
    "team_capacity_utilized": "Very High"
  },
  "cached_at": "2026-05-28T15:30:00Z"
}
```

---

## Projects Tab (Planned Work)
**API Call**: `GET /api/ce2/metrics/summary?month=Mayo&filter=with_project`

**Expected Characteristics**:
- **Data Source**: Issues that have an associated project
- **Work Type**: Planned, project-based deliverables
- **Typical Values**:
  - Issues count: ~30 (about 43% of CE2 workload)
  - MTTR P1: ~112 hours (SLA: 48 hours) ⚠️ Exceeds SLA
  - MTTR P2: ~96 hours (SLA: 48 hours) ⚠️ Exceeds SLA
  - VIP Resolution Rate: ~62.7% (lower due to SLA misses)
  - Containment Rate: ~90% (good internal capability)

**Response Format**: Same structure as Overview tab, but with filtered data

---

## Hotfixes Tab (Reactive Work)
**API Call**: `GET /api/ce2/metrics/summary?month=Mayo&filter=without_project`

**Expected Characteristics**:
- **Data Source**: Issues without an associated project (hotfixes/incidents)
- **Work Type**: Reactive incident response
- **Typical Values**:
  - Issues count: ~41 (about 57% of CE2 workload)
  - MTTR P1: ~61.2 hours (SLA: 4 hours) ⚠️ Way exceeds SLA
  - MTTR P2: ~80.5 hours (SLA: 8 hours) ⚠️ Way exceeds SLA
  - VIP Resolution Rate: ~87.5% (better with just hotfixes)
  - FCRR: ~92.3% (hotfixes are durable)

**Response Format**: Same structure as Overview tab, but with filtered data

---

## Comparison Tab (Analysis)
**Parallel API Calls**:
1. `GET /api/ce2/metrics/summary?month=Mayo&filter=with_project`
2. `GET /api/ce2/metrics/summary?month=Mayo&filter=without_project`

**Comparison Table Structure**:
```
┌─────────────────────┬──────────────┬──────────────┬────────────────────┐
│ Metric              │ Projects (%) │ Hotfixes (%) │ Difference (Δ %)   │
├─────────────────────┼──────────────┼──────────────┼────────────────────┤
│ VIP Resolution Rate │ 62.7         │ 87.5         │ -24.8 (-28.3%)     │
│ FCRR                │ 88.5         │ 92.3         │ -3.8 (-4.1%)       │
│ MTTR (P1) hours     │ 112.0        │ 61.2         │ +50.8 (+83.0%)     │
│ MTTR (P2) hours     │ 96.0         │ 80.5         │ +15.5 (+19.3%)     │
│ Containment Rate    │ 90.0         │ 95.0         │ -5.0 (-5.3%)       │
│ Downtime Saved      │ 12.3         │ 18.5         │ -6.2 (-33.5%)      │
└─────────────────────┴──────────────┴──────────────┴────────────────────┘
```

**Key Insights**:
- **Projects slower**: MTTR much higher (planned work takes longer)
- **Hotfixes more effective**: Higher FCRR and containment
- **Mixed quality**: Projects lower VIP resolution due to SLA misses
- **Complementary metrics**: Each type has different strengths/weaknesses

---

## Data Consistency Checks

When comparing tabs, verify:

### 1. Issue Counts Add Up
```
Total CE2 Issues ≈ Projects Count + Hotfixes Count
Expected: ~70-75 total issues per month
```

### 2. MTTR Values Make Sense
```
Projects MTTR > Hotfixes MTTR
(Planned work typically takes longer)
```

### 3. Quality Metrics Inverse Correlation
```
If Hotfixes FCRR is high (92%+)
Then Hotfixes Reopen Rate should be low (7-8%)
```

### 4. Business Metrics Proportional
```
Projects Issues / Total Issues ≈ 45-50%
Hotfixes Issues / Total Issues ≈ 50-55%
```

---

## Sample Test Queries

### Test 1: Load Overview Tab
```javascript
// Should load metrics without filter (defaults to without_project)
await fetch(`${WORKER_CONFIG.baseUrl}/api/ce2/metrics/summary?month=Mayo`)
```

### Test 2: Load Projects Tab
```javascript
// Should load metrics with filter=with_project
await fetch(`${WORKER_CONFIG.baseUrl}/api/ce2/metrics/summary?month=Mayo&filter=with_project`)
```

### Test 3: Load Hotfixes Tab
```javascript
// Should load metrics with filter=without_project
await fetch(`${WORKER_CONFIG.baseUrl}/api/ce2/metrics/summary?month=Mayo&filter=without_project`)
```

### Test 4: Comparison
```javascript
// Parallel fetch both endpoints
const [projects, hotfixes] = await Promise.all([
  fetch(`${WORKER_CONFIG.baseUrl}/api/ce2/metrics/summary?month=Mayo&filter=with_project`).then(r => r.json()),
  fetch(`${WORKER_CONFIG.baseUrl}/api/ce2/metrics/summary?month=Mayo&filter=without_project`).then(r => r.json())
])
```

---

## Debugging Guide

### Issue: Comparison tab shows identical values
**Cause**: Both API calls returning same data
**Fix**: Verify filter parameter is being passed correctly to Cloudflare Worker

### Issue: Projects/Hotfixes tab shows "Cargando..."
**Cause**: API call failing or slow response
**Fix**: Check browser console for fetch errors, verify API endpoint supports filter parameter

### Issue: Tab switching doesn't work
**Cause**: JavaScript function not defined or event listener not attached
**Fix**: Check that `window.switchCE2Tab` is defined, verify onclick handlers in HTML

### Issue: Metrics show 0 or null values
**Cause**: Filter returning no issues
**Fix**: Verify that issues with/without projects exist in Linear for the selected month

---

## Performance Notes

### Expected Load Times
- Overview Tab: ~500-800ms (cached)
- Projects Tab: ~600-1000ms (first load)
- Hotfixes Tab: ~600-1000ms (first load)
- Comparison Tab: ~1200-1500ms (parallel calls)

### Optimization Tips
1. Cache responses in localStorage (already implemented)
2. Use Promise.all() for parallel loads (already implemented)
3. Debounce month selector changes to avoid rapid re-requests
4. Lazy-load comparison tab (only fetch when tab is clicked)
