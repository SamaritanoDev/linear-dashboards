const fs = require('fs');

console.log('═'.repeat(100));
console.log('                    AUDITORÍA DE MÉTRICAS - FRONTEND vs BACKEND');
console.log('═'.repeat(100));
console.log();

// Read HTML file
const htmlContent = fs.readFileSync('./index.html', 'utf8');

// Extract getMetricStatus function
const statusFunctionMatch = htmlContent.match(/function getMetricStatus\(metricKey, value\) \{[\s\S]*?\n                \}/);
const statusFunction = statusFunctionMatch ? statusFunctionMatch[0] : '';

// Read TypeScript backend
const tsContent = fs.readFileSync('./cloudflare-worker/src/services/ce2-metrics.ts', 'utf8');

console.log('📋 MÉTRICAS Y UMBRALES ENCONTRADOS:');
console.log();

// List of metrics to check
const metrics = [
  { name: 'vip_resolution_rate', key: 'vipResolutionRate' },
  { name: 'fcrr', key: 'fcrr' },
  { name: 'reopen_rate', key: 'reopenRate' },
  { name: 'containment_rate', key: 'containmentRate' },
  { name: 'mttr_urgent_hours', key: 'mttr_urgent_hours' },
  { name: 'mttr_high_hours', key: 'mttr_high_hours' },
  { name: 'downtime_saved', key: 'downtimeSaved' },
  { name: 'fire_prevention', key: 'firePrevention' },
  { name: 'noise_reduction', key: 'noiseReduction' }
];

metrics.forEach(metric => {
  console.log(`\n🔍 ${metric.name.toUpperCase()}`);
  console.log('─'.repeat(100));
  
  // Check Frontend thresholds
  console.log('  FRONTEND (index.html):');
  
  if (metric.name === 'mttr_urgent_hours' || metric.name === 'mttr_high_hours') {
    const frontendMatch = htmlContent.match(new RegExp(`if \\(metricKey\\.includes\\('mttr'\\)\\).*?\\n.*?if \\(value <= 24\\).*?\\n.*?if \\(value <= 120\\).*?\\n.*?if \\(value <= 180\\)`));
    if (frontendMatch) {
      console.log('    ✅ ≤24h: excellent');
      console.log('    ✅ 24-120h: good');
      console.log('    ✅ 120-180h: medium');
      console.log('    ✅ >180h: critical');
    }
  } else if (metric.name === 'fire_prevention') {
    const frontendMatch = htmlContent.match(new RegExp(`if \\(metricKey === 'fire_prevention'\\).*?\\n.*?if \\(value < 0\\).*?\\n.*?if \\(value < 3\\).*?\\n.*?if \\(value <= 5\\)`));
    if (frontendMatch) {
      console.log('    ✅ <0%: critical');
      console.log('    ✅ 0-3%: medium');
      console.log('    ✅ 3-5%: good');
      console.log('    ✅ >5%: excellent');
    }
  } else if (metric.name === 'reopen_rate') {
    const frontendMatch = htmlContent.match(new RegExp(`if \\(metricKey === 'reopen_rate'\\).*?\\n.*?if \\(value <= 5\\).*?\\n.*?if \\(value <= 10\\).*?\\n.*?if \\(value <= 20\\)`));
    if (frontendMatch) {
      console.log('    ✅ ≤5%: excellent');
      console.log('    ✅ 5-10%: good');
      console.log('    ✅ 10-20%: medium');
      console.log('    ✅ >20%: critical');
    }
  } else {
    const standardMatch = htmlContent.match(/if \(value >= 90\) return 'excellent'[\s\S]*?if \(value >= 75\) return 'good'[\s\S]*?if \(value >= 50\) return 'medium'/);
    if (standardMatch) {
      console.log('    ✅ ≥90%: excellent');
      console.log('    ✅ 75-89%: good');
      console.log('    ✅ 50-74%: medium');
      console.log('    ✅ <50%: critical');
    }
  }
  
  // Check Backend status
  console.log('\n  BACKEND (ce2-metrics.ts):');
  
  const metricBlockRegex = new RegExp(`calculateFirePrevention|calculateMTTR|calculateReopenRate|calculate${metric.key.charAt(0).toUpperCase() + metric.key.slice(1).replace(/([A-Z])/g, '_$1').toLowerCase()}`, 'i');
  
  if (metric.name.includes('mttr')) {
    const backendMatch = tsContent.match(/SLA_P1 = 4;[\s\S]*?SLA_P2 = 8;/);
    if (backendMatch) {
      console.log('    ⚠️  NOTA: Backend usa SLA_P1=4h, SLA_P2=8h (ANTIGUO)');
      console.log('    ❌ Debería usar SLA=120h (5 días) según el tooltip actualizado');
    }
  } else if (metric.name === 'fire_prevention') {
    const backendMatch = tsContent.match(/status: reduction > 5 \? "excellent" : reduction >= 3 \? "good" : reduction >= 0 \? "medium" : "critical"/);
    if (backendMatch) {
      console.log('    ✅ <0%: critical');
      console.log('    ✅ 0-3%: medium');
      console.log('    ✅ 3-5%: good');
      console.log('    ✅ >5%: excellent');
    }
  } else if (metric.name === 'reopen_rate') {
    const backendMatch = tsContent.match(/const status = value < 5 \? "good" : value < 10 \? "fair" : "poor"/);
    if (backendMatch) {
      console.log('    ❌ MISMATCH: Usa "good"/"fair"/"poor" en lugar de "excellent"/"good"/"medium"/"critical"');
    }
  } else {
    console.log('    ✓ Revisar manualmente en ce2-metrics.ts');
  }
});

console.log('\n' + '═'.repeat(100));
console.log('                              RESUMEN DE INCONSISTENCIAS');
console.log('═'.repeat(100));
console.log();

// Check for status consistency
const inconsistencies = [
  {
    metric: 'reopen_rate',
    issue: 'Backend usa "good"/"fair"/"poor", Frontend usa "excellent"/"good"/"medium"/"critical"',
    severity: '🔴 CRÍTICO'
  },
  {
    metric: 'downtime_saved',
    issue: 'Verificar si backend status está alineado con frontend getMetricStatus',
    severity: '🟡 REVISAR'
  },
  {
    metric: 'mttr_*',
    issue: 'Backend hardcodea SLA_P1=4h, SLA_P2=8h pero tooltip dice max 5 días (120h)',
    severity: '🟠 IMPORTANTE'
  }
];

inconsistencies.forEach(item => {
  console.log(`${item.severity} ${item.metric}`);
  console.log(`   → ${item.issue}`);
  console.log();
});

