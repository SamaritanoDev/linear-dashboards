#!/bin/bash

# Script to setup Linear webhook automatically
# Reads API key from environment variables (GitHub secrets)
#
# Usage:
#   ./scripts/setup-webhook.sh <worker-url>
#   OR
#   LINEAR_API_KEY=<key> ./scripts/setup-webhook.sh <worker-url>

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

WORKER_URL="$1"

# Validate worker URL
if [ -z "$WORKER_URL" ]; then
  echo -e "${RED}❌ Worker URL required${NC}"
  echo ""
  echo "Usage:"
  echo "  ./scripts/setup-webhook.sh https://your-worker.workers.dev"
  echo ""
  echo "Or with explicit API key:"
  echo "  LINEAR_API_KEY=lin_api_xxx ./scripts/setup-webhook.sh https://your-worker.workers.dev"
  exit 1
fi

# Get API key from environment (GitHub secrets set this)
API_KEY="${LINEAR_API_KEY}"

if [ -z "$API_KEY" ]; then
  echo -e "${RED}❌ LINEAR_API_KEY not found in environment${NC}"
  echo ""
  echo "This should come from GitHub secrets."
  echo "Make sure it's configured in: Settings → Secrets and variables → Actions"
  echo ""
  echo "Or set it manually:"
  echo "  export LINEAR_API_KEY=lin_api_xxxxx"
  echo "  ./scripts/setup-webhook.sh https://your-worker.workers.dev"
  exit 1
fi

WEBHOOK_URL="${WORKER_URL}/webhook/linear"

echo -e "${BLUE}🔗 Setting up Linear webhook...${NC}"
echo ""
echo "  Worker URL: $WORKER_URL"
echo "  Webhook URL: $WEBHOOK_URL"
echo "  API Key: ${API_KEY:0:15}... (from environment)"
echo ""

# GraphQL mutation
read -r -d '' MUTATION << 'EOF' || true
mutation {
  webhookCreate(input: {
    label: "CE2 Metrics - State History"
    url: "WEBHOOK_URL_PLACEHOLDER"
    allPublicTeams: true
    resourceTypes: [Issue]
    enabled: true
  }) {
    success
    webhook {
      id
      label
      url
      enabled
    }
  }
}
EOF

MUTATION="${MUTATION//WEBHOOK_URL_PLACEHOLDER/$WEBHOOK_URL}"

# Send to Linear API
RESPONSE=$(curl -s \
  -X POST https://api.linear.app/graphql \
  -H "Authorization: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $(echo "$MUTATION" | jq -Rs .)}")

# Parse response
SUCCESS=$(echo "$RESPONSE" | jq -r '.data.webhookCreate.success // false')
WEBHOOK_ID=$(echo "$RESPONSE" | jq -r '.data.webhookCreate.webhook.id // empty')
WEBHOOK_LABEL=$(echo "$RESPONSE" | jq -r '.data.webhookCreate.webhook.label // empty')
ERROR=$(echo "$RESPONSE" | jq -r '.errors[0].message // empty')

# Check result
if [ "$SUCCESS" == "true" ] && [ -n "$WEBHOOK_ID" ]; then
  echo -e "${GREEN}✅ Webhook created successfully!${NC}"
  echo ""
  echo -e "${GREEN}Details:${NC}"
  echo "  ID:    $WEBHOOK_ID"
  echo "  Label: $WEBHOOK_LABEL"
  echo "  URL:   $WEBHOOK_URL"
  echo ""
  echo -e "${GREEN}🎉 Ready to track metrics!${NC}"
  echo ""
  echo -e "${YELLOW}Next:${NC}"
  echo "  1. Make a change to a P1/P2 issue in Linear"
  echo "  2. Check webhook received event: wrangler tail"
  echo "  3. View metrics on dashboard"
  echo ""
else
  echo -e "${RED}❌ Failed to create webhook${NC}"
  if [ -n "$ERROR" ]; then
    echo -e "${RED}Error: $ERROR${NC}"
  else
    echo -e "${RED}Full response:${NC}"
    echo "$RESPONSE" | jq '.'
  fi
  exit 1
fi
