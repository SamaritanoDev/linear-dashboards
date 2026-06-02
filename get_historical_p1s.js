const https = require('https');

const LINEAR_API_KEY = process.env.LINEAR_API_KEY;

function makeRequest(query) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query });
    
    const options = {
      hostname: 'api.linear.app',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': LINEAR_API_KEY
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
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

async function getAllP1Issues() {
  // Team ID for CE2
  const teamId = "5feed208-25ac-4eb5-a2e6-e5f60f957b00";
  
  const query = `
    query {
      issues(
        first: 250
        filter: {
          team: {id: {eq: "${teamId}"}}
          project: {null: true}
          priority: {eq: 1}
        }
      ) {
        nodes {
          id
          identifier
          title
          createdAt
          completedAt
          priority
          state { name }
        }
      }
    }
  `;

  console.log('📡 Fetching P1 issues from Linear API...\n');
  const result = await makeRequest(query);
  
  if (result.errors) {
    console.error('❌ API Error:', result.errors);
    process.exit(1);
  }

  const issues = result.data.issues.nodes;
  
  // Group by month
  const byMonth = {};
  
  issues.forEach(issue => {
    const date = new Date(issue.createdAt);
    const monthKey = date.toISOString().substring(0, 7); // YYYY-MM
    
    if (!byMonth[monthKey]) {
      byMonth[monthKey] = [];
    }
    byMonth[monthKey].push(issue);
  });

  // Sort months
  const months = Object.keys(byMonth).sort();
  
  console.log('═'.repeat(80));
  console.log('                   HISTÓRICO DE P1 POR MES (Enero - Mayo 2026)');
  console.log('═'.repeat(80));
  console.log();

  // Calculate month-over-month changes
  let prevMonthCount = null;
  let prevMonthKey = null;

  months.forEach((monthKey, idx) => {
    const issues = byMonth[monthKey];
    const count = issues.length;
    
    console.log(`📅 ${monthKey}`);
    console.log(`   Total P1s creados: ${count}`);
    
    if (prevMonthCount !== null) {
      const change = count - prevMonthCount;
      const pctChange = ((change / prevMonthCount) * 100).toFixed(1);
      const reduction = ((prevMonthCount - count) / prevMonthCount) * 100;
      
      if (reduction > 0) {
        console.log(`   Cambio vs ${prevMonthKey}: ${change} (${pctChange}%) → 📉 ${reduction.toFixed(1)}% REDUCCIÓN`);
      } else if (reduction < 0) {
        console.log(`   Cambio vs ${prevMonthKey}: ${change} (${pctChange}%) → 📈 ${Math.abs(reduction).toFixed(1)}% AUMENTO`);
      } else {
        console.log(`   Cambio vs ${prevMonthKey}: ${change} (${pctChange}%) → ⚪ ESTABLE`);
      }
    }
    
    // List first 5 issues for this month
    console.log(`   Issues (mostrando primeros 5):`);
    issues.slice(0, 5).forEach(issue => {
      const state = issue.state.name;
      console.log(`     - ${issue.identifier}: ${issue.title.substring(0, 55)}`);
    });
    if (issues.length > 5) {
      console.log(`     ... y ${issues.length - 5} más`);
    }
    
    console.log();
    prevMonthCount = count;
    prevMonthKey = monthKey;
  });

  // Summary analysis
  console.log('═'.repeat(80));
  console.log('                              ANÁLISIS RESUMEN');
  console.log('═'.repeat(80));
  console.log();

  const summaryByMonth = {};
  months.forEach(monthKey => {
    summaryByMonth[monthKey] = byMonth[monthKey].length;
  });

  console.log('📊 Conteo de P1 por mes:');
  console.log();
  months.forEach(month => {
    console.log(`   ${month}: ${summaryByMonth[month]} P1`);
  });

  console.log();
  console.log('📈 Cambios mes a mes (Reducción % = positivo, Aumento % = negativo):');
  console.log();

  const changes = [];
  for (let i = 1; i < months.length; i++) {
    const prevMonth = months[i-1];
    const currMonth = months[i];
    const prevCount = summaryByMonth[prevMonth];
    const currCount = summaryByMonth[currMonth];
    const reduction = ((prevCount - currCount) / prevCount) * 100;
    
    changes.push({ from: prevMonth, to: currMonth, reduction });
    
    if (reduction > 0) {
      console.log(`   ${prevMonth} → ${currMonth}: +${reduction.toFixed(1)}% REDUCCIÓN 📉`);
    } else if (reduction < 0) {
      console.log(`   ${prevMonth} → ${currMonth}: ${reduction.toFixed(1)}% AUMENTO 📈`);
    } else {
      console.log(`   ${prevMonth} → ${currMonth}: 0% ESTABLE ⚪`);
    }
  }

  if (changes.length > 0) {
    const avgChange = changes.reduce((sum, c) => sum + c.reduction, 0) / changes.length;
    const maxReduction = Math.max(...changes.map(c => c.reduction));
    const minReduction = Math.min(...changes.map(c => c.reduction));

    console.log();
    console.log('📌 Estadísticas (Enero - Mayo):');
    console.log(`   Promedio de cambio: ${avgChange > 0 ? '+' : ''}${avgChange.toFixed(1)}%`);
    console.log(`   Mejor mes: ${maxReduction > 0 ? '+' : ''}${maxReduction.toFixed(1)}%`);
    console.log(`   Peor mes: ${minReduction > 0 ? '+' : ''}${minReduction.toFixed(1)}%`);
  }

  console.log();
  console.log('═'.repeat(80));
  console.log('                    APLICANDO UMBRALES NUEVOS (3-5% sostenible)');
  console.log('═'.repeat(80));
  console.log();

  if (changes.length > 0) {
    console.log('Status por cada mes:');
    console.log();
    changes.forEach(change => {
      let status, emoji;
      if (change.reduction < 0) {
        status = '🔴 CRÍTICO';
        emoji = '(P1s aumentando)';
      } else if (change.reduction < 3) {
        status = '🟡 MEDIO';
        emoji = '(P1s estables, sin mejora)';
      } else if (change.reduction <= 5) {
        status = '🟢 BUENO';
        emoji = '(Tu objetivo logrado)';
      } else {
        status = '✅ EXCELENTE';
        emoji = '(Supera tu meta)';
      }
      console.log(`   ${change.from} → ${change.to}: ${change.reduction > 0 ? '+' : ''}${change.reduction.toFixed(1)}% → ${status} ${emoji}`);
    });
  }

  console.log();
}

getAllP1Issues().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
