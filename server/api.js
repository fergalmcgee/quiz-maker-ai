import express from 'express';
import { queryDb } from './database.js';

const router = express.Router();

// --- Authentication & Users ---

// Login (Simple auth for this local app)
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await queryDb.get(
            'SELECT id, username, role, is_approved FROM users WHERE username = ? AND password_hash = ?',
            [username, password]
        );
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        if (user.role === 'teacher' && user.is_approved === 0) {
            return res.status(403).json({ error: 'Your account is pending admin approval' });
        }

        res.json({ message: 'Login successful', user });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create User (Teacher sets up accounts, Admin sets up students)
router.post('/users', async (req, res) => {
    const { username, password, role, form_class, createdBy } = req.body;
    try {
        // Teachers are pending (0) by default, students are approved (1) automatically
        const isApproved = role === 'teacher' ? 0 : 1;

        const result = await queryDb.run(
            'INSERT INTO users (username, password_hash, role, created_by, is_approved, form_class) VALUES (?, ?, ?, ?, ?, ?)',
            [username, password, role, createdBy || null, isApproved, form_class || null]
        );
        res.json({ id: result.id, username, role, form_class });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get Students for a specific teacher
router.get('/students', async (req, res) => {
    const { teacherId } = req.query;
    try {
        let sql = 'SELECT id, username, created_at FROM users WHERE role = "student"';
        const params = [];
        if (teacherId) {
            sql += ' AND created_by = ?';
            params.push(teacherId);
        }
        const students = await queryDb.all(sql, params);
        res.json(students);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Bulk Import Students
// Expected Format: Name, Form Class
router.post('/students/import', async (req, res) => {
    const { bulkText, createdBy } = req.body;
    try {
        const lines = bulkText.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let studentsImported = 0;

        for (const line of lines) {
            const parts = line.split(',');
            if (parts.length >= 1) {
                const username = parts[0].trim();
                const form_class = parts.length > 1 ? parts[1].trim() : null;

                try {
                    await queryDb.run(
                        'INSERT INTO users (username, password_hash, role, created_by, is_approved, form_class) VALUES (?, ?, ?, ?, ?, ?)',
                        [username, 'password', 'student', createdBy || null, 1, form_class]
                    );
                    studentsImported++;
                } catch (e) {
                    // Ignore UNIQUE constraint failures to skip existing students
                    if (!e.message.includes('UNIQUE constraint failed')) {
                        throw e;
                    }
                }
            }
        }

        res.json({ message: 'Import successful', studentsImported });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Search school-wide students
router.get('/students/search', async (req, res) => {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    try {
        const students = await queryDb.all(`
            SELECT id, username, form_class 
            FROM users 
            WHERE role = 'student' AND (username LIKE ? OR form_class LIKE ?)
            LIMIT 10
        `, [`%${q}%`, `%${q}%`]);
        res.json(students);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Classes ---

// Get classes for a teacher
router.get('/classes', async (req, res) => {
    const { teacherId } = req.query;
    try {
        const classes = await queryDb.all(`
            SELECT c.*, COUNT(cs.student_id) as student_count 
            FROM classes c 
            LEFT JOIN class_students cs ON c.id = cs.class_id
            WHERE c.teacher_id = ?
            GROUP BY c.id
            ORDER BY c.created_at DESC
        `, [teacherId]);
        res.json(classes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create a class
router.post('/classes', async (req, res) => {
    const { name, teacherId } = req.body;
    try {
        const result = await queryDb.run(
            'INSERT INTO classes (name, teacher_id) VALUES (?, ?)',
            [name, teacherId]
        );
        res.json({ id: result.id, name, teacher_id: teacherId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get students in a specific class
router.get('/classes/:classId/students', async (req, res) => {
    try {
        const students = await queryDb.all(`
            SELECT u.id, u.username, u.form_class 
            FROM users u
            JOIN class_students cs ON u.id = cs.student_id
            WHERE cs.class_id = ?
        `, [req.params.classId]);
        res.json(students);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add student to class
router.post('/classes/:classId/students', async (req, res) => {
    const { studentId } = req.body;
    try {
        await queryDb.run(
            'INSERT INTO class_students (class_id, student_id) VALUES (?, ?)',
            [req.params.classId, studentId]
        );
        res.json({ message: 'Student added to class' });
    } catch (error) {
        if (error.message.includes('UNIQUE constraint')) {
            return res.json({ message: 'Student already in class' });
        }
        res.status(500).json({ error: error.message });
    }
});

// Remove student from class
router.delete('/classes/:classId/students/:studentId', async (req, res) => {
    try {
        await queryDb.run(
            'DELETE FROM class_students WHERE class_id = ? AND student_id = ?',
            [req.params.classId, req.params.studentId]
        );
        res.json({ message: 'Student removed from class' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Quizzes ---

// Get quizzes for a specific author (teacher)
router.get('/quizzes', async (req, res) => {
    const { authorId } = req.query;
    try {
        let sql = 'SELECT * FROM quizzes WHERE is_active = 1';
        const params = [];
        if (authorId) {
            sql += ' AND author_id = ?';
            params.push(authorId);
        }
        const quizzes = await queryDb.all(sql, params);
        res.json(quizzes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get ALL quizzes (Community Quizzes - excluding the requesting teacher's own quizzes)
router.get('/quizzes/community/:excludeAuthorId', async (req, res) => {
    try {
        // Fetch quizzes and the author's username
        const sql = `
            SELECT q.*, u.username as author_name 
            FROM quizzes q 
            LEFT JOIN users u ON q.author_id = u.id 
            WHERE q.is_shared = 1 AND q.is_active = 1 AND (q.author_id != ? OR q.author_id IS NULL)
            ORDER BY q.created_at DESC
        `;
        const quizzes = await queryDb.all(sql, [req.params.excludeAuthorId]);
        res.json(quizzes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single quiz with questions and options
router.get('/quizzes/:id', async (req, res) => {
    try {
        const quiz = await queryDb.get('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

        const questionsRows = await queryDb.all('SELECT * FROM questions WHERE quiz_id = ?', [quiz.id]);
        const questions = [];
        for (const q of questionsRows) {
            const options = await queryDb.all('SELECT id, text, is_correct FROM options WHERE question_id = ?', [q.id]);
            questions.push({ ...q, options });
        }
        res.json({ ...quiz, questions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Toggle share status of a quiz
router.put('/quizzes/:id/share', async (req, res) => {
    const { isShared } = req.body;
    try {
        await queryDb.run('UPDATE quizzes SET is_shared = ? WHERE id = ?', [isShared ? 1 : 0, req.params.id]);
        res.json({ message: 'Quiz share status updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Soft delete a quiz
router.delete('/quizzes/:id', async (req, res) => {
    try {
        await queryDb.run('UPDATE quizzes SET is_active = 0 WHERE id = ?', [req.params.id]);
        res.json({ message: 'Quiz deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export Quiz to Bulk Format
router.get('/quizzes/:id/export', async (req, res) => {
    try {
        const quiz = await queryDb.get('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

        const questionsRows = await queryDb.all('SELECT * FROM questions WHERE quiz_id = ?', [quiz.id]);
        let bulkText = '';

        for (let i = 0; i < questionsRows.length; i++) {
            const q = questionsRows[i];
            bulkText += `${i + 1}. ${q.text}\n`;
            if (q.image_url) {
                bulkText += `[IMG: ${q.image_url}]\n`;
            }

            const options = await queryDb.all('SELECT * FROM options WHERE question_id = ?', [q.id]);

            if (q.type === 'short_answer') {
                const correct = options.find(o => o.is_correct === 1);
                bulkText += `Answer: ${correct ? correct.text : ''}\n`;
            } else {
                for (const opt of options) {
                    if (opt.is_correct === 1) {
                        bulkText += `*${opt.text}\n`;
                    } else {
                        bulkText += `${opt.text}\n`;
                    }
                }
            }
            if (q.code_snippet) {
                bulkText += `[CODE: ${q.code_language || ''}]\n${q.code_snippet}\n[/CODE]\n`;
            }
            bulkText += '\n'; // Add blank line between questions
        }

        res.json({ bulkText: bulkText.trim(), questions: questionsRows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Edit Quiz (Structured JSON Versioning)
router.put('/quizzes/:id/structure', async (req, res) => {
    const { title, description, questions } = req.body;
    const oldQuizId = req.params.id;

    try {
        // Fetch old quiz to keep authorId and is_shared
        const oldQuiz = await queryDb.get('SELECT * FROM quizzes WHERE id = ?', [oldQuizId]);
        if (!oldQuiz) return res.status(404).json({ error: 'Quiz not found' });

        // 1. Create New Quiz
        const quizResult = await queryDb.run(
            'INSERT INTO quizzes (title, description, author_id, is_shared, is_active) VALUES (?, ?, ?, ?, 1)',
            [title, description, oldQuiz.author_id, oldQuiz.is_shared]
        );
        const newQuizId = quizResult.id;

        let questionsImported = 0;

        for (const q of questions) {
            const questionResult = await queryDb.run(
                'INSERT INTO questions (quiz_id, text, type, image_url, code_snippet, code_language) VALUES (?, ?, ?, ?, ?, ?)',
                [newQuizId, q.text, q.type || 'multiple_choice', q.image_url || null, q.code_snippet || null, q.code_language || null]
            );

            if (q.options && q.options.length > 0) {
                for (const opt of q.options) {
                    await queryDb.run(
                        'INSERT INTO options (question_id, text, is_correct) VALUES (?, ?, ?)',
                        [questionResult.id, opt.text, opt.isCorrect ? 1 : 0]
                    );
                }
            }
            questionsImported++;
        }

        // 3. Mark Old Quiz as Inactive
        await queryDb.run('UPDATE quizzes SET is_active = 0 WHERE id = ?', [oldQuizId]);

        res.json({ message: `Quiz updated successfully.`, quizId: newQuizId, questionsImported });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Edit Quiz (Immutable Versioning)
router.put('/quizzes/:id', async (req, res) => {
    const { title, description, bulkText } = req.body;
    const oldQuizId = req.params.id;

    try {
        // Fetch old quiz to keep authorId and is_shared
        const oldQuiz = await queryDb.get('SELECT * FROM quizzes WHERE id = ?', [oldQuizId]);
        if (!oldQuiz) return res.status(404).json({ error: 'Quiz not found' });

        // 1. Create New Quiz
        const quizResult = await queryDb.run(
            'INSERT INTO quizzes (title, description, author_id, is_shared, is_active) VALUES (?, ?, ?, ?, 1)',
            [title, description, oldQuiz.author_id, oldQuiz.is_shared]
        );
        const newQuizId = quizResult.id;

        // 2. Parse bulkText (same logic as POST /quizzes/import)
        const lines = bulkText.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0);

        let currentQuestionId = null;
        let currentQuestionOptions = [];
        let currentImageUrl = null;
        let questionsImported = 0;

        const commitQuestion = async () => {
            if (currentQuestionId && currentQuestionOptions.length > 0) {
                let type = 'multiple_choice';
                if (currentQuestionOptions.length === 1 && currentQuestionOptions[0].isShortAnswer) type = 'short_answer';
                else if (currentQuestionOptions.length === 2) {
                    const opts = currentQuestionOptions.map(o => o.text.toLowerCase());
                    if (opts.includes('true') && opts.includes('false')) type = 'true_false';
                }

                await queryDb.run('UPDATE questions SET type = ? WHERE id = ?', [type, currentQuestionId]);

                for (const opt of currentQuestionOptions) {
                    await queryDb.run(
                        'INSERT INTO options (question_id, text, is_correct) VALUES (?, ?, ?)',
                        [currentQuestionId, opt.text, opt.isCorrect]
                    );
                }
            }
        };

        for (const line of lines) {
            const imgMatch = line.match(/^\[IMG:\s*(https?:\/\/[^\]]+)\]$/i);
            if (imgMatch) {
                if (currentQuestionId && currentQuestionOptions.length === 0) {
                    await queryDb.run('UPDATE questions SET image_url = ? WHERE id = ?', [imgMatch[1], currentQuestionId]);
                } else {
                    currentImageUrl = imgMatch[1];
                }
                continue;
            }

            const isNewQuestion = /^\d+[\.\)]\s+/.test(line) || /^[Qq](uestion)?\s*\d+[\.\:]\s+/.test(line);

            if (isNewQuestion) {
                await commitQuestion();

                let qText = line.replace(/^\d+[\.\)]\s+/, '').replace(/^[Qq](uestion)?\s*\d+[\.\:]\s+/, '').trim();

                const questionResult = await queryDb.run(
                    'INSERT INTO questions (quiz_id, text, type, image_url) VALUES (?, ?, ?, ?)',
                    [newQuizId, qText, 'multiple_choice', currentImageUrl]
                );

                currentQuestionId = questionResult.id;
                currentQuestionOptions = [];
                currentImageUrl = null;
                questionsImported++;
            } else if (currentQuestionId) {
                let optLine = line;
                let isCorrect = 0;
                let isShortAnswer = false;

                const shortAnswerMatch = optLine.match(/^Answer:\s*(.+)$/i);
                if (shortAnswerMatch) {
                    isCorrect = 1;
                    optLine = shortAnswerMatch[1].trim();
                    isShortAnswer = true;
                } else {
                    if (optLine.startsWith('*')) {
                        isCorrect = 1;
                        optLine = optLine.substring(1).trim();
                    } else if (optLine.toLowerCase().endsWith('(correct)')) {
                        isCorrect = 1;
                        optLine = optLine.replace(/\(correct\)$/i, '').trim();
                    }
                    optLine = optLine.replace(/^[a-zA-Z][\.\)]\s+/, '').replace(/^[\-\•]\s+/, '').trim();
                }

                if (optLine.length > 0) {
                    currentQuestionOptions.push({ text: optLine, isCorrect, isShortAnswer });
                }
            }
        }

        await commitQuestion();

        if (questionsImported === 0) {
            await queryDb.run('DELETE FROM quizzes WHERE id = ?', [newQuizId]);
            return res.status(400).json({ error: 'Could not parse any structured questions from the text.' });
        }

        // 3. Mark Old Quiz as Inactive
        await queryDb.run('UPDATE quizzes SET is_active = 0 WHERE id = ?', [oldQuizId]);

        res.json({ message: `Quiz updated successfully.`, quizId: newQuizId, questionsImported });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create Quiz (Structured JSON)
// JSON format expected:
// { title, description, authorId, questions: [{ text, type, image_url, code_snippet, code_language, options: [{text, isCorrect}] }] }
router.post('/quizzes/builder', async (req, res) => {
    const { title, description, authorId, questions } = req.body;
    try {
        // 1. Create Quiz
        const quizResult = await queryDb.run(
            'INSERT INTO quizzes (title, description, author_id) VALUES (?, ?, ?)',
            [title, description, authorId || null]
        );
        const quizId = quizResult.id;

        let questionsImported = 0;

        for (const q of questions) {
            const questionResult = await queryDb.run(
                'INSERT INTO questions (quiz_id, text, type, image_url, code_snippet, code_language) VALUES (?, ?, ?, ?, ?, ?)',
                [quizId, q.text, q.type || 'multiple_choice', q.image_url || null, q.code_snippet || null, q.code_language || null]
            );

            if (q.options && q.options.length > 0) {
                for (const opt of q.options) {
                    await queryDb.run(
                        'INSERT INTO options (question_id, text, is_correct) VALUES (?, ?, ?)',
                        [questionResult.id, opt.text, opt.isCorrect ? 1 : 0]
                    );
                }
            }
            questionsImported++;
        }

        res.json({ message: `Quiz imported successfully with ${questionsImported} questions.`, quizId, questionsImported });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create Quiz (Bulk Import)
// Text format expected:
// 1. Question?
// A) Option
// *B) Correct Option
// C) Option
router.post('/quizzes/import', async (req, res) => {
    const { title, description, bulkText, authorId } = req.body;
    try {
        // 1. Create Quiz
        const quizResult = await queryDb.run(
            'INSERT INTO quizzes (title, description, author_id) VALUES (?, ?, ?)',
            [title, description, authorId || null]
        );
        const quizId = quizResult.id;

        // 2. Parse bulkText more robustly
        // Normalize line endings and remove extra whitespace
        const lines = bulkText.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0);

        let currentQuestionId = null;
        let currentQuestionOptions = [];
        let currentImageUrl = null;
        let questionsImported = 0;

        // Process the previous question and commit its type/options
        const commitQuestion = async () => {
            if (currentQuestionId && currentQuestionOptions.length > 0) {
                // Determine Type based on options
                let type = 'multiple_choice';

                // 1. Is it Short Answer? (Only 1 option, starts with 'Answer:')
                if (currentQuestionOptions.length === 1 && currentQuestionOptions[0].isShortAnswer) {
                    type = 'short_answer';
                }
                // 2. Is it True/False? (Exactly 2 options, 'true' and 'false')
                else if (currentQuestionOptions.length === 2) {
                    const opts = currentQuestionOptions.map(o => o.text.toLowerCase());
                    if (opts.includes('true') && opts.includes('false')) {
                        type = 'true_false';
                    }
                }

                // Update the question record with its determined type
                await queryDb.run('UPDATE questions SET type = ? WHERE id = ?', [type, currentQuestionId]);

                // Insert all options
                for (const opt of currentQuestionOptions) {
                    await queryDb.run(
                        'INSERT INTO options (question_id, text, is_correct) VALUES (?, ?, ?)',
                        [currentQuestionId, opt.text, opt.isCorrect]
                    );
                }
            }
        };

        for (const line of lines) {
            // Check for Image URL tag
            const imgMatch = line.match(/^\[IMG:\s*(https?:\/\/[^\]]+)\]$/i);
            if (imgMatch) {
                if (currentQuestionId && currentQuestionOptions.length === 0) {
                    await queryDb.run('UPDATE questions SET image_url = ? WHERE id = ?', [imgMatch[1], currentQuestionId]);
                } else {
                    currentImageUrl = imgMatch[1];
                }
                continue;
            }

            // Check if it's a new question (starts with a number followed by . or )
            const isNewQuestion = /^\d+[\.\)]\s+/.test(line) || /^[Qq](uestion)?\s*\d+[\.\:]\s+/.test(line);

            if (isNewQuestion) {
                await commitQuestion(); // Save previous question's options

                // Remove the numbering prefix
                let qText = line.replace(/^\d+[\.\)]\s+/, '').replace(/^[Qq](uestion)?\s*\d+[\.\:]\s+/, '').trim();

                const questionResult = await queryDb.run(
                    'INSERT INTO questions (quiz_id, text, type, image_url) VALUES (?, ?, ?, ?)',
                    [quizId, qText, 'multiple_choice', currentImageUrl]
                );

                currentQuestionId = questionResult.id;
                currentQuestionOptions = [];
                currentImageUrl = null; // Reset for next query
                questionsImported++;
            } else if (currentQuestionId) {
                // It's an option for the current question
                let optLine = line;
                let isCorrect = 0;
                let isShortAnswer = false;

                // Check for Short Answer explicit syntax
                const shortAnswerMatch = optLine.match(/^Answer:\s*(.+)$/i);
                if (shortAnswerMatch) {
                    isCorrect = 1;
                    optLine = shortAnswerMatch[1].trim();
                    isShortAnswer = true;
                } else {
                    // Check for correct answer markers (* prefix, or trailing (correct), etc.)
                    if (optLine.startsWith('*')) {
                        isCorrect = 1;
                        optLine = optLine.substring(1).trim();
                    } else if (optLine.toLowerCase().endsWith('(correct)')) {
                        isCorrect = 1;
                        optLine = optLine.replace(/\(correct\)$/i, '').trim();
                    }

                    // Remove prefix like "A) ", "B. ", "- ", etc.
                    optLine = optLine.replace(/^[a-zA-Z][\.\)]\s+/, '').replace(/^[\-\•]\s+/, '').trim();
                }

                if (optLine.length > 0) {
                    currentQuestionOptions.push({ text: optLine, isCorrect, isShortAnswer });
                }
            }
        }

        // Final commit for the very last question in the loop
        await commitQuestion();

        if (questionsImported === 0) {
            // Rollback quiz creation if nothing parsed
            await queryDb.run('DELETE FROM quizzes WHERE id = ?', [quizId]);
            return res.status(400).json({ error: 'Could not parse any structured questions from the text.' });
        }

        res.json({ message: `Quiz imported successfully with ${questionsImported} questions.`, quizId, questionsImported });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Copy a community quiz to the teacher's own library
router.post('/quizzes/:id/copy', async (req, res) => {
    const { newAuthorId } = req.body;
    const sourceQuizId = req.params.id;

    if (!newAuthorId) {
        return res.status(400).json({ error: 'newAuthorId is required' });
    }

    try {
        // 1. Get original quiz
        const originalQuiz = await queryDb.get('SELECT * FROM quizzes WHERE id = ?', [sourceQuizId]);
        if (!originalQuiz) return res.status(404).json({ error: 'Source quiz not found' });

        // 2. Insert new copied quiz
        const newQuiz = await queryDb.run(
            'INSERT INTO quizzes (title, description, author_id) VALUES (?, ?, ?)',
            [`${originalQuiz.title} (Copy)`, originalQuiz.description, newAuthorId]
        );
        const newQuizId = newQuiz.id;

        // 3. Get and copy all questions
        const questions = await queryDb.all('SELECT * FROM questions WHERE quiz_id = ?', [sourceQuizId]);
        for (const q of questions) {
            const newQuestion = await queryDb.run(
                'INSERT INTO questions (quiz_id, text, type, image_url, code_snippet, code_language) VALUES (?, ?, ?, ?, ?, ?)',
                [newQuizId, q.text, q.type, q.image_url || null, q.code_snippet || null, q.code_language || null]
            );

            // 4. Get and copy all options for this question
            const options = await queryDb.all('SELECT * FROM options WHERE question_id = ?', [q.id]);
            for (const opt of options) {
                await queryDb.run(
                    'INSERT INTO options (question_id, text, is_correct) VALUES (?, ?, ?)',
                    [newQuestion.id, opt.text, opt.is_correct]
                );
            }
        }

        res.json({ message: 'Quiz copied successfully', newQuizId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Admin Controls ---

// Get all users
router.get('/admin/users', async (req, res) => {
    try {
        const users = await queryDb.all(`
            SELECT u.id, u.username, u.role, u.is_approved, u.created_at, u.form_class, creator.username as creator_name
            FROM users u
            LEFT JOIN users creator ON u.created_by = creator.id
            ORDER BY u.role, u.created_at DESC
        `);
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Approve a teacher
router.put('/admin/users/:id/approve', async (req, res) => {
    try {
        await queryDb.run('UPDATE users SET is_approved = 1 WHERE id = ?', [req.params.id]);
        res.json({ message: 'User approved successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reset password
router.put('/admin/users/:id/password', async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'New password is required' });
    try {
        await queryDb.run('UPDATE users SET password_hash = ? WHERE id = ?', [newPassword, req.params.id]);
        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a user (Cascades to their students/quizzes depending on schema)
router.delete('/admin/users/:id', async (req, res) => {
    try {
        await queryDb.run('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// User (Student/Teacher) resetting their own password
router.put('/users/:id/password', async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'New password is required' });
    try {
        await queryDb.run('UPDATE users SET password_hash = ? WHERE id = ?', [newPassword, req.params.id]);
        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
