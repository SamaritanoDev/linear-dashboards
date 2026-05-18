#!/usr/bin/env node

const fs = require('fs');

const results = JSON.parse(fs.readFileSync('final_extraction_results.json', 'utf8'));

console.log('\n🤔 ISSUES SIN CLARIDAD (49) - REQUIEREN REVISIÓN MANUAL\n');
console.log('═'.repeat(110));

const groupedByMonth = {};
results.still_unclear.forEach(issue => {
  if (!groupedByMonth[issue.month]) {
    groupedByMonth[issue.month] = [];
  }
  groupedByMonth[issue.month].push(issue);
});

['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo'].forEach(month => {
  if (groupedByMonth[month]) {
    const issues = groupedByMonth[month];
    console.log(`\n📅 ${month.toUpperCase()} (${issues.length}):\n`);
    
    issues.forEach((issue, idx) => {
      console.log(`${idx + 1}. [${issue.id}] ${issue.title.substring(0, 65)}`);
      if (issue.description) {
        console.log(`   Descripción: ${issue.description.substring(0, 80)}...`);
      }
      console.log(`   Estado: ${issue.state}`);
      console.log(`   🔗 ${issue.url}`);
      console.log('');
    });
  }
});

console.log('═'.repeat(110));
console.log(`\nRESUMEN: ${results.still_unclear.length} issues sin claridad`);
console.log(`Total extraído: ${results.extracted.length} de 223`);
