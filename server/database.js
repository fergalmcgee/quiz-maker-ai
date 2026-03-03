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
      text TEXT NOT NULL,
      type TEXT DEFAULT 'multiple_choice',
      image_url TEXT,
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
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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

    // Automatic Migration: Add created_at to sessions if it doesn't exist
    db.all("PRAGMA table_info(sessions);", (err, rows) => {
      if (err) {
        console.error("Error checking sessions schema:", err);
        return;
      }
      const hasCreatedAt = rows.some(r => r.name === 'created_at');
      if (!hasCreatedAt) {
        db.run("ALTER TABLE sessions ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP", (alterErr) => {
          if (alterErr) console.error("Error adding created_at column to sessions:", alterErr);
          else console.log("Successfully migrated sessions table to include created_at column.");
        });
      }

      const hasClassId = rows.some(r => r.name === 'class_id');
      if (!hasClassId) {
        db.run("ALTER TABLE sessions ADD COLUMN class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL", (alterErr) => {
          if (alterErr) console.error("Error adding class_id column to sessions:", alterErr);
          else console.log("Successfully migrated sessions table to include class_id column.");
        });
      }
    });

    // Automatic Migration: Add form_class to users if it doesn't exist
    db.all("PRAGMA table_info(users);", (err, rows) => {
      if (err) return console.error("Error checking users schema:", err);
      const hasFormClass = rows.some(r => r.name === 'form_class');
      if (!hasFormClass) {
        db.run("ALTER TABLE users ADD COLUMN form_class TEXT", (alterErr) => {
          if (alterErr) console.error("Error adding form_class column to users:", alterErr);
          else console.log("Successfully migrated users table to include form_class column.");
        });
      }
    });

    // Automatic Migration: AI Features & Timers
    db.run("ALTER TABLE quizzes ADD COLUMN quiz_type TEXT DEFAULT 'standard'", (err) => {
      if (!err) console.log("Added quiz_type to quizzes.");
    });

    db.run("ALTER TABLE questions ADD COLUMN rubric TEXT", (err) => {
      if (!err) console.log("Added rubric to questions.");
    });

    db.run("ALTER TABLE sessions ADD COLUMN time_limit INTEGER", (err) => {
      if (!err) console.log("Added time_limit to sessions.");
    });

    db.run("ALTER TABLE session_submissions ADD COLUMN started_at DATETIME", (err) => {
      if (!err) console.log("Added started_at to session_submissions.");
    });

    db.run("ALTER TABLE responses ADD COLUMN text_answer TEXT", (err) => {
      if (!err) console.log("Added text_answer to responses.");
    });

    db.run("ALTER TABLE responses ADD COLUMN ai_score INTEGER", (err) => {
      if (!err) console.log("Added ai_score to responses.");
    });

    db.run("ALTER TABLE responses ADD COLUMN ai_feedback TEXT", (err) => {
      if (!err) console.log("Added ai_feedback to responses.");
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
