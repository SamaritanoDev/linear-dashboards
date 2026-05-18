#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

const apiKey = process.env.LINEAR_API_KEY ||
  fs.readFileSync('.env.local', 'utf8').match(/LINEAR_API_KEY=(.+)/)?.[1] ||
  fs.readFileSync('cloudflare-worker/.env', 'utf8').match(/LINEAR_API_KEY=(.+)/)?.[1];

if (!apiKey) {
  console.error('LINEAR_API_KEY not found');
  process.exit(1);
}

const CUSTOMER_LABELS = [
  "Cuy", "Guinea", "Habla+", "Wings", "PeruSim+", "Fimo", "Airalo",
  "B2B", "Finanzas", "Legales", "Partner"
];

async function fetchIssuesForMonth() {
  return new Promise((resolve, reject) => {
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
          id
          identifier
          title
          description
          state {name}
          labels(first: 20) {
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
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          if (result.errors) {
            reject(new Error(result.errors[0].message));
            return;
          }
          resolve(result.data.issues.nodes);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  try {
    const issues = await fetchIssuesForMonth();
    
    // Filtrar issues sin customer labels
    const issuesWithoutLabels = issues.filter(i => {
      const labels = i.labels.nodes.map(l => l.name);
      return !labels.some(l => CUSTOMER_LABELS.includes(l));
    });

    console.log(`\n📋 Issues de Enero sin Customer Labels (${issuesWithoutLabels.length} total)\n`);
    console.log('═'.repeat(100));

    issuesWithoutLabels.forEach((issue, idx) => {
      const labels = issue.labels.nodes.map(l => l.name).join(', ') || 'Sin labels';
      console.log(`\n${idx + 1}. ${issue.identifier}: ${issue.title}`);
      console.log(`   Estado: ${issue.state.name}`);
      console.log(`   Labels actuales: ${labels}`);
      if (issue.description) {
        const descShort = issue.description.substring(0, 150).replace(/\n/g, ' ');
        console.log(`   Descripción: ${descShort}...`);
      }
      console.log(`   URL: https://linear.app/guinea/issue/${issue.identifier}`);
    });

    console.log('\n' + '═'.repeat(100));
    console.log(`\nTotal issues sin customer labels: ${issuesWithoutLabels.length}`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
