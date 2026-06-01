# CE2 Webhook System - Setup Guide

## Overview

This system uses Linear API webhooks to track state transitions and calculate accurate CE2 metrics, specifically for detecting:
- **Reopened issues** (Closed → In Progress)
- **False alarm downgrades** (Priority 1 → Priority 3)
- **Team escalations** (detecting when issues move between teams)

## Architecture

```
Linear API
    ↓ (webhook event)
POST /webhook/linear (Cloudflare Worker)
    ↓ (parse & validate)
LinearWebhookHandler
    ↓ (record transition)
StateHistoryService
    ↓ (write to KV)
Cloudflare KV (CE2_HISTORY)
    ↓ (query on demand)
CE2MetricsService.calculateReopenRate()
CE2MetricsService.calculateContainmentRate()
```

## Components

### 1. StateHistoryService (`src/services/state-history.ts`)

Manages persistence of state transitions in Cloudflare KV.

**Key Methods:**
- `recordTransition(transition)` - Stores a state/priority/team change
- `wasReopened(issueId)` - Checks if issue was reopened
- `getIssueHistory(issueId)` - Retrieves all transitions for an issue
- `getReopenedsInPeriod(startDate, endDate)` - Finds reopens in a time range
- `hadTeamChange(issueId)` - Checks if issue was escalated to another team
- `getIssueStats(issueId)` - Gets comprehensive stats for an issue

**Data Structure:**

```typescript
StateTransition {
  issueId: string;           // "..." UUID
  issueIdentifier: string;   // "CE2-1590"
  fromState: string;         // "Closed"
  toState: string;           // "In Progress"
  changedAt: string;         // ISO 8601 timestamp
  changedBy?: string;        // "John Doe" (actor name)
  timestamp: number;         // Unix timestamp
}
```

**KV Storage:**
- Key format: `transition:{issueId}:{timestamp}`
- TTL: 90 days
- Sample key: `transition:abc123:1717242000`

### 2. LinearWebhookHandler (`src/linear/webhook-handler.ts`)

Processes incoming webhook events from Linear API.

**Supported Events:**
- `Issue.updated` with state change
- `Issue.updated` with priority change

**State Transitions Detected:**
- Closed → In Progress (reopen)
- Closed → In Review (reopen)
- Done → In Progress (reopen)
- Done → In Review (reopen)

**Priority Changes:**
- P1 → P3 (false alarm downgrade)
- Any priority change is recorded

### 3. Webhook Endpoint

**POST /webhook/linear**

Receives Linear webhook events.

**Expected Payload:**
```json
{
  "action": "Issue.updated",
  "createdAt": "2026-06-01T14:30:00Z",
  "data": {
    "id": "abc123",
    "identifier": "CE2-1590",
    "title": "MODEM plan issue",
    "state": {"name": "In Progress"},
    "priority": 1,
    "previousValues": {
      "state": {"name": "Closed"},
      "priority": 1
    },
    "actor": {
      "name": "John Doe",
      "email": "john@company.com"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "recorded": "CE2-1590: Closed → In Progress",
  "message": "Webhook processed successfully"
}
```

## Setup Instructions

### 1. Create KV Namespaces

Create two KV namespaces in Cloudflare:
- `ce2-state-history-dev` (for development)
- `ce2-state-history-prod` (for production)

Visit: https://dash.cloudflare.com → Workers & Pages → KV

### 2. Configure wrangler.toml

Already configured! The file has:
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

### 3. Deploy Worker

```bash
cd cloudflare-worker
npm run build
wrangler deploy
```

### 4. Configure Linear Webhook

In Linear Dashboard → Settings → Webhooks:

1. Create New Webhook
2. **URL**: `https://your-worker-domain.workers.dev/webhook/linear`
3. **Events**: Select:
   - Issue.updated
4. **Test**: Send test event

### 5. Verify Setup

Test the webhook endpoint:

```bash
# Check webhook status
curl https://your-worker-domain.workers.dev/api/debug/webhook

# Response:
{
  "status": "webhook system operational",
  "kv_configured": true,
  "stored_transitions": 47,
  "webhook_endpoint": "/webhook/linear",
  "setup_instructions": {
    "linear_webhook_url": "https://your-worker.workers.dev/webhook/linear",
    "method": "POST",
    "expected_content_type": "application/json"
  }
}
```

## How Metrics Use Webhook Data

### Reopen Rate Calculation

**Before (without webhooks):**
```
Reopen Rate = 0% (hardcoded)
```

**After (with webhooks):**
```
1. Get all P1/P2 issues for the period
2. For each issue, query KV: wasReopened(issueId)
3. Count how many were reopened
4. Calculate: reopened_count / total_p1p2 × 100
```

**Example:**
```
Total P1/P2 issues: 40
Reopened issues: 3 (CE2-456, CE2-789, CE2-234)
Reopen Rate = 3 / 40 × 100 = 7.5%
```

### False Alarm Detection (Noise Reduction)

**Tracked via priority downgrades:**
```
1. Get all issues originally reported as P1
2. For each, check if priority changed P1 → P3
3. Count those that were downgraded
4. Calculate: downgraded_count / total_p1 × 100
```

### Containment Rate Calculation

**Tracked via team changes:**
```
1. Get all P1/P2 issues
2. For each, check if team changed (escalation detected)
3. Count issues with NO team changes
4. Calculate: contained / total × 100
```

## Monitoring

### Check Webhook Events

```bash
# View recent transitions stored in KV
curl 'https://your-worker.workers.dev/api/debug/webhook'
```

### Monitor Logs

Logs appear in Cloudflare Workers dashboard:

```
[Webhook] Received event: Issue.updated for CE2-1590
[Webhook] 🔄 REOPEN DETECTED: CE2-1590 was reopened!
[StateHistory] Recorded transition: CE2-1590 Closed → In Progress
[StateHistory] Cleaned up 23 old transitions
```

### Test Webhook Manually

```bash
curl -X POST https://your-worker.workers.dev/webhook/linear \
  -H "Content-Type: application/json" \
  -d '{
    "action": "Issue.updated",
    "createdAt": "2026-06-01T14:30:00Z",
    "data": {
      "id": "test123",
      "identifier": "CE2-TEST",
      "state": {"name": "In Progress"},
      "priority": 1,
      "previousValues": {
        "state": {"name": "Closed"},
        "priority": 1
      },
      "actor": {"name": "Test User"}
    }
  }'
```

## Data Retention

- **Transitions**: 90 days (auto-delete)
- **Issue Indices**: 180 days (auto-delete)

Cleanup runs automatically when new transitions are recorded.

## Troubleshooting

### Webhook not firing

1. Check Linear webhook settings:
   - Verify URL is correct
   - Verify events are selected (Issue.updated)
   - Test with manual send

2. Check Cloudflare logs:
   ```bash
   wrangler tail
   ```

3. Verify KV is accessible:
   ```bash
   wrangler kv:namespace list
   ```

### Reopens not showing in metrics

1. Verify webhook received the event:
   ```bash
   curl https://your-worker.workers.dev/api/debug/webhook
   ```

2. Check the state transition was recorded:
   - Look for "REOPEN DETECTED" in logs
   - Check `stored_transitions` count increased

3. Verify metrics are querying KV:
   - `calculateReopenRate` should call `wasReopened()`
   - Not returning hardcoded 0%

### KV is empty

1. No events have been received since deployment
   - Test with manual webhook event
   - Check Linear webhook is configured correctly

2. Events are being processed but not stored
   - Check Cloudflare Worker logs for errors
   - Verify KV namespace binding is correct in `wrangler.toml`

## Future Enhancements

1. **Real-time Dashboard**: Show reopens as they happen
2. **Slack Alerts**: Notify on critical reopens
3. **Analytics**: Track trend of reopens over time
4. **Custom Rules**: Flag reopens by assignee or component
5. **GraphQL Subscriptions**: Replace polling with push updates

## References

- [Linear API Webhooks](https://linear.app/docs/graphql/webhooks)
- [Cloudflare KV Docs](https://developers.cloudflare.com/workers/runtime-apis/kv/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
