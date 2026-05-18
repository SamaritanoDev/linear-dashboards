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

const MONTHS = [
  { name: 'Enero', start: '2026-01-01T00:00:00Z', end: '2026-02-01T00:00:00Z' },
  { name: 'Febrero', start: '2026-02-01T00:00:00Z', end: '2026-03-01T00:00:00Z' },
  { name: 'Marzo', start: '2026-03-01T00:00:00Z', end: '2026-04-01T00:00:00Z' },
  { name: 'Abril', start: '2026-04-01T00:00:00Z', end: '2026-05-01T00:00:00Z' },
  { name: 'Mayo', start: '2026-05-01T00:00:00Z', end: '2026-06-01T00:00:00Z' }
];

const CUSTOMER_LABELS = [
  "Cuy", "Guinea", "Habla+", "Wings", "PeruSim+", "Fimo", "Airalo",
  "B2B", "Finanzas", "Legales", "Partner"
];

async function fetchIssuesForMonth(month) {
  return new Promise((resolve, reject) => {
    const query = `
    {
      issues(
        first: 250
        filter: {
          team: {key: {in: ["CE1", "CE2"]}}
          createdAt: {gte: "${month.start}", lt: "${month.end}"}
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
  console.log(`\n📋 Issues SIN Customer Labels (todos los meses)\n`);

  for (const month of MONTHS) {
    try {
      const allIssues = await fetchIssuesForMonth(month);
      
      const validIssues = allIssues.filter(i => {
        if (i.state.name === 'Discarded') return false;
        const labels = i.labels.nodes.map(l => l.name);
        if (labels.includes('Duplicado')) return false;
        return !labels.some(l => CUSTOMER_LABELS.includes(l));
      });

      if (validIssues.length === 0) continue;

      console.log(`\n${'═'.repeat(120)}`);
      console.log(`${month.name.toUpperCase()} - ${validIssues.length} issues sin customer labels`);
      console.log(`${'═'.repeat(120)}`);

      validIssues.forEach((issue, idx) => {
        const labels = issue.labels.nodes.map(l => l.name).join(', ') || 'Sin labels';
        console.log(`\n${idx + 1}. ${issue.identifier}: ${issue.title}`);
        console.log(`   Labels: ${labels}`);
        if (issue.description) {
          const descShort = issue.description.substring(0, 120).replace(/\n/g, ' ').trim();
          console.log(`   Desc: ${descShort}${issue.description.length > 120 ? '...' : ''}`);
        }
        console.log(`   URL: https://linear.app/guinea/issue/${issue.identifier}`);
      });

    } catch (error) {
      console.error(`\n❌ Error en ${month.name}:`, error.message);
    }
  }

  console.log(`\n${'═'.repeat(120)}\n`);
}

main();
