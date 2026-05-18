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

const PENDING_STATES = ['Triage', 'Planning', 'Backlog', 'In Progress', 'In Review', 'Blocked'];

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

async function fetchWorkerData(month) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const options = {
      hostname: 'localhost',
      port: 8787,
      path: '/api/metrics?month=' + month.name + '&filter=without_project',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data).issues);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function padRight(str, length) {
  return (str + '').padEnd(length);
}

async function compareData() {
  console.log('\n📊 COMPARACIÓN: LINEAR API vs CLOUDFLARE WORKER\n');
  console.log('Issues Sin Proyecto (CE1 + CE2)\n');

  for (const month of MONTHS) {
    try {
      const linearIssues = await fetchIssuesForMonth(month);
      const workerData = await fetchWorkerData(month);

      const byState = {};
      linearIssues.forEach(issue => {
        const state = issue.state.name;
        byState[state] = (byState[state] || 0) + 1;
      });

      const totalLinear = linearIssues.length;
      const inProgressLinear = (byState['In Progress'] || 0);
      const pendingLinear = linearIssues.filter(i => PENDING_STATES.includes(i.state.name)).length;
      const withoutLabelLinear = linearIssues.filter(i =>
        !i.labels.nodes.some(l => CUSTOMER_LABELS.includes(l.name))
      ).length;
      const closedLinear = (byState['Closed'] || 0);

      const totalWorker = workerData.total_issues;
      const inProgressWorker = workerData.active_issues;
      const withoutLabelWorker = workerData.untracked_issues;
      const closedWorker = workerData.closed;

      console.log('\n' + '═'.repeat(80));
      console.log(month.name.toUpperCase());
      console.log('═'.repeat(80));

      const metrics = [
        {
          label: 'TOTAL ISSUES',
          linear: totalLinear,
          worker: totalWorker,
          match: totalLinear === totalWorker ? '✅' : '❌'
        },
        {
          label: 'EN PROGRESO',
          linear: inProgressLinear,
          worker: inProgressWorker,
          match: inProgressLinear === inProgressWorker ? '✅' : '❌'
        },
        {
          label: 'PENDIENTES*',
          linear: pendingLinear,
          worker: workerData.pending_ce2,
          match: pendingLinear === workerData.pending_ce2 ? '✅' : '❌'
        },
        {
          label: 'SIN LABEL',
          linear: withoutLabelLinear,
          worker: withoutLabelWorker,
          match: withoutLabelLinear === withoutLabelWorker ? '✅' : '❌'
        },
        {
          label: 'CERRADOS',
          linear: closedLinear,
          worker: closedWorker,
          match: closedLinear === closedWorker ? '✅' : '❌'
        }
      ];

      console.log('\nMétrica           Linear API   Worker        Estado');
      console.log('─'.repeat(80));

      metrics.forEach(m => {
        const line = padRight(m.label, 18) + padRight(String(m.linear), 13) + padRight(String(m.worker), 14) + m.match;
        console.log(line);
      });

      console.log('\n* Pendientes = Triage + Planning + Backlog + In Progress + In Review + Blocked');

      console.log('\nDETALLE DE ESTADOS (Linear API):');
      console.log('─'.repeat(80));
      Object.entries(byState).sort((a, b) => b[1] - a[1]).forEach(([state, count]) => {
        const isPending = PENDING_STATES.includes(state);
        const tag = isPending ? '[PENDIENTE]' : '[CERRADO]';
        const line = '  ' + padRight(state, 18) + padRight(String(count), 5) + tag;
        console.log(line);
      });

      if (totalLinear !== totalWorker) {
        const diff = totalLinear - totalWorker;
        console.log('\n⚠️  DIFERENCIA EN TOTAL: Linear=' + totalLinear + ', Worker=' + totalWorker + ', Diferencia=' + diff);
        if (diff > 0) {
          const discardedCount = (byState['Discarded'] || 0);
          console.log('   → Posible causa: ' + discardedCount + ' issues Discarded (Worker los excluye)');
        }
      }

    } catch (error) {
      console.error('\n❌ Error en ' + month.name + ':', error.message);
    }
  }

  console.log('\n' + '═'.repeat(80) + '\n');
}

compareData().catch(console.error);
