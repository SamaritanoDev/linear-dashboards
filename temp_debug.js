#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

// Get API key from environment or .env
const apiKey = process.env.LINEAR_API_KEY ||
  fs.readFileSync('.env.local', 'utf8').match(/LINEAR_API_KEY=(.+)/)?.[1];

if (!apiKey) {
  console.error('LINEAR_API_KEY not found. Set it in .env.local or environment');
  process.exit(1);
}

const query = `
{
  issues(
    first: 250
    filter: {
      team: {key: {in: ["CE1", "CE2"]}}
      createdAt: {gte: "2026-01-01T00:00:00Z", lt: "2026-02-01T00:00:00Z"}
      
    }
  ) {
    nodes {
      id
      identifier
      title
      state {name}
      priority
      createdAt
      startedAt
      completedAt
      assignee {name}
      team {key}
      project {id}
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

    const issues = result.data.issues.nodes;
    console.log(`\n📊 January 2026 Issues Report`);
    console.log(`Total issues returned: ${issues.length}\n`);

    // Group by state
    const byState = {};
    issues.forEach(issue => {
      const state = issue.state.name;
      if (!byState[state]) byState[state] = [];
      byState[state].push(issue);
    });

    // Print summary
    Object.keys(byState).sort().forEach(state => {
      console.log(`${state}: ${byState[state].length}`);
    });

    // Identify pending (not Closed or Discarded)
    const PENDING_STATES = ['Triage', 'Planning', 'Backlog', 'In Progress', 'In Review', 'Blocked'];
    const pending = issues.filter(i => PENDING_STATES.includes(i.state.name));

    console.log(`\n✅ Pending issues (${pending.length}):`);
    if (pending.length > 0) {
      pending.forEach(issue => {
        console.log(`  - ${issue.identifier}: ${issue.title}`);
        console.log(`    State: ${issue.state.name}, Team: ${issue.team.key}, Assignee: ${issue.assignee?.name || 'Unassigned'}`);
      });
    } else {
      console.log('  (None)');
    }

    // Show all issues with their states
    console.log(`\n📋 All Issues:`);
    issues.forEach((issue, idx) => {
      const isPending = PENDING_STATES.includes(issue.state.name) ? '✓' : '✗';
      console.log(`${idx + 1}. [${isPending}] ${issue.identifier}: ${issue.title} (${issue.state.name})`);
    });
  });
});

req.on('error', (error) => {
  console.error('Request error:', error);
  process.exit(1);
});

req.write(data);
req.end();
