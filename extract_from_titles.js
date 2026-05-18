#!/usr/bin/env node

const fs = require('fs');

const deduced = JSON.parse(fs.readFileSync('deduced_labels.json', 'utf8'));

// Palabras clave explícitas en los títulos
const EXPLICIT_PATTERNS = {
  'Guinea': /\bGuinea\b/i,
  'Cuy': /\bCuy\b|\bCUY\b|cuy\.pe/i,
  'Habla+': /Habla\+/i,
  'Wings': /\bWings\b/i,
  'PeruSim+': /PeruSIM|PERUSIM/i,
  'Fimo': /\bFIMO\b|Fimo\b/i,
  'Airalo': /\bAiralo\b/i,
  'B2B': /\bB2B\b|Empresas/i,
  'Legales': /Legal|lista blanca|OSIPTEL/i,
  'Finanzas': /Finanzas|Finance|Yape|boleta/i,
  'Partner': /Partner|Aldeamo|dealer/i
};

function extractFromTitle(title) {
  for (const [customer, regex] of Object.entries(EXPLICIT_PATTERNS)) {
    if (regex.test(title)) {
      return customer;
    }
  }
  return null;
}

const extracted = [];
const stillUnclear = [];

deduced.unclear.forEach(issue => {
  const extracted_label = extractFromTitle(issue.title);
  if (extracted_label) {
    extracted.push({
      ...issue,
      extracted_label
    });
  } else {
    stillUnclear.push(issue);
  }
});

// Guardar resultados
const results = {
  extracted,
  still_unclear: stillUnclear
};

fs.writeFileSync('extraction_results.json', JSON.stringify(results, null, 2));

// Mostrar resumen
console.log('\n📊 ANÁLISIS POR TÍTULO\n');
console.log('═'.repeat(100));

console.log(`\n✅ EXTRAÍDOS DE TÍTULO (${extracted.length}):\n`);

const groupedByLabel = {};
extracted.forEach(issue => {
  if (!groupedByLabel[issue.extracted_label]) {
    groupedByLabel[issue.extracted_label] = [];
  }
  groupedByLabel[issue.extracted_label].push(issue);
});

Object.entries(groupedByLabel)
  .sort((a, b) => b[1].length - a[1].length)
  .forEach(([label, issues]) => {
    console.log(`${label} (${issues.length}):`);
    issues.slice(0, 3).forEach(issue => {
      console.log(`  [${issue.id}] ${issue.title.substring(0, 75)}... (${issue.month})`);
      console.log(`  → ${issue.url}`);
    });
    if (issues.length > 3) {
      console.log(`  ... y ${issues.length - 3} más\n`);
    } else {
      console.log('');
    }
  });

console.log(`\n\n🤔 AÙNSTAN SIN CLARIDAD (${stillUnclear.length}):\n`);

const groupedByMonth = {};
stillUnclear.forEach(issue => {
  if (!groupedByMonth[issue.month]) {
    groupedByMonth[issue.month] = [];
  }
  groupedByMonth[issue.month].push(issue);
});

['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo'].forEach(month => {
  if (groupedByMonth[month]) {
    const issues = groupedByMonth[month];
    console.log(`${month} (${issues.length}):`);
    issues.forEach(issue => {
      console.log(`  [${issue.id}] ${issue.title.substring(0, 70)}...`);
      console.log(`  ${issue.url}`);
    });
    console.log('');
  }
});

console.log('═'.repeat(100));
console.log(`\nRESUMEN:`);
console.log(`  Extraídos del título: ${extracted.length}`);
console.log(`  Aún sin claridad: ${stillUnclear.length}`);
console.log(`  TOTAL: ${deduced.unclear.length}`);
