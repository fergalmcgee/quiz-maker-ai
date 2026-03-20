import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, 'quizmaker.db');

const db = new sqlite3.Database(dbPath, async (err) => {
    if (err) {
        console.error('Error opening db:', err);
        return;
    }

    try {
        console.log("Seeding test growth data...");
        const hashedPassword = await bcrypt.hash('pass', 10);

        // 1. Create a dummy class and teacher
        const teacherRes = await run('INSERT INTO users (username, password_hash, role, is_approved) VALUES (?, ?, ?, ?)', ['Mr. Math', hashedPassword, 'teacher', 1]);
        const teacherId = teacherRes.id;

        const classRes = await run('INSERT INTO classes (teacher_id, name) VALUES (?, ?)', [teacherId, 'Year 10 Advanced Math']);
        const classId = classRes.id;

        // 2. Create students
        const s1Res = await run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['Alice Test', hashedPassword, 'student']);
        const s2Res = await run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['Bob Test', hashedPassword, 'student']);

        await run('INSERT INTO class_students (class_id, student_id) VALUES (?, ?)', [classId, s1Res.id]);
        await run('INSERT INTO class_students (class_id, student_id) VALUES (?, ?)', [classId, s2Res.id]);

        // 3. Create Quizzes
        const q1Res = await run('INSERT INTO quizzes (title, description, author_id) VALUES (?, ?, ?)', ['Math Week 1', 'Basic algebra', teacherId]);
        const q2Res = await run('INSERT INTO quizzes (title, description, author_id) VALUES (?, ?, ?)', ['Math Week 2', 'Geometry', teacherId]);
        const q3Res = await run('INSERT INTO quizzes (title, description, author_id) VALUES (?, ?, ?)', ['Math Week 3', 'Calculus prep', teacherId]);

        // Add 1 question per quiz to make scoring simple
        const quest1Res = await run('INSERT INTO questions (quiz_id, text, type) VALUES (?, ?, ?)', [q1Res.id, 'Solve for x: x = 1', 'multiple_choice']);
        const opt1Res = await run('INSERT INTO options (question_id, text, is_correct) VALUES (?, ?, ?)', [quest1Res.id, '1', 1]);
        const quest2Res = await run('INSERT INTO questions (quiz_id, text, type) VALUES (?, ?, ?)', [q2Res.id, 'Area of square?', 'multiple_choice']);
        const opt2Res = await run('INSERT INTO options (question_id, text, is_correct) VALUES (?, ?, ?)', [quest2Res.id, 's^2', 1]);
        const quest3Res = await run('INSERT INTO questions (quiz_id, text, type) VALUES (?, ?, ?)', [q3Res.id, 'Limit x->0?', 'multiple_choice']);
        const opt3Res = await run('INSERT INTO options (question_id, text, is_correct) VALUES (?, ?, ?)', [quest3Res.id, 'Depends on function', 1]);

        // 4. Create Sessions in chronological order
        // Session 1: 50% class average (Alice 1, Bob 0)
        let date1 = new Date(); date1.setDate(date1.getDate() - 20);
        const sess1Res = await run('INSERT INTO sessions (quiz_id, name, mode, status, class_id, created_at) VALUES (?, ?, ?, ?, ?, ?)', [q1Res.id, 'Algebra Quiz', 'async', 'completed', classId, date1.toISOString()]);
        await run('INSERT INTO responses (session_id, student_id, question_id, option_id) VALUES (?, ?, ?, ?)', [sess1Res.id, s1Res.id, quest1Res.id, opt1Res.id]); // Alice correct
        await run('INSERT INTO responses (session_id, student_id, question_id, option_id) VALUES (?, ?, ?, ?)', [sess1Res.id, s2Res.id, quest1Res.id, 999]); // Bob incorrect

        // Session 2: 100% class average (Alice 1, Bob 1)
        let date2 = new Date(); date2.setDate(date2.getDate() - 10);
        const sess2Res = await run('INSERT INTO sessions (quiz_id, name, mode, status, class_id, created_at) VALUES (?, ?, ?, ?, ?, ?)', [q2Res.id, 'Geometry Test', 'async', 'completed', classId, date2.toISOString()]);
        await run('INSERT INTO responses (session_id, student_id, question_id, option_id) VALUES (?, ?, ?, ?)', [sess2Res.id, s1Res.id, quest2Res.id, opt2Res.id]);
        await run('INSERT INTO responses (session_id, student_id, question_id, option_id) VALUES (?, ?, ?, ?)', [sess2Res.id, s2Res.id, quest2Res.id, opt2Res.id]);

        // Session 3: 50% class average (Alice 0, Bob 1)
        let date3 = new Date();
        const sess3Res = await run('INSERT INTO sessions (quiz_id, name, mode, status, class_id, created_at) VALUES (?, ?, ?, ?, ?, ?)', [q3Res.id, 'Midterm', 'async', 'completed', classId, date3.toISOString()]);
        await run('INSERT INTO responses (session_id, student_id, question_id, option_id) VALUES (?, ?, ?, ?)', [sess3Res.id, s1Res.id, quest3Res.id, 999]);
        await run('INSERT INTO responses (session_id, student_id, question_id, option_id) VALUES (?, ?, ?, ?)', [sess3Res.id, s2Res.id, quest3Res.id, opt3Res.id]);

        console.log(`Success! Log in as Teacher: "Mr. Math" (pass). Class Growth should show a trend of [50%, 100%, 50%].`);

    } catch (e) {
        console.error("Error Seeding:", e);
    } finally {
        db.close();
    }
});

function run(sql, params) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID });
        });
    });
}
