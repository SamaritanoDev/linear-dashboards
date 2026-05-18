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

function deduceLabel(title, description) {
  const text = (title + ' ' + (description || '')).toLowerCase();
  
  const patterns = {
    'Cuy': /cuy|cuy\.pe/i,
    'Guinea': /guinea(?!_)/i,
    'Habla+': /habla\s*\+|habla plus|habla\s*plus/i,
    'Wings': /wings/i,
    'PeruSim+': /perusim|perú sim|peru sim/i,
    'Fimo': /fimo/i,
    'Airalo': /airalo|esim/i,
    'B2B': /b2b|empresa|iot/i,
    'Legales': /legal|osiptel|dniruc|lista blanca|equipo/i,
  };

  for (const [label, pattern] of Object.entries(patterns)) {
    if (pattern.test(text)) {
      return label;
    }
  }
  return null;
}

async function main() {
  const results = { deduced: [], needsClarity: [] };

  for (const month of MONTHS) {
    try {
      const allIssues = await fetchIssuesForMonth(month);
      
      const validIssues = allIssues.filter(i => {
        if (i.state.name === 'Discarded') return false;
        const labels = i.labels.nodes.map(l => l.name);
        if (labels.includes('Duplicado')) return false;
        return !labels.some(l => CUSTOMER_LABELS.includes(l));
      });

      for (const issue of validIssues) {
        const deduced = deduceLabel(issue.title, issue.description);
        const item = {
          issue: issue.identifier,
          title: issue.title,
          month: month.name,
          deducedLabel: deduced,
          url: `https://linear.app/guinea/issue/${issue.identifier}`
        };

        if (deduced) {
          results.deduced.push(item);
        } else {
          results.needsClarity.push(item);
        }
      }
    } catch (error) {
      console.error(`Error en ${month.name}:`, error.message);
    }
  }

  console.log('\n📊 ANÁLISIS DE LABELS\n');
  console.log(`✅ Issues con label deducido: ${results.deduced.length}`);
  console.log(`❓ Issues que necesitan claridad: ${results.needsClarity.length}`);
  console.log(`📈 Total: ${results.deduced.length + results.needsClarity.length}\n`);

  console.log('═'.repeat(100));
  console.log('ISSUES CON LABEL DEDUCIDO (Puedo asignar directamente):');
  console.log('═'.repeat(100));

  const byLabel = {};
  results.deduced.forEach(item => {
    if (!byLabel[item.deducedLabel]) byLabel[item.deducedLabel] = [];
    byLabel[item.deducedLabel].push(item);
  });

  for (const [label, items] of Object.entries(byLabel).sort()) {
    console.log(`\n${label.toUpperCase()} (${items.length} issues):`);
    items.forEach(item => {
      console.log(`  ${item.issue}: ${item.title.substring(0, 60)}`);
    });
  }

  console.log('\n' + '═'.repeat(100));
  console.log('ISSUES QUE NECESITAN CLARIDAD:');
  console.log('═'.repeat(100));

  const byMonth = {};
  results.needsClarity.forEach(item => {
    if (!byMonth[item.month]) byMonth[item.month] = [];
    byMonth[item.month].push(item);
  });

  for (const [month, items] of Object.entries(byMonth).sort()) {
    console.log(`\n${month.toUpperCase()} (${items.length} issues):`);
    items.slice(0, 5).forEach(item => {
      console.log(`  ${item.issue}: ${item.title.substring(0, 60)}`);
    });
    if (items.length > 5) console.log(`  ... y ${items.length - 5} más`);
  }

  // Export JSON for easier copying
  fs.writeFileSync('labels_analysis.json', JSON.stringify(results, null, 2));
  console.log('\n✓ Análisis guardado en labels_analysis.json');
}

main();
