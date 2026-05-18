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

async function validateAllMonths() {
  console.log('\n📊 Validación de Issues Sin Proyecto (CE1 + CE2)\n');
  
  for (const month of MONTHS) {
    try {
      const issues = await fetchIssuesForMonth(month);
      
      // Conteos por estado
      const byState = {};
      issues.forEach(issue => {
        const state = issue.state.name;
        byState[state] = (byState[state] || 0) + 1;
      });

      // Conteo de pendientes (excluyendo Closed y Discarded)
      const pendingStates = ['Triage', 'Planning', 'Backlog', 'In Progress', 'In Review', 'Blocked'];
      const pendingIssues = issues.filter(i => pendingStates.includes(i.state.name));

      // Issues sin label de producto
      const withoutLabels = issues.filter(i => 
        !i.labels.nodes.some(l => CUSTOMER_LABELS.includes(l.name))
      );

      // Issues por equipo
      const byTeam = {};
      issues.forEach(issue => {
        const team = issue.identifier.split('-')[0];
        byTeam[team] = (byTeam[team] || 0) + 1;
      });

      console.log(`\n${month.name.toUpperCase()}`);
      console.log('═'.repeat(50));
      console.log(`Total issues: ${issues.length}`);
      console.log(`Pendientes: ${pendingIssues.length}`);
      console.log(`Sin label: ${withoutLabels.length}`);
      console.log(`\nPor Estado:`);
      Object.entries(byState).sort().forEach(([state, count]) => {
        console.log(`  ${state}: ${count}`);
      });
      console.log(`\nPor Equipo:`);
      Object.entries(byTeam).forEach(([team, count]) => {
        console.log(`  ${team}: ${count}`);
      });

    } catch (error) {
      console.error(`\n❌ Error en ${month.name}:`, error.message);
    }
  }
}

validateAllMonths().catch(console.error);
