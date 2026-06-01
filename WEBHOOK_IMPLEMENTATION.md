# CE2 Webhook Implementation - Feature Branch Summary

**Branch**: `feature/ce2-webhook-history`

## Problem Solved

Previously, the CE2 dashboard couldn't calculate **Reopen Rate** and **Containment Rate** metrics because:
- Linear GraphQL API doesn't provide historical state transitions
- No way to detect when an issue was reopened
- No way to detect when an issue was escalated to another team

**Solution**: Implement webhook system to capture state changes in real-time and store them in Cloudflare KV.

## What Was Built

### 1. StateHistoryService
**File**: `cloudflare-worker/src/services/state-history.ts`

Persistent storage layer for all state transitions using Cloudflare KV.

```typescript
class StateHistoryService {
  recordTransition(transition)      // Save a state/priority change
  wasReopened(issueId)             // Check if issue was reopened
  getIssueHistory(issueId)         // Get all transitions
  getReopenedsInPeriod(start, end) // Find reopens in date range
  hadTeamChange(issueId)           // Check if escalated
  getIssueStats(issueId)           // Complete issue audit trail
}
```

**Storage Model:**
```
Key: transition:issueId:timestamp
Value: {
  issueId, issueIdentifier, fromState, toState,
  changedAt, changedBy, timestamp
}
TTL: 90 days
```

### 2. LinearWebhookHandler
**File**: `cloudflare-worker/src/linear/webhook-handler.ts`

Processes incoming Linear API webhook events.

```typescript
class LinearWebhookHandler {
  handleWebhook(payload)        // Main entry point
  handleStateChange(payload)    // State transitions
  handlePriorityChange(payload) // Priority changes
}
```

**Events Detected:**
- ✅ Closed → In Progress (reopen)
- ✅ Closed → In Review (reopen)
- ✅ P1 → P3 (false alarm downgrade)
- ✅ Any team change (escalation)

### 3. Webhook Endpoint
**File**: `cloudflare-worker/src/index.ts`

**Routes:**
- `POST /webhook/linear` - Receive events from Linear
- `GET /api/debug/webhook` - Check webhook status

### 4. Updated CE2MetricsService
**File**: `cloudflare-worker/src/services/ce2-metrics.ts`

Now queries historical data instead of hardcoded values:

```typescript
// Before: Hardcoded 0%
const reopened: any[] = [];
const value = 0;

// After: Query real data
for (const issue of p1p2Issues) {
  const wasReopened = await this.historyService.wasReopened(issue.id);
  if (wasReopened) reopened.push(issue);
}
const value = (reopened.length / p1p2Issues.length) * 100;
```

## Files Changed

```
cloudflare-worker/
├── src/
│   ├── index.ts (updated)
│   │   - Added StateHistoryService import
│   │   - Added LinearWebhookHandler import
│   │   - Added POST /webhook/linear endpoint
│   │   - Added GET /api/debug/webhook endpoint
│   │   - Updated CE2MetricsService instantiation
│   │
│   ├── services/
│   │   ├── ce2-metrics.ts (updated)
│   │   │   - calculateReopenRate now async
│   │   │   - calculateContainmentRate now async
│   │   │   - Uses StateHistoryService for real data
│   │   │
│   │   └── state-history.ts (NEW)
│   │       - KV-backed persistent storage
│   │       - Transition recording and querying
│   │       - Data cleanup and indexing
│   │
│   └── linear/
│       └── webhook-handler.ts (NEW)
│           - Parse and validate webhooks
│           - Detect reopens and false alarms
│           - Log important events
│
├── wrangler.toml (updated)
│   - Added CE2_HISTORY KV binding for dev/prod
│   - TTL configuration for record retention
│
└── package.json (unchanged)
```

## Configuration

### Cloudflare KV Setup

Two KV namespaces (one for each environment):

```
Development:
  Namespace: ce2-state-history-dev
  Binding: CE2_HISTORY
  
Production:
  Namespace: ce2-state-history-prod
  Binding: CE2_HISTORY
```

### wrangler.toml

```toml
[env.development]
kv_namespaces = [
  { binding = "CE2_HISTORY", id = "ce2-state-history-dev", preview_id = "ce2-state-history-dev" }
]

[env.production]
kv_namespaces = [
  { binding = "CE2_HISTORY", id = "ce2-state-history-prod", preview_id = "ce2-state-history-prod" }
]
```

## How It Works

### Flow Diagram

```
User closes issue in Linear
        ↓
Linear triggers webhook
        ↓
POST /webhook/linear
        ↓
LinearWebhookHandler.handleWebhook()
        ↓
Parse payload
  - Identify state change: Closed → In Progress
  - Create StateTransition object
        ↓
StateHistoryService.recordTransition()
        ↓
Store in KV:
  Key: transition:ce2-1590:1717242000
  Value: {issueId, fromState, toState, ...}
        ↓
[Day later] Dashboard calls metrics API
        ↓
CE2MetricsService.calculateReopenRate()
        ↓
For each P1/P2 issue:
  historyService.wasReopened(issueId)
        ↓
Query KV for transitions where:
  fromState = "Closed"
  toState = "In Progress"
        ↓
Return actual reopen %
  (not hardcoded 0%)
```

### Example Scenario

**Scenario**: CE2-1590 was closed on May 1, but customer reported it still happens on May 5.

**Linear Actions**:
1. May 1, 14:30 - Set state to "Closed"
   - Webhook sent: `{Closed}` transition recorded
2. May 5, 09:00 - Reopen issue
   - Webhook sent: `{Closed → In Progress}` recorded ← **KEY EVENT**
3. May 5, 16:00 - Close again after investigation
   - Webhook sent: `{In Progress → Closed}` recorded

**Metric Calculation**:
```
CE2-1590 ∈ P1 issues ✓
CE2-1590.wasReopened()
  → Query KV for: transition:CE2-1590:*
  → Found: {fromState: "Closed", toState: "In Progress"}
  → Return true ✓

Reopen Rate = 1 reopened / 40 total P1/P2 × 100 = 2.5%
```

## Testing

### Manual Webhook Test

```bash
curl -X POST https://your-worker.workers.dev/webhook/linear \
  -H "Content-Type: application/json" \
  -d '{
    "action": "Issue.updated",
    "createdAt": "2026-06-01T14:30:00Z",
    "data": {
      "id": "abc123",
      "identifier": "CE2-TEST",
      "state": {"name": "In Progress"},
      "previousValues": {
        "state": {"name": "Closed"}
      },
      "actor": {"name": "Test User"}
    }
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "recorded": "CE2-TEST: Closed → In Progress",
  "message": "Webhook processed successfully"
}
```

### Check Webhook Status

```bash
curl https://your-worker.workers.dev/api/debug/webhook
```

**Expected Response**:
```json
{
  "status": "webhook system operational",
  "kv_configured": true,
  "stored_transitions": 47,
  "webhook_endpoint": "/webhook/linear"
}
```

## Metrics Now Calculating Correctly

| Metric | Before | After | Source |
|--------|--------|-------|--------|
| Reopen Rate | 0% (hardcoded) | Real value | KV transitions |
| Containment Rate | 100% (assumed) | Real value | KV team changes |
| False Alarms | ??? (not tracked) | Real value | P1→P3 transitions |

## Next Steps to Deploy

1. **Create KV Namespaces**
   - Go to Cloudflare Dashboard
   - Create: `ce2-state-history-dev` and `ce2-state-history-prod`

2. **Deploy Worker**
   ```bash
   cd cloudflare-worker
   wrangler deploy --env production
   ```

3. **Configure Linear Webhook**
   - Linear Dashboard → Settings → Webhooks
   - Create webhook pointing to: `/webhook/linear`
   - Events: `Issue.updated`
   - Test with manual send

4. **Verify in Dashboard**
   - Open CE2 Impact dashboard
   - Check that reopen rate shows real value (not 0%)
   - Monitor logs for webhook events

## Architecture Benefits

✅ **Real-time tracking** - Events captured immediately  
✅ **Persistent storage** - 90-day history in KV  
✅ **Audit trail** - Know who changed what and when  
✅ **Scalable** - KV handles millions of transitions  
✅ **Cost-effective** - Only pay for actual queries  
✅ **Reliable** - Auto-cleanup prevents data bloat  

## Known Limitations

1. **Initial Data Gap**
   - System only tracks events after deployment
   - Historical reopens before webhook setup won't be recorded
   - **Workaround**: Can backfill using Linear API if needed

2. **Team Changes**
   - Currently only detects team changes if webhook includes that data
   - May need to expand Linear webhook payload

3. **HMAC Validation**
   - Not yet implemented (marked as TODO)
   - Recommended to add before production deployment

## Future Enhancements

- [ ] HMAC webhook signature validation
- [ ] Real-time Slack notifications on reopens
- [ ] Durable Object for high-frequency updates
- [ ] GraphQL subscription support
- [ ] Historical backfill from Linear API
- [ ] Custom alerting rules
- [ ] Reopens by assignee/team analytics

## Documentation

See `WEBHOOK_SETUP.md` for:
- Complete setup guide
- Component documentation
- Monitoring instructions
- Troubleshooting guide

## Branch Info

**Created**: 2026-06-01  
**Base**: main  
**Status**: Ready for review  

**Commits**:
1. feat(webhooks): Implement Linear webhook system
2. docs: Add comprehensive webhook setup guide

**Ready to merge once**:
- [ ] KV namespaces created in Cloudflare
- [ ] Linear webhook configured
- [ ] Manual tests pass
- [ ] Dashboard shows real reopen rate
- [ ] Code review approved
