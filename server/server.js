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

// Global Logging for debugging Windows deployment
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
    next();
});

import apiRoutes, { authorize } from './api.js';
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

// Get all sessions (Admin only)
app.get('/api/sessions', authorize(['admin']), async (req, res) => {
    try {
        const sessions = await queryDb.all('SELECT * FROM sessions ORDER BY id DESC');
        res.json(sessions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get sessions for a specific teacher's quizzes
app.get('/api/sessions/teacher/:teacherId', authorize(['admin', 'teacher']), async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        const userRole = req.headers['x-user-role'];

        // Teachers can only see their own sessions
        if (userRole === 'teacher' && userId !== req.params.teacherId) {
            return res.status(403).json({ error: 'Forbidden: You can only view your own sessions' });
        }

        const sessions = await queryDb.all(`
            SELECT s.*, q.title as quiz_title, c.name as class_name, s.created_at
            FROM sessions s
            JOIN quizzes q ON s.quiz_id = q.id
            LEFT JOIN classes c ON s.class_id = c.id
            WHERE q.author_id = ?
            ORDER BY s.id DESC
        `, [req.params.teacherId]);
        res.json(sessions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get active sessions for a specific student (filtered by their enrolled classes)
app.get('/api/sessions/student/:studentId', authorize(['admin', 'teacher', 'student']), async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        const userRole = req.headers['x-user-role'];

        // Students can only see their own sessions
        if (userRole === 'student' && userId !== req.params.studentId) {
            return res.status(403).json({ error: 'Forbidden: You can only view your own sessions' });
        }

        const sql = `
            SELECT s.*, q.title as quiz_title, c.name as class_name, t.username as teacher_name, 
                   CASE WHEN sub.student_id IS NOT NULL THEN 1 ELSE 0 END as is_submitted,
                   sub.submitted_at
            FROM sessions s
            JOIN quizzes q ON s.quiz_id = q.id
            JOIN classes c ON s.class_id = c.id
            JOIN class_students cs ON c.id = cs.class_id
            JOIN users t ON c.teacher_id = t.id
            LEFT JOIN session_submissions sub ON s.id = sub.session_id AND sub.student_id = cs.student_id
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

// Function to generate 8-char code
function generateJoinCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        if (i === 4) code += '-';
        else code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Create a new valid session in DB before joining via socket
app.post('/api/sessions', authorize(['admin', 'teacher']), async (req, res) => {
    const { quiz_id, mode, name, class_id, time_limit, randomize_questions, shuffle_options, is_team_mode } = req.body;
    console.log(`--- Creating Session: "${name}" (Quiz: ${quiz_id}, Class: ${class_id}) ---`);
    try {
        let isUnique = false;
        let join_code = '';
        while (!isUnique) {
            join_code = generateJoinCode();
            const existing = await queryDb.get('SELECT id FROM sessions WHERE join_code = ?', [join_code]);
            if (!existing) isUnique = true;
        }

        const result = await queryDb.run(
            'INSERT INTO sessions (quiz_id, mode, status, name, class_id, time_limit, randomize_questions, shuffle_options, is_team_mode, join_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [quiz_id, mode, 'active', name, class_id || null, time_limit || null, randomize_questions ? 1 : 0, shuffle_options ? 1 : 0, is_team_mode ? 1 : 0, join_code]
        );
        console.log(`Success: Session created with ID ${result.id} and Code ${join_code}`);
        res.json({ sessionId: result.id, join_code });
    } catch (error) {
        console.error('ERROR during session creation:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Join session by code
app.get('/api/sessions/join/:code', async (req, res) => {
    try {
        const session = await queryDb.get(
            `SELECT s.*, q.title as quiz_title 
             FROM sessions s 
             JOIN quizzes q ON s.quiz_id = q.id 
             WHERE s.join_code = ? AND s.status = 'active' AND s.is_archived = 0`,
            [req.params.code.toUpperCase()]
        );
        if (!session) return res.status(404).json({ error: 'Session not found or no longer active' });
        res.json(session);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Finish a session
app.put('/api/sessions/:id/finish', authorize(['admin', 'teacher']), async (req, res) => {
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
    try {
        const { studentId } = req.body;
        const sessionId = req.params.id;

        let badgesJson = '[]';
        if (activeSessions[sessionId] && activeSessions[sessionId].earnedBadges[studentId]) {
            const badges = Array.from(activeSessions[sessionId].earnedBadges[studentId]);
            badgesJson = JSON.stringify(badges);
        }

        await queryDb.run(
            'INSERT OR REPLACE INTO session_submissions (session_id, student_id, badges, submitted_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
            [sessionId, studentId, badgesJson]
        );
        res.json({ message: 'Submission successful' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Archive a session (instead of fully deleting)
app.put('/api/sessions/:id/archive', authorize(['admin', 'teacher']), async (req, res) => {
    try {
        await queryDb.run('UPDATE sessions SET is_archived = 1 WHERE id = ?', [req.params.id]);
        res.json({ message: 'Session archived successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get student's review results for a session
app.get('/api/sessions/:id/results/:studentId', authorize(['admin', 'teacher', 'student']), async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        const userRole = req.headers['x-user-role'];

        // Students can only see their own results
        if (userRole === 'student' && userId !== req.params.studentId) {
            return res.status(403).json({ error: 'Forbidden: You can only view your own results' });
        }
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

        const pointsRow = await queryDb.get(
            'SELECT SUM(points_earned) as totalPoints FROM responses WHERE session_id = ? AND student_id = ?',
            [req.params.id, req.params.studentId]
        );

        const subRow = await queryDb.get(
            'SELECT badges FROM session_submissions WHERE session_id = ? AND student_id = ?',
            [req.params.id, req.params.studentId]
        );

        res.json({
            results: finalResults,
            totalPoints: pointsRow ? (pointsRow.totalPoints || 0) : 0,
            badges: subRow ? JSON.parse(subRow.badges || '[]') : []
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get aggregated session results for the teacher
app.get('/api/sessions/:id/teacher-results', authorize(['admin', 'teacher']), async (req, res) => {
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
                explanation: q.explanation,
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

function getSessionRoom(sessionId) {
    return `session_${sessionId}`;
}

function getTeacherRoom(sessionId) {
    return `session_${sessionId}_teachers`;
}

function getUserRoom(sessionId, userId) {
    return `session_${sessionId}_user_${userId}`;
}

function buildAnsweredArrays(answeredStudents = {}) {
    const answeredArrays = {};
    for (const [questionId, studentSet] of Object.entries(answeredStudents)) {
        answeredArrays[questionId] = Array.from(studentSet);
    }
    return answeredArrays;
}

function buildTeacherSessionState(sessionState) {
    return {
        currentQuestionIndex: sessionState.currentQuestionIndex,
        results: sessionState.results,
        answeredStudents: buildAnsweredArrays(sessionState.answeredStudents),
        locked: sessionState.locked,
        timerStart: sessionState.timerStart,
        timerDuration: sessionState.timerDuration,
        timerQuestionIndex: sessionState.timerQuestionIndex,
        isTeamMode: sessionState.isTeamMode,
        teamScores: sessionState.teamScores,
        individualScores: sessionState.individualScores,
        streaks: sessionState.streaks
    };
}

function buildStudentSessionState(sessionState, userId) {
    return {
        currentQuestionIndex: sessionState.currentQuestionIndex,
        locked: sessionState.locked,
        timerStart: sessionState.timerStart,
        timerDuration: sessionState.timerDuration,
        timerQuestionIndex: sessionState.timerQuestionIndex,
        isTeamMode: sessionState.isTeamMode,
        teamScores: sessionState.isTeamMode ? sessionState.teamScores : null,
        myScore: sessionState.individualScores[userId] || 0,
        myStreak: sessionState.streaks[userId] || 0
    };
}

function emitParticipantsUpdate(sessionId) {
    const sessionState = activeSessions[sessionId];
    if (!sessionState) return;

    io.to(getTeacherRoom(sessionId)).emit('participants_update', {
        count: sessionState.participants.size,
        details: sessionState.participantDetails
    });
}

function emitTeacherScoreUpdate(sessionId, studentId) {
    const sessionState = activeSessions[sessionId];
    if (!sessionState) return;

    io.to(getTeacherRoom(sessionId)).emit('student_score_update', {
        studentId,
        individualScores: sessionState.individualScores,
        streaks: sessionState.streaks
    });
}

function emitStudentScoreUpdate(sessionId, studentId) {
    const sessionState = activeSessions[sessionId];
    if (!sessionState) return;

    io.to(getUserRoom(sessionId, studentId)).emit('student_score_update', {
        studentId,
        myScore: sessionState.individualScores[studentId] || 0,
        myStreak: sessionState.streaks[studentId] || 0
    });
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Join a quiz session
    socket.on('join_session', async ({ sessionId, userId, username, role }) => {
        socket.join(getSessionRoom(sessionId));
        if (role === 'teacher') {
            socket.join(getTeacherRoom(sessionId));
        }
        if (userId !== undefined && userId !== null) {
            socket.join(getUserRoom(sessionId, userId));
        }

        // Initialize session state if not exists
        if (!activeSessions[sessionId]) {
            // Fetch session configuration from DB
            let isTeamMode = 0;
            try {
                const sessionRecord = await queryDb.get('SELECT is_team_mode FROM sessions WHERE id = ?', [sessionId]);
                if (sessionRecord) {
                    isTeamMode = sessionRecord.is_team_mode;
                }
            } catch (err) {
                console.error("Error fetching session for team mode:", err);
            }

            activeSessions[sessionId] = {
                participants: new Set(),
                participantDetails: {}, // userId -> username
                currentQuestionIndex: 0,
                results: {}, // questionId -> optionId -> count
                answeredStudents: {}, // questionId -> Set of userIds
                locked: false,
                timerStart: null,
                timerDuration: null,
                timerQuestionIndex: null,
                isTeamMode: isTeamMode === 1,
                teams: {}, // userId -> teamName ('Red', 'Blue', 'Green', 'Yellow')
                teamScores: { 'Red': 0, 'Blue': 0, 'Green': 0, 'Yellow': 0 },
                individualScores: {}, // userId -> total score
                streaks: {}, // userId -> consecutive correct answers
                questionStartTime: Date.now(), // Track when the question was shown for dynamic scoring
                firstToAnswer: false, // Flag to track if someone has answered the current question correctly yet
                earnedBadges: {} // userId -> Set of badge names
            };
        }

        if (role === 'student') {
            activeSessions[sessionId].participants.add(userId);
            if (username) {
                activeSessions[sessionId].participantDetails[userId] = username;
            }

            // Assign to team if in Team Mode and not already assigned
            if (activeSessions[sessionId].isTeamMode && !activeSessions[sessionId].teams[userId]) {
                const availableTeams = ['Red', 'Blue', 'Green', 'Yellow'];
                // Simple random assignment for now. Could balance based on current team sizes.
                const randomTeam = availableTeams[Math.floor(Math.random() * availableTeams.length)];
                activeSessions[sessionId].teams[userId] = randomTeam;
            }

            emitParticipantsUpdate(sessionId);

            // Send standard student joining state, including their team assignment
            socket.emit('assigned_team', { team: activeSessions[sessionId].teams[userId] });
        }

        if (role === 'teacher') {
            socket.emit('session_state', buildTeacherSessionState(activeSessions[sessionId]));
        } else {
            socket.emit('session_state', buildStudentSessionState(activeSessions[sessionId], userId));
        }
    });

    // Teacher moves to next question
    socket.on('next_question', ({ sessionId, newIndex }) => {
        if (activeSessions[sessionId]) {
            activeSessions[sessionId].currentQuestionIndex = newIndex;
            activeSessions[sessionId].locked = false;
            activeSessions[sessionId].timerStart = null;
            activeSessions[sessionId].timerDuration = null;
            activeSessions[sessionId].questionStartTime = Date.now();
            activeSessions[sessionId].firstToAnswer = false;
            io.to(getSessionRoom(sessionId)).emit('question_changed', { newIndex });
        }
    });

    // Teacher toggles question lock
    socket.on('toggle_lock', ({ sessionId, locked }) => {
        if (activeSessions[sessionId]) {
            activeSessions[sessionId].locked = locked;
            io.to(getSessionRoom(sessionId)).emit('question_locked', { locked });
        }
    });

    // Teacher starts a timer for current question
    socket.on('start_question_timer', ({ sessionId, durationSeconds, autoAdvance }) => {
        if (activeSessions[sessionId]) {
            activeSessions[sessionId].timerStart = Date.now();
            activeSessions[sessionId].timerDuration = durationSeconds;
            activeSessions[sessionId].timerQuestionIndex = activeSessions[sessionId].currentQuestionIndex;
            io.to(getSessionRoom(sessionId)).emit('timer_started', {
                duration: durationSeconds,
                startedAt: activeSessions[sessionId].timerStart,
                autoAdvance
            });
        }
    });

    // Student submits an answer
    socket.on('submit_answer', async ({ sessionId, studentId, questionId, optionId }) => {
        if (activeSessions[sessionId] && activeSessions[sessionId].locked) return;
        try {
            await queryDb.run(
                'INSERT OR REPLACE INTO responses (session_id, student_id, question_id, option_id, points_earned) VALUES (?, ?, ?, ?, ?)',
                [sessionId, studentId, questionId, optionId, 0] // Default to 0, will update if correct
            );

            if (!activeSessions[sessionId]) return;
            if (!activeSessions[sessionId].results[questionId]) {
                activeSessions[sessionId].results[questionId] = {};
            }
            if (!activeSessions[sessionId].results[questionId][optionId]) {
                activeSessions[sessionId].results[questionId][optionId] = 0;
            }
            activeSessions[sessionId].results[questionId][optionId]++;

            if (!activeSessions[sessionId].answeredStudents[questionId]) {
                activeSessions[sessionId].answeredStudents[questionId] = new Set();
            }
            activeSessions[sessionId].answeredStudents[questionId].add(studentId);

            // Update team scores if in Team Mode
            let pointsEarned = 0;
            const optRecord = await queryDb.get('SELECT is_correct FROM options WHERE id = ?', [optionId]);

            if (optRecord && optRecord.is_correct === 1) {
                // Determine streak and badges
                if (!activeSessions[sessionId].streaks[studentId]) {
                    activeSessions[sessionId].streaks[studentId] = 0;
                }
                activeSessions[sessionId].streaks[studentId] += 1;
                const currentStreak = activeSessions[sessionId].streaks[studentId];

                if (currentStreak >= 3) {
                    const badgeName = 'On Fire! 🔥';
                    if (!activeSessions[sessionId].earnedBadges[studentId]) {
                        activeSessions[sessionId].earnedBadges[studentId] = new Set();
                    }
                    activeSessions[sessionId].earnedBadges[studentId].add(badgeName);

                    io.to(getUserRoom(sessionId, studentId)).emit('badge_earned', {
                        studentId,
                        badge: badgeName,
                        streak: currentStreak
                    });
                }

                if (!activeSessions[sessionId].firstToAnswer) {
                    activeSessions[sessionId].firstToAnswer = true;
                    const badgeName = 'Quick Draw ⚡';
                    if (!activeSessions[sessionId].earnedBadges[studentId]) {
                        activeSessions[sessionId].earnedBadges[studentId] = new Set();
                    }
                    activeSessions[sessionId].earnedBadges[studentId].add(badgeName);

                    io.to(getUserRoom(sessionId, studentId)).emit('badge_earned', {
                        studentId,
                        badge: badgeName
                    });
                }

                // Calculate Dynamic Points based on time
                const maxPoints = 1000;
                // Min 500 points for a correct answer, decay over 10 seconds (10000ms) down to 500
                const timeTaken = Date.now() - (activeSessions[sessionId].questionStartTime || Date.now());
                const timeRatio = Math.min(Math.max(timeTaken / 10000, 0), 1); // 0 to 1
                const basePoints = Math.round(maxPoints - ((maxPoints - 500) * timeRatio));

                // Add a small streak multiplier (e.g. 10% bonus for streak > 1)
                const multiplier = currentStreak > 1 ? 1 + (Math.min(currentStreak, 5) * 0.1) : 1;
                pointsEarned = Math.round(basePoints * multiplier);

                if (!activeSessions[sessionId].individualScores[studentId]) {
                    activeSessions[sessionId].individualScores[studentId] = 0;
                }
                activeSessions[sessionId].individualScores[studentId] += pointsEarned;

                // Persist the points earned to the DB
                await queryDb.run(
                    'UPDATE responses SET points_earned = ? WHERE session_id = ? AND student_id = ? AND question_id = ?',
                    [pointsEarned, sessionId, studentId, questionId]
                );

                if (activeSessions[sessionId].isTeamMode) {
                    const studentTeam = activeSessions[sessionId].teams[studentId];
                    if (studentTeam) {
                        activeSessions[sessionId].teamScores[studentTeam] += pointsEarned;
                        io.to(getSessionRoom(sessionId)).emit('team_scores_update', {
                            teamScores: activeSessions[sessionId].teamScores
                        });
                    }
                }

                emitTeacherScoreUpdate(sessionId, studentId);
                emitStudentScoreUpdate(sessionId, studentId);
            } else {
                // Reset streak on wrong answer
                activeSessions[sessionId].streaks[studentId] = 0;
                emitTeacherScoreUpdate(sessionId, studentId);
                emitStudentScoreUpdate(sessionId, studentId);
            }

            io.to(getTeacherRoom(sessionId)).emit('results_update', {
                questionId,
                results: activeSessions[sessionId].results[questionId],
                answered: Array.from(activeSessions[sessionId].answeredStudents[questionId])
            });
        } catch (e) {
            console.error('Error recording answer:', e);
        }
    });

    // Student submits a Short Answer text
    socket.on('submit_answer_text', async ({ sessionId, studentId, questionId, text }) => {
        if (activeSessions[sessionId] && activeSessions[sessionId].locked) return;
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

            if (!activeSessions[sessionId].answeredStudents[questionId]) {
                activeSessions[sessionId].answeredStudents[questionId] = new Set();
            }
            activeSessions[sessionId].answeredStudents[questionId].add(studentId);

            // Dynamic Scoring Logic for Short Answer
            let pointsEarned = 0;
            if (isMatch) { // We ALREADY checked if correct earlier in this function
                // Determine streak and badges
                if (!activeSessions[sessionId].streaks[studentId]) {
                    activeSessions[sessionId].streaks[studentId] = 0;
                }
                activeSessions[sessionId].streaks[studentId] += 1;
                const currentStreak = activeSessions[sessionId].streaks[studentId];

                if (currentStreak >= 3) {
                    io.to(getUserRoom(sessionId, studentId)).emit('badge_earned', {
                        studentId,
                        badge: 'On Fire! 🔥',
                        streak: currentStreak
                    });
                }

                if (!activeSessions[sessionId].firstToAnswer) {
                    activeSessions[sessionId].firstToAnswer = true;
                    io.to(getUserRoom(sessionId, studentId)).emit('badge_earned', {
                        studentId,
                        badge: 'Quick Draw ⚡'
                    });
                }

                // Calculate Dynamic Points based on time
                const maxPoints = 1000;
                const timeTaken = Date.now() - (activeSessions[sessionId].questionStartTime || Date.now());
                const timeRatio = Math.min(Math.max(timeTaken / 10000, 0), 1);
                const basePoints = Math.round(maxPoints - ((maxPoints - 500) * timeRatio));

                const multiplier = currentStreak > 1 ? 1 + (Math.min(currentStreak, 5) * 0.1) : 1;
                pointsEarned = Math.round(basePoints * multiplier);

                if (!activeSessions[sessionId].individualScores[studentId]) {
                    activeSessions[sessionId].individualScores[studentId] = 0;
                }
                activeSessions[sessionId].individualScores[studentId] += pointsEarned;

                if (activeSessions[sessionId].isTeamMode) {
                    const studentTeam = activeSessions[sessionId].teams[studentId];
                    if (studentTeam) {
                        activeSessions[sessionId].teamScores[studentTeam] += pointsEarned;
                        io.to(getSessionRoom(sessionId)).emit('team_scores_update', {
                            teamScores: activeSessions[sessionId].teamScores
                        });
                    }
                }

                emitTeacherScoreUpdate(sessionId, studentId);
                emitStudentScoreUpdate(sessionId, studentId);
            } else {
                // Reset streak on wrong answer
                activeSessions[sessionId].streaks[studentId] = 0;
                emitTeacherScoreUpdate(sessionId, studentId);
                emitStudentScoreUpdate(sessionId, studentId);
            }

            io.to(getTeacherRoom(sessionId)).emit('results_update', {
                questionId,
                results: activeSessions[sessionId].results[questionId],
                answered: Array.from(activeSessions[sessionId].answeredStudents[questionId])
            });
        } catch (e) {
            console.error('Error recording text answer:', e);
        }
    });

    // Teacher finishes the session broadcast
    socket.on('finish_session', ({ sessionId }) => {
        io.to(getSessionRoom(sessionId)).emit('session_finished');
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

// --- Production Frontend Serving ---
const clientDistPath = join(__dirname, '../client/dist');
console.log('Serving static files from:', clientDistPath);
app.use(express.static(clientDistPath));

// Catch-all to route any unknown requests back to React (for React Router SPA)
app.get('*', (req, res) => {
    // Only serve index.html if it's not an API route
    if (!req.path.startsWith('/api')) {
        res.sendFile(join(clientDistPath, 'index.html'), (err) => {
            if (err) {
                res.status(500).send("<h3>Frontend build not found!</h3><p>Please ensure you have run <code>npm run build</code> inside the <code>client</code> folder and that the <code>dist</code> folder was copied to the server.</p>");
            }
        });
    } else {
        res.status(404).json({ error: 'API route not found' });
    }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
