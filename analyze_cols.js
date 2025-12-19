const XLSX = require('xlsx');

const filePath = '/Users/imacdesantiago/proyecto pili/pili/attached_assets/pilar_prueba_1766008488535.xlsx';
const workbook = XLSX.readFile(filePath);
const sheet = workbook.Sheets['Proyectos PGP'] || workbook.Sheets[workbook.SheetNames[0]];

const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

if (rows.length === 0) {
    console.log('No rows found');
    process.exit(1);
}

const colCounts = [];
rows.forEach(row => {
    row.forEach((cell, i) => {
        if (!colCounts[i]) colCounts[i] = {};
        if (cell !== null && cell !== undefined && cell !== '') {
            const s = String(cell);
            colCounts[i][s] = (colCounts[i][s] || 0) + 1;
        }
    });
});

colCounts.forEach((counts, i) => {
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0) {
        console.log(`Column ${i}:`);
        sorted.slice(0, 5).forEach(([val, count]) => {
            console.log(`  "${val}": ${count}`);
        });
    }
});
