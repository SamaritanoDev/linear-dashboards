#!/bin/bash

# Script to create Linear webhook for CE2 metrics
#
# Usage:
#   ./scripts/create-webhook.sh \
#     --worker-url https://your-worker.workers.dev \
#     --api-key lin_api_xxxxx

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
WORKER_URL=""
API_KEY=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --worker-url)
      WORKER_URL="$2"
      shift 2
      ;;
    --api-key)
      API_KEY="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Validate inputs
if [ -z "$WORKER_URL" ]; then
  echo -e "${RED}❌ Missing --worker-url${NC}"
  echo ""
  echo "Usage:"
  echo "  ./scripts/create-webhook.sh \\"
  echo "    --worker-url https://your-worker.workers.dev \\"
  echo "    --api-key lin_api_xxxxx"
  exit 1
fi

if [ -z "$API_KEY" ]; then
  echo -e "${RED}❌ Missing --api-key${NC}"
  exit 1
fi

WEBHOOK_URL="${WORKER_URL}/webhook/linear"

echo -e "${BLUE}🔗 Creating Linear webhook...${NC}"
echo ""
echo "  Worker URL: $WORKER_URL"
echo "  Webhook URL: $WEBHOOK_URL"
echo "  Events: Issue.updated"
echo ""

# GraphQL mutation to create webhook
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

# Replace placeholder
MUTATION="${MUTATION//WEBHOOK_URL_PLACEHOLDER/$WEBHOOK_URL}"

# Send request to Linear API
RESPONSE=$(curl -s \
  -X POST https://api.linear.app/graphql \
  -H "Authorization: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $(echo "$MUTATION" | jq -Rs .)}")

# Parse response
SUCCESS=$(echo "$RESPONSE" | jq -r '.data.webhookCreate.success // false')
WEBHOOK_ID=$(echo "$RESPONSE" | jq -r '.data.webhookCreate.webhook.id // empty')
WEBHOOK_LABEL=$(echo "$RESPONSE" | jq -r '.data.webhookCreate.webhook.label // empty')
WEBHOOK_ENABLED=$(echo "$RESPONSE" | jq -r '.data.webhookCreate.webhook.enabled // false')
ERROR=$(echo "$RESPONSE" | jq -r '.errors[0].message // empty')

# Check if successful
if [ "$SUCCESS" == "true" ] && [ -n "$WEBHOOK_ID" ]; then
  echo -e "${GREEN}✅ Webhook created successfully!${NC}"
  echo ""
  echo -e "${GREEN}Webhook Details:${NC}"
  echo "  ID:      $WEBHOOK_ID"
  echo "  Label:   $WEBHOOK_LABEL"
  echo "  URL:     $WEBHOOK_URL"
  echo "  Enabled: $WEBHOOK_ENABLED"
  echo ""
  echo -e "${GREEN}🎉 Webhook is now active!${NC}"
  echo ""
  echo -e "${YELLOW}Next steps:${NC}"
  echo "  1. Deploy worker: ${BLUE}wrangler deploy --env production${NC}"
  echo "  2. Make changes to issues in Linear"
  echo "  3. Check logs: ${BLUE}wrangler tail --env production${NC}"
  echo "  4. View metrics on dashboard"
  echo ""
else
  echo -e "${RED}❌ Failed to create webhook${NC}"
  if [ -n "$ERROR" ]; then
    echo -e "${RED}Error: $ERROR${NC}"
  else
    echo -e "${RED}Response:${NC}"
    echo "$RESPONSE" | jq '.'
  fi
  exit 1
fi
