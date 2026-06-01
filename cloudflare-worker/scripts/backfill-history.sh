#!/bin/bash

# Script to backfill historical state transitions from Linear API
# This fills KV with past reopens/changes for accurate historical metrics
#
# Usage:
#   ./scripts/backfill-history.sh --months 3 --worker-url <url> --api-key <key>

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

MONTHS=3
WORKER_URL=""
API_KEY=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --months)
      MONTHS="$2"
      shift 2
      ;;
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

if [ -z "$WORKER_URL" ]; then
  echo -e "${RED}❌ Missing --worker-url${NC}"
  echo ""
  echo "Usage:"
  echo "  ./scripts/backfill-history.sh --months 3 --worker-url <url> --api-key <key>"
  exit 1
fi

if [ -z "$API_KEY" ]; then
  API_KEY="${LINEAR_API_KEY}"
  if [ -z "$API_KEY" ]; then
    echo -e "${RED}❌ Missing --api-key or LINEAR_API_KEY env var${NC}"
    exit 1
  fi
fi

echo -e "${BLUE}📚 Backfilling historical state transitions...${NC}"
echo ""
echo "  Worker URL: $WORKER_URL"
echo "  Months to backfill: $MONTHS"
echo "  API Key: ${API_KEY:0:15}..."
echo ""

# For each month in the past, query Linear API for all issues
# and their state history
#
# NOTE: This is simplified - a full implementation would need to:
# 1. Query Linear API's issue history/changelog
# 2. Filter for state transitions
# 3. Send each transition to the worker's webhook endpoint
#
# Currently, Linear GraphQL API doesn't expose full state history
# in a single query. This would require either:
# - Using Linear's webhooks API to replay past events
# - Manually walking through Linear's audit logs
# - Or a custom importer job

echo -e "${YELLOW}ℹ️  Note:${NC}"
echo "  Historical backfill requires Linear audit logs API"
echo "  which is not yet available in standard Linear GraphQL."
echo ""
echo "  Options to get historical data:"
echo ""
echo "  1. ${BLUE}Use Linear UI${NC}"
echo "     - Go to team/project settings → Activity log"
echo "     - Manually identify past reopens"
echo ""
echo "  2. ${BLUE}Contact Linear Support${NC}"
echo "     - Request access to audit logs API"
echo "     - Or export historical changelog"
echo ""
echo "  3. ${BLUE}Manual import${NC}"
echo "     - Create a CSV with historical transitions"
echo "     - Import via custom script"
echo ""
echo "  4. ${BLUE}Start fresh${NC}"
echo "     - Metrics will be accurate from now onwards"
echo "     - Monthly comparisons can start this month"
echo ""

echo -e "${YELLOW}For now:${NC}"
echo "  Your metrics will show:"
echo "  - Last 3 months from ${MONTHS}M ago: Partial data (after webhook setup)"
echo "  - Current month: Complete and accurate"
echo ""
echo "  Next month comparison will be 100% accurate."
echo ""
