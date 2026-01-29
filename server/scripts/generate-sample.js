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
const HEADERS = ['ID', 'Name', 'Department', 'Status', 'Date', 'Notes', 'Conversation'];

const DEPARTMENTS = ['Engineering', 'Sales', 'Marketing', 'Support', 'HR', 'Finance'];
const STATUSES = ['Pending', 'In Progress', 'Approved', 'Rejected', 'Needs Review'];

const SPEAKERS = ['Alice', 'Bob', 'Caline', 'Dave', 'Eve'];
const PHRASES = [
  'Can we schedule a follow-up?', 'Sounds good to me.', 'Let me check and get back to you.',
  'I have a question about that.', 'Thanks for the update.', 'We should discuss this offline.',
  'I will send the details soon.', 'Got it, thanks.', 'Any other items for today?',
  'That works for me.', 'I need to confirm with the team.', 'No problem.',
];

const WORDS = [
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use', 'that', 'with', 'this', 'from', 'they', 'have', 'been', 'more', 'when', 'will', 'your', 'said', 'each', 'them', 'than', 'then', 'some', 'into', 'only', 'other', 'about', 'many', 'these', 'first', 'would', 'there', 'could', 'after', 'where', 'which', 'their', 'being', 'while', 'should', 'through', 'during', 'before', 'between', 'without', 'something', 'everything', 'anything', 'nothing', 'everyone', 'someone', 'another', 'however', 'therefore', 'although', 'because', 'perhaps', 'already', 'always', 'sometimes', 'usually', 'really', 'actually', 'finally', 'quickly', 'slowly', 'carefully', 'recently', 'immediately', 'absolutely', 'definitely', 'certainly', 'obviously', 'apparently', 'basically', 'generally', 'normally', 'particularly', 'especially', 'exactly', 'completely', 'entirely', 'totally', 'fully', 'partly', 'mostly', 'mainly', 'primarily', 'originally', 'initially', 'eventually', 'gradually', 'suddenly', 'immediately',
];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Return a random string of approximately wordCount words. */
function randomWords(wordCount = 100) {
  const out = [];
  for (let i = 0; i < wordCount; i++) {
    out.push(randomItem(WORDS));
  }
  return out.join(' ');
}

function randomDate(startYear = 2023, endYear = 2025) {
  const start = new Date(startYear, 0, 1).getTime();
  const end = new Date(endYear, 11, 31).getTime();
  return new Date(start + Math.random() * (end - start));
}

/** Return a dialogue string in token: format (e.g. "Alice: hello Bob: hi there"). */
function randomDialogue() {
  const turns = 2 + Math.floor(Math.random() * 3);
  const parts = [];
  for (let t = 0; t < turns; t++) {
    parts.push(`${randomItem(SPEAKERS)}: ${randomItem(PHRASES)}`);
  }
  return parts.join(' ');
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
      randomWords(100),
      randomItem(DEPARTMENTS),
      randomItem(STATUSES),
      randomDate(),
      i % 5 === 0 ? `Note for row ${i}` : '',
      randomDialogue(),
    ]);
  }

  await workbook.xlsx.writeFile(OUT_FILE);
  console.log(`Created ${OUT_FILE} with ${HEADERS.length} columns and ${ROW_COUNT} data rows.`);
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
