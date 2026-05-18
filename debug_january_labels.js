#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

const apiKey = process.env.LINEAR_API_KEY ||
  fs.readFileSync('.env.local', 'utf8').match(/LINEAR_API_KEY=(.+)/)?.[1];

if (!apiKey) {
  console.error('LINEAR_API_KEY not found');
  process.exit(1);
}

const query = `
{
  issues(
    first: 250
    filter: {
      team: {key: {in: ["CE1", "CE2"]}}
      createdAt: {gte: "2026-01-01T00:00:00Z", lt: "2026-02-01T00:00:00Z"}
      project: {null: true}
    }
  ) {
    nodes {
      identifier
      title
      state {name}
      labels(first: 10) {
        nodes {name}
      }
    }
  }
}
`;

const data = JSON.stringify({ query });
const options = {
  hostname: 'api.linear.app',
  port: 443,
  path: '/graphql',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'Authorization': apiKey
  }
};

const req = https.request(options, (res) => {
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    const result = JSON.parse(responseData);
    if (result.errors) {
      console.error('GraphQL Error:', result.errors);
      process.exit(1);
    }

    const CUSTOMER_LABELS = [
      "Cuy", "Guinea", "Habla+", "Wings", "PeruSim+", "Fimo", "Airalo",
      "B2B", "Finanzas", "Legales", "Partner"
    ];

    const issues = result.data.issues.nodes;

    const withLabels = issues.filter(i => {
      const labels = i.labels.nodes.map(l => l.name);
      return labels.some(l => CUSTOMER_LABELS.includes(l));
    });

    const withoutLabels = issues.filter(i => {
      const labels = i.labels.nodes.map(l => l.name);
      return !labels.some(l => CUSTOMER_LABELS.includes(l));
    });

    console.log(`\n📊 January 2026 - Label Analysis\n`);
    console.log(`Total issues: ${issues.length}`);
    console.log(`- With product labels: ${withLabels.length}`);
    console.log(`- Without product labels: ${withoutLabels.length}`);

    console.log(`\n✅ Issues WITH product labels (${withLabels.length}):`);
    withLabels.forEach(i => {
      const labels = i.labels.nodes.map(l => l.name).join(', ');
      console.log(`  ${i.identifier}: [${i.state.name}] ${i.title}`);
      console.log(`    Labels: ${labels}`);
    });

    console.log(`\n❌ Issues WITHOUT product labels (${withoutLabels.length}):`);
    withoutLabels.forEach(i => {
      console.log(`  ${i.identifier}: [${i.state.name}] ${i.title}`);
      console.log(`    Labels: None`);
    });
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
  process.exit(1);
});

req.write(data);
req.end();
