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
      subject TEXT DEFAULT 'General',
      level TEXT DEFAULT 'General',
      topic TEXT DEFAULT 'General',
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
      subject TEXT DEFAULT 'General',
      level TEXT DEFAULT 'General',
      topic TEXT DEFAULT 'General',
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

  const sessionAttemptsTable = `
    CREATE TABLE IF NOT EXISTS session_attempts (
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
    )
  `;

  const attemptResponsesTable = `
    CREATE TABLE IF NOT EXISTS attempt_responses (
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
    )
  `;

  const practiceScoresTable = `
    CREATE TABLE IF NOT EXISTS practice_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      score_percentage INTEGER NOT NULL,
      points INTEGER DEFAULT 0,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;

  const auditLogsTable = `
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `;

  const loginSessionsTable = `
    CREATE TABLE IF NOT EXISTS login_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;

  const exitTicketsTable = `
    CREATE TABLE IF NOT EXISTS exit_tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      class_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('draft', 'open', 'closed', 'archived')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    )
  `;

  const exitTicketPromptsTable = `
    CREATE TABLE IF NOT EXISTS exit_ticket_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      prompt_text TEXT NOT NULL,
      order_idx INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES exit_tickets(id) ON DELETE CASCADE
    )
  `;

  const exitTicketResponsesTable = `
    CREATE TABLE IF NOT EXISTS exit_ticket_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      reviewed INTEGER DEFAULT 0,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES exit_tickets(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(ticket_id, student_id)
    )
  `;

  const exitTicketAnswersTable = `
    CREATE TABLE IF NOT EXISTS exit_ticket_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      response_id INTEGER NOT NULL,
      prompt_id INTEGER NOT NULL,
      answer_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (response_id) REFERENCES exit_ticket_responses(id) ON DELETE CASCADE,
      FOREIGN KEY (prompt_id) REFERENCES exit_ticket_prompts(id) ON DELETE CASCADE,
      UNIQUE(response_id, prompt_id)
    )
  `;

  const quickCheckTemplatesTable = `
    CREATE TABLE IF NOT EXISTS quick_check_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id INTEGER NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('traffic_light', 'whiteboard')),
      title TEXT NOT NULL,
      question TEXT NOT NULL,
      is_archived INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;

  const quickChecksTable = `
    CREATE TABLE IF NOT EXISTS quick_checks (
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
    )
  `;

  const quickCheckResponsesTable = `
    CREATE TABLE IF NOT EXISTS quick_check_responses (
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
    db.run(sessionAttemptsTable);
    db.run(attemptResponsesTable);
    db.run(auditLogsTable);
    db.run(loginSessionsTable);
    db.run(exitTicketsTable);
    db.run(exitTicketPromptsTable);
    db.run(exitTicketResponsesTable);
    db.run(exitTicketAnswersTable);
    db.run(quickCheckTemplatesTable);
    db.run(quickChecksTable);
    db.run(quickCheckResponsesTable);
    db.run(practiceScoresTable);
    db.run('CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)');
    db.run('CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_login_sessions_user_id ON login_sessions(user_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_login_sessions_expires_at ON login_sessions(expires_at)');
    db.run('CREATE INDEX IF NOT EXISTS idx_session_attempts_session_student ON session_attempts(session_id, student_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_attempt_responses_attempt_id ON attempt_responses(attempt_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_exit_tickets_teacher_id ON exit_tickets(teacher_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_exit_tickets_class_id ON exit_tickets(class_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_exit_ticket_prompts_ticket_id ON exit_ticket_prompts(ticket_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_exit_ticket_responses_ticket_id ON exit_ticket_responses(ticket_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_quick_check_templates_teacher_id ON quick_check_templates(teacher_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_quick_checks_teacher_id ON quick_checks(teacher_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_quick_checks_class_id ON quick_checks(class_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_quick_check_responses_check_id ON quick_check_responses(quick_check_id)');
    console.log('Database tables initialized.');

    // --- ALL DATABASE MIGRATIONS ---

    // 1. Users table migrations (Crucial for login and password security)
    db.all("PRAGMA table_info(users);", (err, rows) => {
      if (err) return console.error("Error checking users schema:", err);
      
      const hasPasswordHash = rows.some(r => r.name === 'password_hash');
      const hasPassword = rows.some(r => r.name === 'password');
      const hasFormClass = rows.some(r => r.name === 'form_class');

      if (!hasPasswordHash && hasPassword) {
        console.log("MIGRATION: Renaming 'password' to 'password_hash' in users table...");
        db.run("ALTER TABLE users RENAME COLUMN password TO password_hash", (err) => {
          if (!err) {
            console.log("MIGRATION: Successfully renamed password column.");
            migratePlaintextPasswords();
          }
        });
      } else if (hasPasswordHash) {
        migratePlaintextPasswords();
      }

      if (!hasFormClass) {
        db.run("ALTER TABLE users ADD COLUMN form_class TEXT", (alterErr) => {
          if (alterErr) console.error("Error adding form_class to users:", alterErr);
          else console.log("Migrated: Added form_class to users.");
        });
      }
    });

    // Helper to migrate plaintext passwords (internal to initialize)
    async function migratePlaintextPasswords() {
      db.all("SELECT id, username, password_hash FROM users", async (err, users) => {
        if (err || !users) return;
        
        // Dynamic import to avoid top-level issues if needed, but bcryptjs is already imported at top
        const bcrypt = (await import('bcryptjs')).default;

        for (const user of users) {
          const h = user.password_hash;
          // Bcrypt hashes start with $2a$ or $2b$ and are roughly 60 chars
          const isHashed = h && h.startsWith('$2') && h.length >= 50;

          if (h && !isHashed) {
            console.log(`MIGRATION: Hashing plaintext password for user '${user.username}'...`);
            const salt = await bcrypt.genSalt(10);
            const hashed = await bcrypt.hash(h, salt);
            db.run("UPDATE users SET password_hash = ? WHERE id = ?", [hashed, user.id]);
          }
        }
      });
    }

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
        { name: 'code_language', type: 'TEXT' },
        { name: 'subject', type: 'TEXT DEFAULT "General"' },
        { name: 'level', type: 'TEXT DEFAULT "General"' },
        { name: 'topic', type: 'TEXT DEFAULT "General"' }
      ];

      missingCols.forEach(col => {
        if (!rows.some(r => r.name === col.name)) {
          db.run(`ALTER TABLE questions ADD COLUMN ${col.name} ${col.type}`, (alterErr) => {
            if (alterErr) console.error(`Error adding ${col.name} to questions:`, alterErr);
            else {
              console.log(`Migrated: Added ${col.name} to questions.`);
              if (['subject', 'level', 'topic'].includes(col.name)) {
                 db.run(`UPDATE questions SET ${col.name} = (SELECT ${col.name} FROM quizzes WHERE quizzes.id = questions.quiz_id) WHERE quiz_id IS NOT NULL`);
              }
            }
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
      if (!rows.some(r => r.name === 'subject')) {
        db.run("ALTER TABLE quizzes ADD COLUMN subject TEXT DEFAULT 'General'", (err) => {
          if (!err) console.log("Migrated: Added subject to quizzes.");
        });
      }
      if (!rows.some(r => r.name === 'level')) {
        db.run("ALTER TABLE quizzes ADD COLUMN level TEXT DEFAULT 'General'", (err) => {
          if (!err) console.log("Migrated: Added level to quizzes.");
        });
      }
      if (!rows.some(r => r.name === 'topic')) {
        db.run("ALTER TABLE quizzes ADD COLUMN topic TEXT DEFAULT 'General'", (err) => {
          if (!err) console.log("Migrated: Added topic to quizzes.");
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

export async function logAuditEvent({
  actorId = null,
  actorRole,
  action,
  targetType,
  targetId = null,
  details = {}
}) {
  try {
    await queryDb.run(
      `INSERT INTO audit_logs (actor_id, actor_role, action, target_type, target_id, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        actorId || null,
        actorRole,
        action,
        targetType,
        targetId || null,
        JSON.stringify(details)
      ]
    );
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
