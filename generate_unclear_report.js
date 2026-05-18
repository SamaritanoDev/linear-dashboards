#!/usr/bin/env node

const fs = require('fs');

// Leer datos deducidos
const deduced = JSON.parse(fs.readFileSync('deduced_labels.json', 'utf8'));

console.log('\n📋 REPORTE DE ISSUES PARA REVISAR\n');
console.log('Issues sin label de customer - Requieren asignación manual\n');
console.log('═'.repeat(100));

const unclearByMonth = {};
deduced.unclear.forEach(issue => {
  if (!unclearByMonth[issue.month]) {
    unclearByMonth[issue.month] = [];
  }
  unclearByMonth[issue.month].push(issue);
});

const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo'];

months.forEach(month => {
  if (unclearByMonth[month]) {
    const issues = unclearByMonth[month];
    console.log(`\n${month.toUpperCase()} (${issues.length} issues)\n`);
    
    issues.forEach((issue, idx) => {
      console.log(`${idx + 1}. [${issue.id}]`);
      console.log(`   Title: ${issue.title}`);
      console.log(`   State: ${issue.state}`);
      console.log(`   URL: ${issue.url}`);
      console.log('');
    });
  }
});

console.log('\n' + '═'.repeat(100));
console.log(`TOTAL ISSUES SIN LABEL: ${deduced.unclear.length}`);
console.log(`ISSUES DEDUCIDOS: ${deduced.deduced.length}`);
console.log(`\nDatos guardados en: deduced_labels.json`);
