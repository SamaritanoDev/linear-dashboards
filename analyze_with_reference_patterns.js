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

// Patrones de keywords por customer
const KEYWORD_PATTERNS = {
  'Guinea': ['guinea', 'guineano', 'guineo'],
  'Cuy': ['cuy', 'peruvian', 'peru'],
  'Habla+': ['habla+', 'habla plus', 'spanish learning'],
  'Wings': ['wings', 'flight', 'airline'],
  'PeruSim+': ['perusim', 'sim', 'telecom', 'mobile sim'],
  'Fimo': ['fimo', 'fintech', 'financial'],
  'Airalo': ['airalo', 'global sim', 'esim'],
  'B2B': ['b2b', 'business to business', 'wholesale', 'corporate'],
  'Finanzas': ['finanzas', 'finance', 'payment', 'wallet'],
  'Legales': ['legal', 'compliance', 'contract', 'regulation'],
  'Partner': ['partner', 'partnership', 'integration', 'third-party']
};

function deduceCustomerLabel(title, description) {
  const text = (title + ' ' + (description || '')).toLowerCase();
  
  for (const [customer, keywords] of Object.entries(KEYWORD_PATTERNS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return customer;
      }
    }
  }
  
  return null;
}

function analyzeWithReferencePatterns() {
  console.log('\n📊 ANÁLISIS CON PATRONES DE REFERENCIA\n');
  console.log('Analizando issues existentes con labels para identificar patrones...\n');

  // Cargar datos del análisis anterior si existen
  let labeledPatterns = {};
  try {
    const analysisOutput = fs.readFileSync('labels_analysis.json', 'utf8');
    const data = JSON.parse(analysisOutput);
    data.deduced.forEach(issue => {
      const customer = issue.deduced_label;
      if (!labeledPatterns[customer]) labeledPatterns[customer] = [];
      labeledPatterns[customer].push({
        id: issue.id,
        title: issue.title
      });
    });
  } catch (e) {
    console.log('No previous analysis found, will analyze from Linear API');
  }

  MONTHS.forEach(month => {
    fetchAllIssuesForMonth(month).then(issues => {
      const withLabels = issues.filter(i => 
        i.labels.nodes.some(l => CUSTOMER_LABELS.includes(l.name))
      );
      
      const withoutLabels = issues.filter(i => 
        !i.labels.nodes.some(l => CUSTOMER_LABELS.includes(l.name)) &&
        i.state.name !== 'Discarded'
      );

      console.log(`\n${'═'.repeat(80)}`);
      console.log(`${month.name.toUpperCase()} - ANÁLISIS DE PATRONES`);
      console.log('═'.repeat(80));

      // Agrupar labeled por customer para identificar patrones
      const labeledByCustomer = {};
      withLabels.forEach(issue => {
        const labels = issue.labels.nodes.map(l => l.name);
        const customerLabels = labels.filter(l => CUSTOMER_LABELS.includes(l));
        customerLabels.forEach(cl => {
          if (!labeledByCustomer[cl]) labeledByCustomer[cl] = [];
          labeledByCustomer[cl].push(issue);
        });
      });

      console.log('\n✅ ISSUES CON LABELS (PATRONES DE REFERENCIA):');
      Object.entries(labeledByCustomer).forEach(([customer, issuesList]) => {
        console.log(`\n  ${customer} (${issuesList.length} issues):`);
        issuesList.slice(0, 3).forEach(issue => {
          console.log(`    - [${issue.identifier}] ${issue.title.substring(0, 60)}...`);
        });
        if (issuesList.length > 3) {
          console.log(`    ... y ${issuesList.length - 3} más`);
        }
      });

      // Analizar issues sin label
      console.log(`\n\n❓ ISSUES SIN LABEL (${withoutLabels.length}):`);
      
      const deduced = [];
      const unclear = [];

      withoutLabels.forEach(issue => {
        const deducedLabel = deduceCustomerLabel(issue.title, issue.description || '');
        const isPending = PENDING_STATES.includes(issue.state.name);

        if (deducedLabel && isPending) {
          deduced.push({
            id: issue.identifier,
            title: issue.title,
            state: issue.state.name,
            deduced_label: deducedLabel,
            url: `https://linear.app/guinea/issue/${issue.identifier}`
          });
        } else {
          unclear.push({
            id: issue.identifier,
            title: issue.title,
            state: issue.state.name,
            description: issue.description ? issue.description.substring(0, 100) : '',
            url: `https://linear.app/guinea/issue/${issue.identifier}`
          });
        }
      });

      if (deduced.length > 0) {
        console.log(`\n  ✅ DEDUCIDOS (${deduced.length}):`);
        deduced.forEach(issue => {
          console.log(`    - [${issue.id}] ${issue.title.substring(0, 50)}... → ${issue.deduced_label}`);
        });
      }

      if (unclear.length > 0) {
        console.log(`\n  🤔 INCIERTOS (${unclear.length}):`);
        unclear.forEach(issue => {
          console.log(`    - [${issue.id}] ${issue.title.substring(0, 50)}...`);
          console.log(`      URL: ${issue.url}`);
        });
      }

    }).catch(error => {
      console.error(`\n❌ Error en ${month.name}:`, error.message);
    });
  });
}

analyzeWithReferencePatterns();
