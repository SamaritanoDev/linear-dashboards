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

// Palabras clave explícitas en los títulos/descripciones
const EXPLICIT_PATTERNS = {
  'Guinea': /\bGuinea\b/i,
  'Cuy': /\bCuy\b|\bCUY\b|cuy\.pe/i,
  'Habla+': /Habla\+|Habla Plus|Efe/i,
  'Wings': /\bWings\b|Inka Móvil/i,
  'PeruSim+': /PeruSIM|PERUSIM|Peru SIM/i,
  'Fimo': /\bFIMO\b|Fimo\b/i,
  'Airalo': /\bAiralo\b/i,
  'B2B': /\bB2B\b|Empresas|IOT|dealer/i,
  'Legales': /Legal|lista blanca|OSIPTEL|compliance/i,
  'Finanzas': /Finanzas|Finance|Yape|boleta|pago|payment/i,
  'Partner': /Partner|Partnership|Aldeamo|dealer/i
};

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

function extractFromTitleAndDescription(title, description) {
  // Buscar en título primero
  for (const [customer, regex] of Object.entries(EXPLICIT_PATTERNS)) {
    if (regex.test(title)) {
      return { customer, source: 'title' };
    }
  }
  
  // Luego en descripción si existe
  if (description) {
    for (const [customer, regex] of Object.entries(EXPLICIT_PATTERNS)) {
      if (regex.test(description)) {
        return { customer, source: 'description' };
      }
    }
  }
  
  return null;
}

async function analyzeAllMonths() {
  console.log('\n📊 ANÁLISIS CON TÍTULO + DESCRIPCIÓN\n');
  console.log('Procesando issues y extrayendo customer labels...\n');

  const allResults = {
    extracted: [],
    still_unclear: []
  };

  for (const month of MONTHS) {
    console.log(`Procesando ${month.name}...`);
    
    const issues = await fetchAllIssuesForMonth(month);
    
    const withoutLabels = issues.filter(i => 
      !i.labels.nodes.some(l => CUSTOMER_LABELS.includes(l.name)) &&
      i.state.name !== 'Discarded'
    );

    const extractedThisMonth = [];
    const unclearThisMonth = [];

    withoutLabels.forEach(issue => {
      const result = extractFromTitleAndDescription(issue.title, issue.description || '');
      
      if (result) {
        extractedThisMonth.push({
          id: issue.identifier,
          title: issue.title,
          description: issue.description ? issue.description.substring(0, 100) : '',
          state: issue.state.name,
          month: month.name,
          extracted_label: result.customer,
          source: result.source,
          url: `https://linear.app/guinea/issue/${issue.identifier}`
        });
        allResults.extracted.push({
          id: issue.identifier,
          title: issue.title,
          description: issue.description ? issue.description.substring(0, 100) : '',
          state: issue.state.name,
          month: month.name,
          extracted_label: result.customer,
          source: result.source,
          url: `https://linear.app/guinea/issue/${issue.identifier}`
        });
      } else {
        unclearThisMonth.push({
          id: issue.identifier,
          title: issue.title,
          description: issue.description ? issue.description.substring(0, 150) : '',
          state: issue.state.name,
          month: month.name,
          url: `https://linear.app/guinea/issue/${issue.identifier}`
        });
        allResults.still_unclear.push({
          id: issue.identifier,
          title: issue.title,
          description: issue.description ? issue.description.substring(0, 150) : '',
          state: issue.state.name,
          month: month.name,
          url: `https://linear.app/guinea/issue/${issue.identifier}`
        });
      }
    });

    console.log(`  ✅ Extraídos: ${extractedThisMonth.length}`);
    console.log(`  🤔 Sin claridad: ${unclearThisMonth.length}`);
  }

  // Guardar resultados
  fs.writeFileSync('final_extraction_results.json', JSON.stringify(allResults, null, 2));

  // Mostrar resumen
  console.log('\n' + '═'.repeat(100));
  console.log('RESUMEN FINAL');
  console.log('═'.repeat(100));
  
  console.log(`\n✅ EXTRAÍDOS (${allResults.extracted.length}):\n`);
  
  const groupedByLabel = {};
  allResults.extracted.forEach(issue => {
    if (!groupedByLabel[issue.extracted_label]) {
      groupedByLabel[issue.extracted_label] = [];
    }
    groupedByLabel[issue.extracted_label].push(issue);
  });

  Object.entries(groupedByLabel)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([label, issues]) => {
      const fromTitle = issues.filter(i => i.source === 'title').length;
      const fromDesc = issues.filter(i => i.source === 'description').length;
      console.log(`${label} (${issues.length}): ${fromTitle} título, ${fromDesc} descripción`);
    });

  console.log(`\n\n🤔 SIN CLARIDAD (${allResults.still_unclear.length}):\n`);
  
  const groupedByMonth = {};
  allResults.still_unclear.forEach(issue => {
    if (!groupedByMonth[issue.month]) {
      groupedByMonth[issue.month] = [];
    }
    groupedByMonth[issue.month].push(issue);
  });

  ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo'].forEach(month => {
    if (groupedByMonth[month]) {
      console.log(`${month}: ${groupedByMonth[month].length}`);
    }
  });

  console.log('\n═'.repeat(100));
  console.log(`\nDatos guardados en: final_extraction_results.json`);
}

analyzeAllMonths().catch(console.error);
