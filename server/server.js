import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';
import { queryDb } from './database.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

import apiRoutes from './api.js';
app.use('/api', apiRoutes);

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // For local development, allow all origins
    }
});

// SQLite initialization
const dbPath = join(__dirname, 'quizmaker.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to the SQLite database.');
    }
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date() });
});

// Get all sessions
app.get('/api/sessions', async (req, res) => {
    try {
        const sessions = await queryDb.all('SELECT * FROM sessions ORDER BY id DESC');
        res.json(sessions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get sessions for a specific teacher's quizzes
app.get('/api/sessions/teacher/:teacherId', async (req, res) => {
    try {
        const sessions = await queryDb.all(`
            SELECT s.*, q.title as quiz_title, s.created_at
            FROM sessions s
            JOIN quizzes q ON s.quiz_id = q.id
            WHERE q.author_id = ?
            ORDER BY s.id DESC
        `, [req.params.teacherId]);
        res.json(sessions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get active sessions for a specific student (filtered by their enrolled classes)
app.get('/api/sessions/student/:studentId', async (req, res) => {
    try {
        const sql = `
            SELECT s.*, q.title as quiz_title, c.name as class_name, t.username as teacher_name
            FROM sessions s
            JOIN quizzes q ON s.quiz_id = q.id
            JOIN classes c ON s.class_id = c.id
            JOIN class_students cs ON c.id = cs.class_id
            JOIN users t ON c.teacher_id = t.id
            WHERE cs.student_id = ?
            ORDER BY s.id DESC
        `;
        const sessions = await queryDb.all(sql, [req.params.studentId]);
        res.json(sessions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get session details
app.get('/api/sessions/:id', async (req, res) => {
    try {
        const session = await queryDb.get('SELECT * FROM sessions WHERE id = ?', [req.params.id]);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        res.json(session);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create a new valid session in DB before joining via socket
app.post('/api/sessions', async (req, res) => {
    const { quiz_id, mode, name, class_id, time_limit } = req.body;
    try {
        const result = await queryDb.run(
            'INSERT INTO sessions (quiz_id, mode, status, name, class_id, time_limit) VALUES (?, ?, ?, ?, ?, ?)',
            [quiz_id, mode, 'active', name, class_id || null, time_limit || null]
        );
        res.json({ sessionId: result.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Finish a session
app.put('/api/sessions/:id/finish', async (req, res) => {
    try {
        await queryDb.run('UPDATE sessions SET status = "completed" WHERE id = ?', [req.params.id]);
        res.json({ message: 'Session completed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start an Async session (Personal Timer Start)
app.post('/api/sessions/:id/start', async (req, res) => {
    const { studentId } = req.body;
    try {
        const session = await queryDb.get('SELECT time_limit FROM sessions WHERE id = ?', [req.params.id]);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        // Check if student already started
        let submission = await queryDb.get(
            'SELECT * FROM session_submissions WHERE session_id = ? AND student_id = ?',
            [req.params.id, studentId]
        );

        if (!submission) {
            // First time loading -> Record start time
            await queryDb.run(
                'INSERT INTO session_submissions (session_id, student_id, started_at) VALUES (?, ?, datetime("now", "utc"))',
                [req.params.id, studentId]
            );
            submission = await queryDb.get(
                'SELECT * FROM session_submissions WHERE session_id = ? AND student_id = ?',
                [req.params.id, studentId]
            );
        }

        // Return current server UTC time alongside the started_at time
        const nowObj = await queryDb.get('SELECT datetime("now", "utc") as now');

        res.json({
            startedAt: submission.started_at,
            serverNow: nowObj.now,
            timeLimit: session.time_limit,
            isSubmitted: submission.submitted_at !== null
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Check if a student has submitted an Async session
app.get('/api/sessions/:id/submission/:studentId', async (req, res) => {
    try {
        const submission = await queryDb.get(
            'SELECT * FROM session_submissions WHERE session_id = ? AND student_id = ?',
            [req.params.id, req.params.studentId]
        );
        res.json({ isSubmitted: !!submission });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Submit an Async session
app.post('/api/sessions/:id/submit', async (req, res) => {
    const { studentId } = req.body;
    try {
        // Find existing record to update the completion timestamp, or insert if missing (though the start endpoint should have created it)
        const existing = await queryDb.get('SELECT * FROM session_submissions WHERE session_id = ? AND student_id = ?', [req.params.id, studentId]);

        if (existing) {
            await queryDb.run(
                'UPDATE session_submissions SET submitted_at = datetime("now", "utc") WHERE session_id = ? AND student_id = ?',
                [req.params.id, studentId]
            );
        } else {
            await queryDb.run(
                'INSERT INTO session_submissions (session_id, student_id, submitted_at) VALUES (?, ?, datetime("now", "utc"))',
                [req.params.id, studentId]
            );
        }
        res.json({ message: 'Session submitted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Archive a session (instead of fully deleting)
app.put('/api/sessions/:id/archive', async (req, res) => {
    try {
        await queryDb.run('UPDATE sessions SET is_archived = 1 WHERE id = ?', [req.params.id]);
        res.json({ message: 'Session archived successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get student's review results for a session
app.get('/api/sessions/:id/results/:studentId', async (req, res) => {
    try {
        const session = await queryDb.get('SELECT quiz_id FROM sessions WHERE id = ?', [req.params.id]);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const questionsRows = await queryDb.all('SELECT id, text, type, image_url FROM questions WHERE quiz_id = ?', [session.quiz_id]);
        const finalResults = [];

        for (const q of questionsRows) {
            // Get all options to find the correct one
            const options = await queryDb.all('SELECT id, text, is_correct FROM options WHERE question_id = ?', [q.id]);
            const correctOption = options.find(o => o.is_correct === 1);

            // Get student's answer
            const response = await queryDb.get(
                'SELECT option_id FROM responses WHERE session_id = ? AND student_id = ? AND question_id = ?',
                [req.params.id, req.params.studentId, q.id]
            );

            let studentAnswerId = null;
            let studentAnswerText = null;
            let isCorrect = false;

            if (response) {
                studentAnswerId = response.option_id;
                const answeredOption = options.find(o => o.id === studentAnswerId);
                studentAnswerText = answeredOption ? answeredOption.text : 'Unknown';
                isCorrect = answeredOption ? answeredOption.is_correct === 1 : false;
            }

            finalResults.push({
                questionId: q.id,
                questionText: q.text,
                questionType: q.type,
                imageUrl: q.image_url,
                studentAnswerId,
                studentAnswerText: studentAnswerText || 'Did not answer',
                correctAnswerId: correctOption ? correctOption.id : null,
                correctAnswerText: correctOption ? correctOption.text : 'Unknown',
                options,
                isCorrect
            });
        }

        res.json({ results: finalResults });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get aggregated session results for the teacher
app.get('/api/sessions/:id/teacher-results', async (req, res) => {
    try {
        const session = await queryDb.get('SELECT * FROM sessions WHERE id = ?', [req.params.id]);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const quiz = await queryDb.get('SELECT title FROM quizzes WHERE id = ?', [session.quiz_id]);

        // Get questions and options
        const questionsRows = await queryDb.all('SELECT id, text, type, image_url FROM questions WHERE quiz_id = ?', [session.quiz_id]);
        const finalResults = {
            session: { ...session, quizTitle: quiz ? quiz.title : 'Unknown Quiz' },
            questions: [],
            participants: []
        };

        // Determine unique participants from responses and calculate their scores
        const participantRows = await queryDb.all(
            'SELECT DISTINCT u.id, u.username FROM responses r JOIN users u ON r.student_id = u.id WHERE r.session_id = ?',
            [session.id]
        );

        const totalQuestions = questionsRows.length;
        const participantsWithScores = [];

        for (const p of participantRows) {
            // Count how many correct answers this specific participant provided in this session
            const scoreRow = await queryDb.get(`
                SELECT COUNT(*) as score 
                FROM responses r 
                JOIN options o ON r.option_id = o.id 
                WHERE r.session_id = ? AND r.student_id = ? AND o.is_correct = 1
            `, [session.id, p.id]);

            const score = scoreRow ? scoreRow.score : 0;
            const percentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

            participantsWithScores.push({
                ...p,
                score,
                totalQuestions,
                percentage
            });
        }

        // Sort by score descending
        participantsWithScores.sort((a, b) => b.score - a.score);

        finalResults.participants = participantsWithScores;

        for (const q of questionsRows) {
            const options = await queryDb.all('SELECT id, text, is_correct FROM options WHERE question_id = ?', [q.id]);

            // Get all responses for this question in this session
            const responsesRows = await queryDb.all(
                'SELECT option_id, COUNT(*) as count FROM responses WHERE session_id = ? AND question_id = ? GROUP BY option_id',
                [session.id, q.id]
            );

            // Map counts to options
            const optionsWithCounts = options.map(opt => {
                const r = responsesRows.find(row => row.option_id === opt.id);
                return { ...opt, count: r ? r.count : 0 };
            });

            finalResults.questions.push({
                questionId: q.id,
                questionText: q.text,
                questionType: q.type,
                imageUrl: q.image_url,
                options: optionsWithCounts
            });
        }

        res.json(finalResults);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Real-time Session State Management
const activeSessions = {}; // Maps sessionId to its state

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Join a quiz session
    socket.on('join_session', async ({ sessionId, userId, role }) => {
        socket.join(`session_${sessionId}`);

        // Initialize session state if not exists
        if (!activeSessions[sessionId]) {
            activeSessions[sessionId] = {
                participants: new Set(),
                currentQuestionIndex: 0,
                results: {} // questionId -> optionId -> count
            };
        }

        if (role === 'student') {
            activeSessions[sessionId].participants.add(userId);
            // Notify teacher of participant count change
            io.to(`session_${sessionId}`).emit('participants_update', {
                count: activeSessions[sessionId].participants.size
            });
        }

        // Send current session state to the newly connected user
        socket.emit('session_state', {
            currentQuestionIndex: activeSessions[sessionId].currentQuestionIndex,
            results: activeSessions[sessionId].results
        });
    });

    // Teacher moves to next question
    socket.on('next_question', ({ sessionId, newIndex }) => {
        if (activeSessions[sessionId]) {
            activeSessions[sessionId].currentQuestionIndex = newIndex;
            io.to(`session_${sessionId}`).emit('question_changed', { newIndex });
        }
    });

    // Student submits an answer
    socket.on('submit_answer', async ({ sessionId, studentId, questionId, optionId }) => {
        try {
            await queryDb.run(
                'INSERT OR REPLACE INTO responses (session_id, student_id, question_id, option_id) VALUES (?, ?, ?, ?)',
                [sessionId, studentId, questionId, optionId]
            );

            if (!activeSessions[sessionId]) return;
            if (!activeSessions[sessionId].results[questionId]) {
                activeSessions[sessionId].results[questionId] = {};
            }
            if (!activeSessions[sessionId].results[questionId][optionId]) {
                activeSessions[sessionId].results[questionId][optionId] = 0;
            }
            activeSessions[sessionId].results[questionId][optionId]++;

            io.to(`session_${sessionId}`).emit('results_update', {
                questionId,
                results: activeSessions[sessionId].results[questionId]
            });
        } catch (e) {
            console.error('Error recording answer:', e);
        }
    });

    // Student submits a Short Answer text
    socket.on('submit_answer_text', async ({ sessionId, studentId, questionId, text }) => {
        try {
            if (!text || text.trim() === '') return;

            // 1. Check if the text matches the correct option (case insensitive)
            const options = await queryDb.all('SELECT id, text FROM options WHERE question_id = ?', [questionId]);
            const correctOpt = options[0]; // Short answer has 1 correct option

            let targetOptionId;
            const isMatch = correctOpt && text.trim().toLowerCase() === correctOpt.text.trim().toLowerCase();

            if (isMatch) {
                targetOptionId = correctOpt.id;
            } else {
                // If wrong, we need to record what they typed. We will generate a "dummy/incorrect" option on the fly 
                // just so it shows up in the charts and results accurately.
                // First check if this exact wrong answer already exists as an option for this question
                let existingWrongOpt = options.find(o => o.text.trim().toLowerCase() === text.trim().toLowerCase());

                if (existingWrongOpt) {
                    targetOptionId = existingWrongOpt.id;
                } else {
                    // Create it!
                    const newOpt = await queryDb.run(
                        'INSERT INTO options (question_id, text, is_correct) VALUES (?, ?, 0)',
                        [questionId, text.trim()]
                    );
                    targetOptionId = newOpt.id;
                }
            }

            // Record response
            await queryDb.run(
                'INSERT OR REPLACE INTO responses (session_id, student_id, question_id, option_id) VALUES (?, ?, ?, ?)',
                [sessionId, studentId, questionId, targetOptionId]
            );

            // Update live state
            if (!activeSessions[sessionId]) return;
            if (!activeSessions[sessionId].results[questionId]) {
                activeSessions[sessionId].results[questionId] = {};
            }
            if (!activeSessions[sessionId].results[questionId][targetOptionId]) {
                activeSessions[sessionId].results[questionId][targetOptionId] = 0;
            }
            activeSessions[sessionId].results[questionId][targetOptionId]++;

            io.to(`session_${sessionId}`).emit('results_update', {
                questionId,
                results: activeSessions[sessionId].results[questionId]
            });
        } catch (e) {
            console.error('Error recording text answer:', e);
        }
    });

    // Teacher finishes the session broadcast
    socket.on('finish_session', ({ sessionId }) => {
        io.to(`session_${sessionId}`).emit('session_finished');
        delete activeSessions[sessionId];
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// New endpoint for async session start tracking
app.post('/api/sessions/:id/start', async (req, res) => {
    try {
        const sessionId = req.params.id;
        const { studentId } = req.body;

        if (!studentId) {
            return res.status(400).json({ error: 'studentId is required' });
        }

        // Get session time_limit
        const session = await queryDb.get('SELECT time_limit FROM sessions WHERE id = ?', [sessionId]);
        if (!session) {
            return res.status(404).json({ error: 'Session not found' });
        }
        const timeLimit = session.time_limit;

        // Check if student has already started this session
        let submission = await queryDb.get(
            'SELECT started_at FROM session_submissions WHERE session_id = ? AND student_id = ?',
            [sessionId, studentId]
        );

        let startedAt;
        if (!submission) {
            // If not, record the start time
            const now = new Date().toISOString();
            await queryDb.run(
                'INSERT INTO session_submissions (session_id, student_id, started_at) VALUES (?, ?, ?)',
                [sessionId, studentId, now]
            );
            startedAt = now;
        } else {
            startedAt = submission.started_at;
        }

        res.json({
            startedAt,
            serverNow: new Date().toISOString(),
            timeLimit
        });
    } catch (error) {
        console.error('Error starting async session for student:', error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
