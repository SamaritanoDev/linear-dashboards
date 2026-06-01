/**
 * Script para crear el webhook en Linear API
 *
 * Uso:
 *   npx ts-node scripts/create-webhook.ts \
 *     --worker-url https://your-worker.workers.dev \
 *     --api-key your-linear-api-key
 */

import { GraphQLClient, gql } from "graphql-request";

interface CreateWebhookInput {
  label: string;
  url: string;
  allPublicTeams: boolean;
  resourceTypes: string[];
  enabled: boolean;
}

interface WebhookResponse {
  webhookCreate: {
    success: boolean;
    webhook?: {
      id: string;
      label: string;
      url: string;
      enabled: boolean;
    };
  };
}

const CREATE_WEBHOOK_MUTATION = gql`
  mutation CreateWebhook($input: CreateWebhookInput!) {
    webhookCreate(input: $input) {
      success
      webhook {
        id
        label
        url
        enabled
      }
    }
  }
`;

async function createLinearWebhook() {
  // Parse arguments
  const args = process.argv.slice(2);
  const workerUrl = args[args.indexOf("--worker-url") + 1];
  const apiKey = args[args.indexOf("--api-key") + 1];

  if (!workerUrl) {
    console.error("❌ Missing --worker-url");
    console.log("\nUsage:");
    console.log("  npx ts-node scripts/create-webhook.ts \\");
    console.log("    --worker-url https://your-worker.workers.dev \\");
    console.log("    --api-key your-linear-api-key");
    process.exit(1);
  }

  if (!apiKey) {
    console.error("❌ Missing --api-key");
    process.exit(1);
  }

  try {
    console.log("🔗 Connecting to Linear API...");

    const client = new GraphQLClient("https://api.linear.app/graphql", {
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
    });

    const webhookUrl = `${workerUrl}/webhook/linear`;

    console.log(`📝 Creating webhook...`);
    console.log(`   URL: ${webhookUrl}`);
    console.log(`   Events: Issue.updated`);

    const variables = {
      input: {
        label: "CE2 Metrics - State History",
        url: webhookUrl,
        allPublicTeams: true,
        resourceTypes: ["Issue"],
        enabled: true,
      } as CreateWebhookInput,
    };

    const response = await client.request<WebhookResponse>(
      CREATE_WEBHOOK_MUTATION,
      variables
    );

    if (response.webhookCreate.success && response.webhookCreate.webhook) {
      const webhook = response.webhookCreate.webhook;
      console.log("\n✅ Webhook created successfully!\n");
      console.log(`   ID: ${webhook.id}`);
      console.log(`   Label: ${webhook.label}`);
      console.log(`   URL: ${webhook.url}`);
      console.log(`   Enabled: ${webhook.enabled}`);
      console.log("\n🎉 Webhook is now active and receiving events!");
      console.log("\n📊 Next steps:");
      console.log("   1. Make a change to an issue in Linear");
      console.log("   2. Check worker logs: wrangler tail");
      console.log("   3. View metrics: https://your-dashboard.com/ce2-impact");
    } else {
      console.error("\n❌ Failed to create webhook");
      console.error(JSON.stringify(response, null, 2));
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error("\n❌ Error:", error.message);
      if ("response" in error) {
        console.error("\nResponse:", (error as any).response);
      }
    } else {
      console.error("\n❌ Unknown error:", error);
    }
    process.exit(1);
  }
}

createLinearWebhook();
