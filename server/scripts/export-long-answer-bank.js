import fs from 'fs';
import sqlite3 from 'sqlite3';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverDir = resolve(__dirname, '..');
const projectDir = resolve(serverDir, '..');

const dbPath = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : join(serverDir, 'quizmaker.db');

const outputPath = process.argv[3]
  ? resolve(process.cwd(), process.argv[3])
  : join(projectDir, 'long_answer_imports', 'long_answer_bank_export_for_windows.json');
const assetOutputDir = outputPath.replace(/\.json$/i, '_uploads');

function all(db, sql, params = []) {
  return new Promise((resolveRows, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolveRows(rows)));
  });
}

function parseJsonList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeSource(row) {
  if (row.source) return row.source;
  return 'Exported from QuizMaker long-answer bank';
}

function copyReferencedUploads(questions) {
  fs.rmSync(assetOutputDir, { recursive: true, force: true });

  const uploadUrls = [...new Set(questions
    .map((question) => question.context_image_url)
    .filter((url) => typeof url === 'string' && url.startsWith('/uploads/')))];

  if (!uploadUrls.length) return 0;

  fs.mkdirSync(assetOutputDir, { recursive: true });

  let copied = 0;
  for (const url of uploadUrls) {
    const filename = url.replace('/uploads/', '');
    const sourcePath = join(serverDir, 'public', 'uploads', filename);
    const targetPath = join(assetOutputDir, filename);
    if (!fs.existsSync(sourcePath)) {
      console.warn(`Missing upload asset, skipped: ${sourcePath}`);
      continue;
    }
    fs.copyFileSync(sourcePath, targetPath);
    copied += 1;
  }

  return copied;
}

async function main() {
  const db = new sqlite3.Database(dbPath);

  try {
    const rows = await all(db, `
      SELECT *
      FROM long_answer_bank_questions
      WHERE COALESCE(is_archived, 0) = 0
      ORDER BY subject ASC, level ASC, COALESCE(NULLIF(short_name, ''), topic) ASC, id ASC
    `);

    const questions = rows.map((row) => ({
      id: row.short_name || `long_answer_bank_${row.id}`,
      short_name: row.short_name || `Question ${row.id}`,
      answer_type: row.answer_type || 'prose',
      question: row.question_text || '',
      student_context: row.student_context || '',
      ai_context: row.ai_context || '',
      context_image_url: row.context_image_url || '',
      max_marks: row.max_marks || 1,
      subject: row.subject || 'General',
      level: row.level || 'General',
      topic: row.topic || 'General',
      source: normalizeSource(row),
      answer_key: row.answer_key || '',
      mark_scheme: parseJsonList(row.mark_scheme),
      acceptable_alternatives: parseJsonList(row.acceptable_alternatives),
      common_misconceptions: parseJsonList(row.common_misconceptions)
    }));

    const exportPayload = {
      title: 'QuizMaker Long Answer Bank Export',
      description: 'Admin-import-ready export of active long-answer bank questions only. This does not include users, classes, sessions, multiple-choice questions, or student responses.',
      subject: questions[0]?.subject || 'General',
      level: questions[0]?.level || 'General',
      topic: 'Long Answer Bank Export',
      exported_at: new Date().toISOString(),
      source_database: dbPath,
      questions
    };

    fs.mkdirSync(dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(exportPayload, null, 2)}\n`);
    const copiedAssets = copyReferencedUploads(questions);
    console.log(`Exported ${questions.length} long-answer bank question${questions.length === 1 ? '' : 's'}.`);
    console.log(outputPath);
    if (copiedAssets) {
      console.log(`Copied ${copiedAssets} upload asset${copiedAssets === 1 ? '' : 's'}:`);
      console.log(assetOutputDir);
    }
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
