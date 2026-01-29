/**
 * Generate a sample Excel file with a few hundred records.
 * Run from server/: node scripts/generate-sample.js
 * Output: data/sample.xlsx
 */
import ExcelJS from 'exceljs';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '../../samples');
const OUT_FILE = path.join(OUT_DIR, 'sample.xlsx');

const ROW_COUNT = 150;
const HEADERS = ['ID', 'Name', 'Department', 'Status', 'Date', 'Notes'];

const DEPARTMENTS = ['Engineering', 'Sales', 'Marketing', 'Support', 'HR', 'Finance'];
const STATUSES = ['Pending', 'In Progress', 'Approved', 'Rejected', 'Needs Review'];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(startYear = 2023, endYear = 2025) {
  const start = new Date(startYear, 0, 1).getTime();
  const end = new Date(endYear, 11, 31).getTime();
  return new Date(start + Math.random() * (end - start));
}

async function generate() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sample', { views: [{ state: 'frozen', ySplit: 1 }] });

  sheet.addRow(HEADERS);
  sheet.getRow(1).font = { bold: true };

  for (let i = 1; i <= ROW_COUNT; i++) {
    sheet.addRow([
      i,
      `Person ${i}`,
      randomItem(DEPARTMENTS),
      randomItem(STATUSES),
      randomDate(),
      i % 5 === 0 ? `Note for row ${i}` : '',
    ]);
  }

  await workbook.xlsx.writeFile(OUT_FILE);
  console.log(`Created ${OUT_FILE} with ${HEADERS.length} columns and ${ROW_COUNT} data rows.`);
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
