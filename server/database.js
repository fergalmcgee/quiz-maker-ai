import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, 'quizmaker.db');

export const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err);
  } else {
    // Enable foreign keys
    db.run('PRAGMA foreign_keys = ON;', (error) => {
      if (error) console.error('Error enabling foreign keys', error);
      else console.log('Foreign keys enabled.');
    });
    initializeTables();
  }
});

function initializeTables() {
  const usersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'teacher', 'student')),
      is_approved INTEGER DEFAULT 0,
      created_by INTEGER,
      form_class TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `;

  const quizzesTable = `
    CREATE TABLE IF NOT EXISTS quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'General',
      author_id INTEGER,
      is_shared INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `;

  const questionsTable = `
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      text TEXT NOT NULL,
      image_url TEXT,
      code_snippet TEXT,
      code_language TEXT,
      points INTEGER DEFAULT 1,
      order_idx INTEGER NOT NULL,
      explanation TEXT,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    )
  `;

  const optionsTable = `
    CREATE TABLE IF NOT EXISTS options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      is_correct BOOLEAN NOT NULL DEFAULT 0,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    )
  `;

  const classesTable = `
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;

  const classStudentsTable = `
    CREATE TABLE IF NOT EXISTS class_students (
      class_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      PRIMARY KEY (class_id, student_id),
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;

  const sessionsTable = `
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      name TEXT,
      mode TEXT NOT NULL CHECK(mode IN ('live', 'async')),
      status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'completed')),
      current_question_index INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      class_id INTEGER,
      time_limit INTEGER,
      randomize_questions INTEGER DEFAULT 0,
      shuffle_options INTEGER DEFAULT 0,
      is_team_mode INTEGER DEFAULT 0,
      join_code TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
    )
  `;

  const sessionUsersTable = `
    CREATE TABLE IF NOT EXISTS session_users (
      session_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (session_id, user_id),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;

  const responsesTable = `
    CREATE TABLE IF NOT EXISTS responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      option_id INTEGER NOT NULL,
      points_earned INTEGER DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
      FOREIGN KEY (option_id) REFERENCES options(id) ON DELETE CASCADE,
      UNIQUE(session_id, student_id, question_id)
    )
  `;

  const sessionSubmissionsTable = `
    CREATE TABLE IF NOT EXISTS session_submissions (
      session_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      badges TEXT DEFAULT '[]',
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      PRIMARY KEY (session_id, student_id),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;

  db.serialize(() => {
    db.run(usersTable);
    db.run(quizzesTable);
    db.run(questionsTable);
    db.run(optionsTable);
    db.run(sessionsTable);
    db.run(sessionUsersTable);
    db.run(responsesTable);
    db.run(classesTable);
    db.run(classStudentsTable);
    db.run(sessionSubmissionsTable);
    console.log('Database tables initialized.');

    // --- ALL DATABASE MIGRATIONS ---

    // 1. Users table migrations
    db.all("PRAGMA table_info(users);", (err, rows) => {
      if (err) return console.error("Error checking users schema:", err);
      const hasFormClass = rows.some(r => r.name === 'form_class');
      if (!hasFormClass) {
        db.run("ALTER TABLE users ADD COLUMN form_class TEXT", (alterErr) => {
          if (alterErr) console.error("Error adding form_class to users:", alterErr);
          else console.log("Migrated: Added form_class to users.");
        });
      }
    });

    // 2. Questions table migrations (Crucial for scoring and explanations)
    db.all("PRAGMA table_info(questions);", (err, rows) => {
      if (err) return console.error("Error checking questions schema:", err);

      const missingCols = [
        { name: 'explanation', type: 'TEXT' },
        { name: 'rubric', type: 'TEXT' },
        { name: 'points', type: 'INTEGER DEFAULT 1' },
        { name: 'order_idx', type: 'INTEGER DEFAULT 0' },
        { name: 'image_url', type: 'TEXT' },
        { name: 'code_snippet', type: 'TEXT' },
        { name: 'code_language', type: 'TEXT' }
      ];

      missingCols.forEach(col => {
        if (!rows.some(r => r.name === col.name)) {
          db.run(`ALTER TABLE questions ADD COLUMN ${col.name} ${col.type}`, (alterErr) => {
            if (alterErr) console.error(`Error adding ${col.name} to questions:`, alterErr);
            else console.log(`Migrated: Added ${col.name} to questions.`);
          });
        }
      });
    });

    // 3. Sessions table migrations (Crucial for starting quizzes)
    db.all("PRAGMA table_info(sessions);", (err, rows) => {
      if (err) return console.error("Error checking sessions schema:", err);

      const missingCols = [
        { name: 'created_at', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
        { name: 'class_id', type: 'INTEGER' },
        { name: 'join_code', type: 'TEXT' },
        { name: 'shuffle_options', type: 'INTEGER DEFAULT 0' },
        { name: 'is_team_mode', type: 'INTEGER DEFAULT 0' },
        { name: 'time_limit', type: 'INTEGER' },
        { name: 'is_archived', type: 'INTEGER DEFAULT 0' }
      ];

      missingCols.forEach(col => {
        if (!rows.some(r => r.name === col.name)) {
          db.run(`ALTER TABLE sessions ADD COLUMN ${col.name} ${col.type}`, (alterErr) => {
            if (alterErr) console.error(`Error adding ${col.name} to sessions:`, alterErr);
            else console.log(`Migrated: Added ${col.name} to sessions.`);
          });
        }
      });
    });

    // 4. Responses table migrations (For short-answer scoring)
    db.all("PRAGMA table_info(responses);", (err, rows) => {
      if (err) return console.error("Error checking responses schema:", err);

      const missingCols = [
        { name: 'text_answer', type: 'TEXT' },
        { name: 'ai_score', type: 'INTEGER' },
        { name: 'ai_feedback', type: 'TEXT' },
        { name: 'points_earned', type: 'INTEGER DEFAULT 0' }
      ];

      missingCols.forEach(col => {
        if (!rows.some(r => r.name === col.name)) {
          db.run(`ALTER TABLE responses ADD COLUMN ${col.name} ${col.type}`, (alterErr) => {
            if (alterErr) console.error(`Error adding ${col.name} to responses:`, alterErr);
            else console.log(`Migrated: Added ${col.name} to responses.`);
          });
        }
      });
    });

    // 5. Quiz table migrations
    db.all("PRAGMA table_info(quizzes);", (err, rows) => {
      if (err) return console.error("Error checking quizzes schema:", err);
      if (!rows.some(r => r.name === 'is_active')) {
        db.run("ALTER TABLE quizzes ADD COLUMN is_active INTEGER DEFAULT 1", (err) => {
          if (!err) console.log("Migrated: Added is_active to quizzes.");
        });
      }
      if (!rows.some(r => r.name === 'quiz_type')) {
        db.run("ALTER TABLE quizzes ADD COLUMN quiz_type TEXT DEFAULT 'standard'", (err) => {
          if (!err) console.log("Migrated: Added quiz_type to quizzes.");
        });
      }
      if (!rows.some(r => r.name === 'category')) {
        db.run("ALTER TABLE quizzes ADD COLUMN category TEXT DEFAULT 'General'", (err) => {
          if (!err) console.log("Migrated: Added category to quizzes.");
        });
      }
    });

    // 6. Session Submissions table migrations
    db.all("PRAGMA table_info(session_submissions);", (err, rows) => {
      if (err) return console.error("Error checking session_submissions schema:", err);
      if (!rows.some(r => r.name === 'started_at')) {
        db.run("ALTER TABLE session_submissions ADD COLUMN started_at DATETIME", (err) => {
          if (!err) console.log("Migrated: Added started_at to session_submissions.");
        });
      }
      if (!rows.some(r => r.name === 'badges')) {
        db.run("ALTER TABLE session_submissions ADD COLUMN badges TEXT DEFAULT '[]'", (err) => {
          if (!err) console.log("Migrated: Added badges to session_submissions.");
        });
      }
    });
  });
}

// Helper generic query runner wrapped in promises
export const queryDb = {
  get: (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, result) => err ? reject(err) : resolve(result));
  }),
  all: (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  }),
  run: (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  })
};
