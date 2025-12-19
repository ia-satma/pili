const XLSX = require('xlsx');
const path = require('path');

const filePath = '/Users/imacdesantiago/proyecto pili/pili/attached_assets/pilar_prueba_1766008488535.xlsx';
const workbook = XLSX.readFile(filePath);

console.log('--- SEARCHING FOR "AM03473" ---');
workbook.SheetNames.forEach(name => {
    const sheet = workbook.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    data.forEach((row, r) => {
        row.forEach((cell, c) => {
            if (String(cell).includes('AM03473')) {
                console.log(`Found in sheet "${name}" at row ${r}, col ${c}: "${cell}"`);
            }
        });
    });
});

console.log('--- FIRST 5 ROWS OF "Proyectos PGP" ---');
const pgpSheet = workbook.Sheets['Proyectos PGP'];
if (pgpSheet) {
    const rows = XLSX.utils.sheet_to_json(pgpSheet, { header: 1 });
    rows.slice(0, 5).forEach((row, i) => {
        console.log(`Row ${i}:`, JSON.stringify(row));
    });
} else {
    console.log('Sheet "Proyectos PGP" not found.');
}
