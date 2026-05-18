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

async function fetchAllIssuesForMonth(month) {
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

function deduceCustomerLabel(title, description) {
  const text = (title + ' ' + (description || '')).toLowerCase();
  
  // Buscar patrones explícitos del título primero
  const patterns = {
    'Cuy': ['cuy', 'cuymovil', 'cuy móvil', 'cuy-'],
    'Guinea': ['guinea', '| guinea', 'guinean'],
    'Habla+': ['habla+', 'habla plus', 'hablas+'],
    'Wings': ['wings', 'inka móvil'],
    'PeruSim+': ['perusim', 'perusim+', 'peru sim'],
    'Fimo': ['fimo'],
    'Airalo': ['airalo'],
    'B2B': ['b2b', 'empresas', 'dealer'],
    'Finanzas': ['finanzas', 'finance', 'payment', 'boleta', 'yape'],
    'Legales': ['legal', 'lista blanca', 'osiptel', 'compliance'],
    'Partner': ['partner', 'partnership', 'aldeamo']
  };
  
  // Dar mayor peso a patrones al inicio o explícitamente mencionados
  for (const [customer, keywords] of Object.entries(patterns)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        // Verificar que no sea falso positivo
        if (keyword === 'legal' && (text.includes('legales') || text.includes('lista blanca') || text.includes('osiptel'))) {
          return customer;
        } else if (keyword !== 'legal') {
          return customer;
        }
      }
    }
  }
  
  return null;
}

async function deduceAllMonths() {
  console.log('\n📊 DEDUCCIÓN MEJORADA DE LABELS\n');
  console.log('Analizando issues e intentando deducir customer labels...\n');

  const allResults = {
    deduced: [],
    unclear: []
  };

  for (const month of MONTHS) {
    console.log(`\nProcesando ${month.name}...`);
    
    const issues = await fetchAllIssuesForMonth(month);
    
    const withoutLabels = issues.filter(i => 
      !i.labels.nodes.some(l => CUSTOMER_LABELS.includes(l.name)) &&
      i.state.name !== 'Discarded'
    );

    const deducedThisMonth = [];
    const unclearThisMonth = [];

    withoutLabels.forEach(issue => {
      const deducedLabel = deduceCustomerLabel(issue.title, issue.description || '');
      const isPending = PENDING_STATES.includes(issue.state.name);

      if (deducedLabel && isPending) {
        deducedThisMonth.push({
          id: issue.identifier,
          title: issue.title,
          state: issue.state.name,
          month: month.name,
          deduced_label: deducedLabel,
          confidence: 'high',
          url: `https://linear.app/guinea/issue/${issue.identifier}`
        });
        allResults.deduced.push({
          id: issue.identifier,
          title: issue.title,
          state: issue.state.name,
          month: month.name,
          deduced_label: deducedLabel,
          confidence: 'high',
          url: `https://linear.app/guinea/issue/${issue.identifier}`
        });
      } else {
        unclearThisMonth.push({
          id: issue.identifier,
          title: issue.title,
          state: issue.state.name,
          month: month.name,
          description: issue.description ? issue.description.substring(0, 80) : '',
          url: `https://linear.app/guinea/issue/${issue.identifier}`
        });
        allResults.unclear.push({
          id: issue.identifier,
          title: issue.title,
          state: issue.state.name,
          month: month.name,
          description: issue.description ? issue.description.substring(0, 80) : '',
          url: `https://linear.app/guinea/issue/${issue.identifier}`
        });
      }
    });

    console.log(`  ✅ Deducidos: ${deducedThisMonth.length}`);
    console.log(`  🤔 Inciertos: ${unclearThisMonth.length}`);
  }

  // Guardar resultados en JSON
  fs.writeFileSync('deduced_labels.json', JSON.stringify(allResults, null, 2));

  // Mostrar resumen
  console.log('\n' + '═'.repeat(80));
  console.log('RESUMEN GENERAL');
  console.log('═'.repeat(80));
  console.log(`\n✅ DEDUCIDOS (${allResults.deduced.length}):`);
  
  const deducedByLabel = {};
  allResults.deduced.forEach(issue => {
    if (!deducedByLabel[issue.deduced_label]) {
      deducedByLabel[issue.deduced_label] = [];
    }
    deducedByLabel[issue.deduced_label].push(issue);
  });

  Object.entries(deducedByLabel).sort((a, b) => b[1].length - a[1].length).forEach(([label, issues]) => {
    console.log(`\n  ${label} (${issues.length}):`);
    issues.slice(0, 2).forEach(issue => {
      console.log(`    - [${issue.id}] ${issue.title.substring(0, 60)}... (${issue.month})`);
    });
    if (issues.length > 2) {
      console.log(`    ... y ${issues.length - 2} más`);
    }
  });

  console.log(`\n\n🤔 INCIERTOS (${allResults.unclear.length}):`);
  const unclearByMonth = {};
  allResults.unclear.forEach(issue => {
    if (!unclearByMonth[issue.month]) {
      unclearByMonth[issue.month] = [];
    }
    unclearByMonth[issue.month].push(issue);
  });

  Object.entries(unclearByMonth).forEach(([month, issues]) => {
    console.log(`\n  ${month} (${issues.length}):`);
    issues.forEach(issue => {
      console.log(`    [${issue.id}] ${issue.title.substring(0, 60)}...`);
    });
  });

  console.log('\n\nDatos guardados en: deduced_labels.json');
}

deduceAllMonths().catch(console.error);
