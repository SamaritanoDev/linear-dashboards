# Linear Webhook Configuration - Quick Start

## Prerequisites

✅ Worker deployed: `wrangler deploy --env production`  
✅ KV namespaces created:
  - `ce2-state-history-prod`
  - `ce2-state-history-dev`

## Step 1: Get Your Webhook URL

After deploying your worker, you'll have a URL like:

```
https://linear-api-worker.your-account.workers.dev/webhook/linear
```

If you don't know it, run:

```bash
wrangler deployments list
```

Look for the recent deployment and note the URL.

## Step 2: Open Linear Settings

1. Go to: https://linear.app/[workspace]/settings
2. Click: **Webhooks** (in left sidebar under "Developer")
3. Click: **Create webhook**

## Step 3: Configure Webhook

Fill in the form:

| Field | Value |
|-------|-------|
| **URL** | `https://your-worker.workers.dev/webhook/linear` |
| **Events** | Check: `Issue.updated` |
| **Name** | `CE2 Metrics - State History` |
| **Description** | `Track state transitions for accurate metrics` |

### Visual Guide

```
┌─────────────────────────────────────────┐
│ Create Webhook                           │
├─────────────────────────────────────────┤
│                                         │
│ Webhook URL *                           │
│ ┌──────────────────────────────────────┐ │
│ │ https://your-worker.workers.dev/   │ │
│ │ webhook/linear                       │ │
│ └──────────────────────────────────────┘ │
│                                         │
│ Events *                                │
│ ☑️ Issue.updated                        │
│ ☐ Issue.created                        │
│ ☐ Cycle.updated                        │
│ ☐ Project.updated                      │
│                                         │
│ Name                                    │
│ ┌──────────────────────────────────────┐ │
│ │ CE2 Metrics - State History          │ │
│ └──────────────────────────────────────┘ │
│                                         │
│ Description                             │
│ ┌──────────────────────────────────────┐ │
│ │ Track state transitions for accurate │ │
│ │ metrics calculation                  │ │
│ └──────────────────────────────────────┘ │
│                                         │
│ [Cancel]                    [Create]    │
└─────────────────────────────────────────┘
```

## Step 4: Test the Webhook

Linear provides a test button!

1. Click **Send test event** (or similar button)
2. You should see a response like:

```
Status: 200 OK
Response body:
{
  "success": true,
  "recorded": "CE2-TEST: Closed → In Progress",
  "message": "Webhook processed successfully"
}
```

If you don't see 200 OK:
- Check worker deployment
- Verify URL is correct
- Check Cloudflare logs: `wrangler tail`

## Step 5: Verify It's Working

### Check Dashboard Metrics

1. Open: https://dashboard.company.com/ce2-impact
2. Click: Month selector (e.g., "Mayo")
3. Look at: **Reopen Rate** (Tasa de Reapertura)
4. Should show: **Real number** (not 0%)

### Check Webhook Status

```bash
curl https://your-worker.workers.dev/api/debug/webhook
```

Expected response (example):
```json
{
  "status": "webhook system operational",
  "kv_configured": true,
  "stored_transitions": 47,
  "webhook_endpoint": "/webhook/linear",
  "setup_instructions": {
    "linear_webhook_url": "https://your-worker.workers.dev/webhook/linear",
    "method": "POST"
  }
}
```

The `stored_transitions: 47` means the webhook received 47 events.

### Manually Test Webhook

```bash
# Send test event to your worker
curl -X POST https://your-worker.workers.dev/webhook/linear \
  -H "Content-Type: application/json" \
  -d '{
    "action": "Issue.updated",
    "createdAt": "2026-06-01T14:30:00Z",
    "data": {
      "id": "test-123",
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

Expected response:
```json
{
  "success": true,
  "recorded": "CE2-TEST: Closed → In Progress",
  "message": "Webhook processed successfully"
}
```

## Step 6: Monitor Real Events

Watch your worker logs:

```bash
wrangler tail --env production
```

You should see events like:

```
[Webhook] Received event: Issue.updated for CE2-1590
[Webhook] 🔄 REOPEN DETECTED: CE2-1590 was reopened!
[StateHistory] Recorded transition: CE2-1590 Closed → In Progress
```

## What Gets Tracked

### State Transitions
```
✅ Closed → In Progress (REOPEN)
✅ Closed → In Review (REOPEN)
✅ In Progress → Closed
✅ In Review → Closed
✅ Done → In Progress (REOPEN)
✅ [Any other state change]
```

### Priority Changes
```
✅ P1 → P2 (DOWNGRADE)
✅ P1 → P3 (FALSE ALARM)
✅ P2 → P3 (FALSE ALARM)
✅ P3 → P1 (UPGRADE)
```

### What's Recorded
- **Issue ID** and **Identifier** (CE2-1590)
- **From state** (e.g., "Closed")
- **To state** (e.g., "In Progress")
- **Changed at** (ISO timestamp)
- **Changed by** (who made the change)
- **Timestamp** (Unix time)

## Troubleshooting

### "Webhook failed: Connection timeout"

- Check worker is deployed: `wrangler publish --env production`
- Check URL is correct (no typos)
- Check worker logs: `wrangler tail`

### "Success 200 but no data in dashboard"

- Test webhook is sending events
- Check KV namespace exists and binding is correct
- Verify `wrangler.toml` has CE2_HISTORY configured
- Try: `curl https://your-worker.workers.dev/api/debug/webhook`

### "Stored transitions is 0"

- Events are being received but not saved
- Check KV permissions in worker settings
- Check wrangler.toml has correct namespace IDs
- Look for errors in: `wrangler tail --env production`

### "Reopen rate still shows 0%"

- Webhook is working but metrics not using it
- Verify `calculateReopenRate` is async
- Check it's calling `wasReopened()`
- Rebuild and redeploy: `wrangler deploy`

## Testing Checklist

- [ ] URL configured in Linear settings
- [ ] `Issue.updated` event selected
- [ ] Test event returns 200 OK
- [ ] Dashboard shows real reopen rate (not 0%)
- [ ] `wrangler tail` shows [Webhook] logs
- [ ] `/api/debug/webhook` shows stored_transitions > 0
- [ ] Manual test returns success response

## Next Steps

1. ✅ Configure webhook (you are here)
2. ⏭️ Wait for real issues to be reopened/changed
3. ⏭️ Metrics will automatically reflect real data
4. ⏭️ Monitor dashboard and logs for anomalies
5. ⏭️ Set up Slack alerts (optional future enhancement)

## Need Help?

Check the detailed guide: [`WEBHOOK_SETUP.md`](./WEBHOOK_SETUP.md)

Or review the implementation: [`WEBHOOK_IMPLEMENTATION.md`](./WEBHOOK_IMPLEMENTATION.md)
