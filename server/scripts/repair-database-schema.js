import sqlite3 from 'sqlite3';
import { existsSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverDir = resolve(__dirname, '..');
const requestedPath = process.argv[2];
const dbPath = requestedPath
  ? (isAbsolute(requestedPath) ? requestedPath : resolve(process.cwd(), requestedPath))
  : join(serverDir, 'quizmaker.db');

sqlite3.verbose();

const tables = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'teacher', 'student')),
    is_approved INTEGER DEFAULT 0,
    created_by INTEGER,
    form_class TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'General',
    subject TEXT DEFAULT 'General',
    level TEXT DEFAULT 'General',
    topic TEXT DEFAULT 'General',
    quiz_type TEXT DEFAULT 'standard',
    author_id INTEGER,
    is_shared INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    text TEXT NOT NULL,
    image_url TEXT,
    code_snippet TEXT,
    code_language TEXT,
    points INTEGER DEFAULT 1,
    order_idx INTEGER DEFAULT 0,
    explanation TEXT,
    rubric TEXT,
    subject TEXT DEFAULT 'General',
    level TEXT DEFAULT 'General',
    topic TEXT DEFAULT 'General',
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS options (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    question_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT 0,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS class_students (
    class_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    PRIMARY KEY (class_id, student_id),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    name TEXT,
    mode TEXT NOT NULL CHECK(mode IN ('live', 'async')),
    status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'completed')),
    current_question_index INTEGER DEFAULT 0,
    is_archived INTEGER DEFAULT 0,
    class_id INTEGER,
    join_code TEXT,
    time_limit INTEGER,
    randomize_questions INTEGER DEFAULT 0,
    shuffle_options INTEGER DEFAULT 0,
    is_team_mode INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS session_users (
    session_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (session_id, user_id),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    option_id INTEGER,
    text_answer TEXT,
    ai_score INTEGER,
    ai_feedback TEXT,
    points_earned INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (option_id) REFERENCES options(id) ON DELETE CASCADE,
    UNIQUE(session_id, student_id, question_id)
  )`,
  `CREATE TABLE IF NOT EXISTS session_submissions (
    session_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    badges TEXT DEFAULT '[]',
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    started_at DATETIME,
    PRIMARY KEY (session_id, student_id),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS session_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    attempt_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'submitted')),
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    submitted_at DATETIME,
    is_official INTEGER DEFAULT 1,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(session_id, student_id, attempt_number)
  )`,
  `CREATE TABLE IF NOT EXISTS attempt_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    option_id INTEGER NOT NULL,
    points_earned INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (attempt_id) REFERENCES session_attempts(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    FOREIGN KEY (option_id) REFERENCES options(id) ON DELETE CASCADE,
    UNIQUE(attempt_id, question_id)
  )`,
  `CREATE TABLE IF NOT EXISTS practice_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    score_percentage INTEGER NOT NULL,
    points INTEGER DEFAULT 0,
    completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id INTEGER,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id INTEGER,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS login_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS exit_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    class_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('draft', 'open', 'closed', 'archived')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS exit_ticket_prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    prompt_text TEXT NOT NULL,
    order_idx INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES exit_tickets(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS exit_ticket_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    reviewed INTEGER DEFAULT 0,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES exit_tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(ticket_id, student_id)
  )`,
  `CREATE TABLE IF NOT EXISTS exit_ticket_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    response_id INTEGER NOT NULL,
    prompt_id INTEGER NOT NULL,
    answer_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (response_id) REFERENCES exit_ticket_responses(id) ON DELETE CASCADE,
    FOREIGN KEY (prompt_id) REFERENCES exit_ticket_prompts(id) ON DELETE CASCADE,
    UNIQUE(response_id, prompt_id)
  )`,
  `CREATE TABLE IF NOT EXISTS quick_check_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('traffic_light', 'whiteboard')),
    title TEXT NOT NULL,
    question TEXT NOT NULL,
    is_archived INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS quick_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER,
    teacher_id INTEGER NOT NULL,
    class_id INTEGER NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('traffic_light', 'whiteboard')),
    title TEXT NOT NULL,
    question TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed', 'archived')),
    reveal_responses INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (template_id) REFERENCES quick_check_templates(id) ON DELETE SET NULL,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS quick_check_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quick_check_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    traffic_light TEXT CHECK(traffic_light IN ('red', 'yellow', 'green')),
    text_answer TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quick_check_id) REFERENCES quick_checks(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(quick_check_id, student_id)
  )`,
  `CREATE TABLE IF NOT EXISTS long_answer_bank_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_by INTEGER,
    short_name TEXT,
    answer_type TEXT NOT NULL DEFAULT 'prose',
    question_text TEXT NOT NULL,
    student_context TEXT,
    ai_context TEXT,
    context_image_url TEXT,
    max_marks INTEGER NOT NULL DEFAULT 1,
    answer_key TEXT,
    mark_scheme TEXT DEFAULT '[]',
    acceptable_alternatives TEXT DEFAULT '[]',
    common_misconceptions TEXT DEFAULT '[]',
    subject TEXT DEFAULT 'General',
    level TEXT DEFAULT 'General',
    topic TEXT DEFAULT 'General',
    source TEXT,
    is_archived INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS long_answer_quizzes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    subject TEXT DEFAULT 'General',
    level TEXT DEFAULT 'General',
    topic TEXT DEFAULT 'General',
    source_json TEXT,
    is_archived INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS long_answer_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    bank_question_id INTEGER,
    short_name TEXT,
    answer_type TEXT NOT NULL DEFAULT 'prose',
    question_text TEXT NOT NULL,
    student_context TEXT,
    ai_context TEXT,
    context_image_url TEXT,
    max_marks INTEGER NOT NULL DEFAULT 1,
    answer_key TEXT,
    mark_scheme TEXT DEFAULT '[]',
    acceptable_alternatives TEXT DEFAULT '[]',
    common_misconceptions TEXT DEFAULT '[]',
    topic TEXT DEFAULT 'General',
    order_idx INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quiz_id) REFERENCES long_answer_quizzes(id) ON DELETE CASCADE,
    FOREIGN KEY (bank_question_id) REFERENCES long_answer_bank_questions(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS long_answer_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quiz_id INTEGER NOT NULL,
    teacher_id INTEGER NOT NULL,
    class_id INTEGER,
    name TEXT,
    mode TEXT NOT NULL DEFAULT 'async' CHECK(mode IN ('live', 'async')),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'completed', 'archived')),
    release_feedback INTEGER DEFAULT 1,
    allow_ai_hints INTEGER DEFAULT 1,
    ai_analysis TEXT,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (quiz_id) REFERENCES long_answer_quizzes(id) ON DELETE CASCADE,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS long_answer_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    answer_text TEXT NOT NULL,
    ai_score INTEGER,
    ai_feedback TEXT,
    ai_improvements TEXT DEFAULT '[]',
    ai_confidence TEXT,
    ai_raw TEXT,
    teacher_score INTEGER,
    teacher_feedback TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES long_answer_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES long_answer_questions(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(session_id, question_id, student_id)
  )`,
  `CREATE TABLE IF NOT EXISTS long_answer_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES long_answer_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(session_id, student_id)
  )`,
  `CREATE TABLE IF NOT EXISTS long_answer_help_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    answer_text TEXT,
    hint_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES long_answer_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES long_answer_questions(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
  )`
];

const requiredColumns = {
  users: [
    ['form_class', 'TEXT'],
    ['created_by', 'INTEGER'],
    ['created_at', 'DATETIME'],
    ['is_approved', 'INTEGER DEFAULT 0']
  ],
  quizzes: [
    ['category', "TEXT DEFAULT 'General'"],
    ['subject', "TEXT DEFAULT 'General'"],
    ['level', "TEXT DEFAULT 'General'"],
    ['topic', "TEXT DEFAULT 'General'"],
    ['quiz_type', "TEXT DEFAULT 'standard'"],
    ['is_shared', 'INTEGER DEFAULT 0'],
    ['is_active', 'INTEGER DEFAULT 1'],
    ['created_at', 'DATETIME']
  ],
  questions: [
    ['image_url', 'TEXT'],
    ['code_snippet', 'TEXT'],
    ['code_language', 'TEXT'],
    ['points', 'INTEGER DEFAULT 1'],
    ['order_idx', 'INTEGER DEFAULT 0'],
    ['explanation', 'TEXT'],
    ['rubric', 'TEXT'],
    ['subject', "TEXT DEFAULT 'General'"],
    ['level', "TEXT DEFAULT 'General'"],
    ['topic', "TEXT DEFAULT 'General'"]
  ],
  sessions: [
    ['name', 'TEXT'],
    ['current_question_index', 'INTEGER DEFAULT 0'],
    ['is_archived', 'INTEGER DEFAULT 0'],
    ['class_id', 'INTEGER'],
    ['join_code', 'TEXT'],
    ['time_limit', 'INTEGER'],
    ['randomize_questions', 'INTEGER DEFAULT 0'],
    ['shuffle_options', 'INTEGER DEFAULT 0'],
    ['is_team_mode', 'INTEGER DEFAULT 0'],
    ['created_at', 'DATETIME']
  ],
  responses: [
    ['option_id', 'INTEGER'],
    ['text_answer', 'TEXT'],
    ['ai_score', 'INTEGER'],
    ['ai_feedback', 'TEXT'],
    ['points_earned', 'INTEGER DEFAULT 0'],
    ['timestamp', 'DATETIME']
  ],
  session_submissions: [
    ['badges', "TEXT DEFAULT '[]'"],
    ['submitted_at', 'DATETIME'],
    ['started_at', 'DATETIME']
  ],
  session_attempts: [
    ['status', "TEXT NOT NULL DEFAULT 'in_progress'"],
    ['started_at', 'DATETIME'],
    ['submitted_at', 'DATETIME'],
    ['is_official', 'INTEGER DEFAULT 1']
  ],
  attempt_responses: [
    ['points_earned', 'INTEGER DEFAULT 0'],
    ['timestamp', 'DATETIME']
  ],
  exit_tickets: [
    ['status', "TEXT NOT NULL DEFAULT 'open'"],
    ['created_at', 'DATETIME'],
    ['updated_at', 'DATETIME']
  ],
  exit_ticket_prompts: [
    ['order_idx', 'INTEGER NOT NULL DEFAULT 0'],
    ['is_archived', 'INTEGER DEFAULT 0'],
    ['created_at', 'DATETIME'],
    ['updated_at', 'DATETIME']
  ],
  exit_ticket_responses: [
    ['reviewed', 'INTEGER DEFAULT 0'],
    ['submitted_at', 'DATETIME'],
    ['updated_at', 'DATETIME']
  ],
  exit_ticket_answers: [
    ['answer_text', 'TEXT'],
    ['created_at', 'DATETIME'],
    ['updated_at', 'DATETIME']
  ],
  quick_check_templates: [
    ['is_archived', 'INTEGER DEFAULT 0'],
    ['created_at', 'DATETIME'],
    ['updated_at', 'DATETIME']
  ],
  quick_checks: [
    ['template_id', 'INTEGER'],
    ['status', "TEXT NOT NULL DEFAULT 'open'"],
    ['reveal_responses', 'INTEGER DEFAULT 0'],
    ['created_at', 'DATETIME'],
    ['updated_at', 'DATETIME']
  ],
  quick_check_responses: [
    ['traffic_light', 'TEXT'],
    ['text_answer', 'TEXT'],
    ['submitted_at', 'DATETIME'],
    ['updated_at', 'DATETIME']
  ],
  long_answer_bank_questions: [
    ['created_by', 'INTEGER'],
    ['short_name', 'TEXT'],
    ['answer_type', "TEXT NOT NULL DEFAULT 'prose'"],
    ['student_context', 'TEXT'],
    ['ai_context', 'TEXT'],
    ['context_image_url', 'TEXT'],
    ['max_marks', 'INTEGER NOT NULL DEFAULT 1'],
    ['answer_key', 'TEXT'],
    ['mark_scheme', "TEXT DEFAULT '[]'"],
    ['acceptable_alternatives', "TEXT DEFAULT '[]'"],
    ['common_misconceptions', "TEXT DEFAULT '[]'"],
    ['subject', "TEXT DEFAULT 'General'"],
    ['level', "TEXT DEFAULT 'General'"],
    ['topic', "TEXT DEFAULT 'General'"],
    ['source', 'TEXT'],
    ['is_archived', 'INTEGER DEFAULT 0'],
    ['created_at', 'DATETIME'],
    ['updated_at', 'DATETIME']
  ],
  long_answer_quizzes: [
    ['description', 'TEXT'],
    ['subject', "TEXT DEFAULT 'General'"],
    ['level', "TEXT DEFAULT 'General'"],
    ['topic', "TEXT DEFAULT 'General'"],
    ['source_json', 'TEXT'],
    ['is_archived', 'INTEGER DEFAULT 0'],
    ['created_at', 'DATETIME'],
    ['updated_at', 'DATETIME']
  ],
  long_answer_questions: [
    ['bank_question_id', 'INTEGER'],
    ['short_name', 'TEXT'],
    ['answer_type', "TEXT NOT NULL DEFAULT 'prose'"],
    ['student_context', 'TEXT'],
    ['ai_context', 'TEXT'],
    ['context_image_url', 'TEXT'],
    ['max_marks', 'INTEGER NOT NULL DEFAULT 1'],
    ['answer_key', 'TEXT'],
    ['mark_scheme', "TEXT DEFAULT '[]'"],
    ['acceptable_alternatives', "TEXT DEFAULT '[]'"],
    ['common_misconceptions', "TEXT DEFAULT '[]'"],
    ['topic', "TEXT DEFAULT 'General'"],
    ['order_idx', 'INTEGER NOT NULL DEFAULT 0'],
    ['created_at', 'DATETIME']
  ],
  long_answer_sessions: [
    ['teacher_id', 'INTEGER'],
    ['class_id', 'INTEGER'],
    ['name', 'TEXT'],
    ['mode', "TEXT NOT NULL DEFAULT 'async'"],
    ['status', "TEXT NOT NULL DEFAULT 'active'"],
    ['release_feedback', 'INTEGER DEFAULT 1'],
    ['allow_ai_hints', 'INTEGER DEFAULT 1'],
    ['ai_analysis', 'TEXT'],
    ['expires_at', 'DATETIME'],
    ['created_at', 'DATETIME'],
    ['updated_at', 'DATETIME']
  ],
  long_answer_responses: [
    ['ai_score', 'INTEGER'],
    ['ai_feedback', 'TEXT'],
    ['ai_improvements', "TEXT DEFAULT '[]'"],
    ['ai_confidence', 'TEXT'],
    ['ai_raw', 'TEXT'],
    ['teacher_score', 'INTEGER'],
    ['teacher_feedback', 'TEXT'],
    ['submitted_at', 'DATETIME'],
    ['updated_at', 'DATETIME']
  ],
  long_answer_submissions: [
    ['submitted_at', 'DATETIME']
  ],
  long_answer_help_logs: [
    ['answer_text', 'TEXT'],
    ['hint_text', 'TEXT'],
    ['created_at', 'DATETIME']
  ]
};

const indexes = [
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id)',
  'CREATE INDEX IF NOT EXISTS idx_login_sessions_user_id ON login_sessions(user_id)',
  'CREATE INDEX IF NOT EXISTS idx_login_sessions_expires_at ON login_sessions(expires_at)',
  'CREATE INDEX IF NOT EXISTS idx_session_attempts_session_student ON session_attempts(session_id, student_id)',
  'CREATE INDEX IF NOT EXISTS idx_attempt_responses_attempt_id ON attempt_responses(attempt_id)',
  'CREATE INDEX IF NOT EXISTS idx_exit_tickets_teacher_id ON exit_tickets(teacher_id)',
  'CREATE INDEX IF NOT EXISTS idx_exit_tickets_class_id ON exit_tickets(class_id)',
  'CREATE INDEX IF NOT EXISTS idx_exit_ticket_prompts_ticket_id ON exit_ticket_prompts(ticket_id)',
  'CREATE INDEX IF NOT EXISTS idx_exit_ticket_responses_ticket_id ON exit_ticket_responses(ticket_id)',
  'CREATE INDEX IF NOT EXISTS idx_quick_check_templates_teacher_id ON quick_check_templates(teacher_id)',
  'CREATE INDEX IF NOT EXISTS idx_quick_checks_teacher_id ON quick_checks(teacher_id)',
  'CREATE INDEX IF NOT EXISTS idx_quick_checks_class_id ON quick_checks(class_id)',
  'CREATE INDEX IF NOT EXISTS idx_quick_check_responses_check_id ON quick_check_responses(quick_check_id)',
  'CREATE INDEX IF NOT EXISTS idx_long_answer_quizzes_teacher_id ON long_answer_quizzes(teacher_id)',
  'CREATE INDEX IF NOT EXISTS idx_long_answer_bank_questions_tags ON long_answer_bank_questions(subject, level, topic)',
  'CREATE INDEX IF NOT EXISTS idx_long_answer_bank_questions_archived ON long_answer_bank_questions(is_archived)',
  'CREATE INDEX IF NOT EXISTS idx_long_answer_questions_quiz_id ON long_answer_questions(quiz_id)',
  'CREATE INDEX IF NOT EXISTS idx_long_answer_sessions_teacher_id ON long_answer_sessions(teacher_id)',
  'CREATE INDEX IF NOT EXISTS idx_long_answer_sessions_class_id ON long_answer_sessions(class_id)',
  'CREATE INDEX IF NOT EXISTS idx_long_answer_responses_session_student ON long_answer_responses(session_id, student_id)',
  'CREATE INDEX IF NOT EXISTS idx_long_answer_submissions_session_student ON long_answer_submissions(session_id, student_id)',
  'CREATE INDEX IF NOT EXISTS idx_long_answer_help_logs_session_student ON long_answer_help_logs(session_id, student_id)'
];

function openDatabase(path) {
  return new Promise((resolveOpen, rejectOpen) => {
    const database = new sqlite3.Database(path, (err) => {
      if (err) rejectOpen(err);
      else resolveOpen(database);
    });
  });
}

function run(db, sql, params = []) {
  return new Promise((resolveRun, rejectRun) => {
    db.run(sql, params, function onRun(err) {
      if (err) rejectRun(err);
      else resolveRun({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function all(db, sql, params = []) {
  return new Promise((resolveAll, rejectAll) => {
    db.all(sql, params, (err, rows) => {
      if (err) rejectAll(err);
      else resolveAll(rows);
    });
  });
}

function close(db) {
  return new Promise((resolveClose, rejectClose) => {
    db.close((err) => {
      if (err) rejectClose(err);
      else resolveClose();
    });
  });
}

async function listTables(db) {
  const rows = await all(
    db,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  return rows.map((row) => row.name);
}

async function getColumns(db, tableName) {
  return all(db, `PRAGMA table_info(${tableName})`);
}

async function ensurePasswordColumn(db, actions) {
  const columns = await getColumns(db, 'users');
  const names = new Set(columns.map((column) => column.name));

  if (!names.has('password_hash') && names.has('password')) {
    await run(db, 'ALTER TABLE users RENAME COLUMN password TO password_hash');
    actions.push('Renamed users.password to users.password_hash');
    return;
  }

  if (!names.has('password_hash')) {
    await run(db, 'ALTER TABLE users ADD COLUMN password_hash TEXT');
    actions.push('Added users.password_hash');
  }
}

async function ensureColumns(db, actions) {
  await ensurePasswordColumn(db, actions);

  for (const [tableName, columns] of Object.entries(requiredColumns)) {
    const existing = new Set((await getColumns(db, tableName)).map((column) => column.name));

    for (const [columnName, columnType] of columns) {
      if (existing.has(columnName)) continue;
      await run(db, `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
      actions.push(`Added ${tableName}.${columnName}`);
    }
  }
}

async function repair() {
  const existedBefore = existsSync(dbPath);
  const db = await openDatabase(dbPath);
  const actions = [];

  try {
    await run(db, 'PRAGMA foreign_keys = ON');
    const tablesBefore = existedBefore ? await listTables(db) : [];

    for (const tableSql of tables) {
      await run(db, tableSql);
    }

    await ensureColumns(db, actions);

    for (const indexSql of indexes) {
      await run(db, indexSql);
    }

    await run(
      db,
      `UPDATE questions
       SET subject = COALESCE(NULLIF(subject, ''), (SELECT subject FROM quizzes WHERE quizzes.id = questions.quiz_id), 'General'),
           level = COALESCE(NULLIF(level, ''), (SELECT level FROM quizzes WHERE quizzes.id = questions.quiz_id), 'General'),
           topic = COALESCE(NULLIF(topic, ''), (SELECT topic FROM quizzes WHERE quizzes.id = questions.quiz_id), 'General')
       WHERE quiz_id IS NOT NULL`
    );

    const tablesAfter = await listTables(db);
    const newTables = tablesAfter.filter((name) => !tablesBefore.includes(name));

    console.log(`Database repaired: ${dbPath}`);
    console.log(`Tables present: ${tablesAfter.length}`);
    if (newTables.length) console.log(`Created missing tables: ${newTables.join(', ')}`);
    if (actions.length) console.log(`Column repairs: ${actions.join(', ')}`);
    if (!newTables.length && !actions.length) {
      console.log('No missing tables or columns were found.');
    }
  } finally {
    await close(db);
  }
}

repair().catch((err) => {
  console.error('Database repair failed:');
  console.error(err);
  process.exitCode = 1;
});
