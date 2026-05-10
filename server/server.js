import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';
import { logAuditEvent, queryDb } from './database.js';
import apiRoutes from './api.js';
import { authenticateRequest, authenticateSocket, authorize } from './auth.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const RETAKE_WAIT_MS = 7 * 24 * 60 * 60 * 1000;

// Global Logging for debugging Windows deployment
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`);
    next();
});

// CRITICAL: Global Error Handlers to prevent server crashes on Windows
process.on('uncaughtException', (err) => {
    console.error('FATAL UNCAUGHT EXCEPTION:', err);
    // Don't exit immediately so the user can see the log
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
});

app.use(authenticateRequest);
app.use('/api', apiRoutes);

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*', // For local development, allow all origins
    },
    transports: ['websocket', 'polling'], // Allow both but prefer WS
    pingTimeout: 60000,    // Increase timeout for Windows stability
    pingInterval: 25000
});

io.use(authenticateSocket);

async function canTeacherManageSession(userId, sessionId) {
    const row = await queryDb.get(`
        SELECT s.id
        FROM sessions s
        JOIN quizzes q ON q.id = s.quiz_id
        WHERE s.id = ? AND q.author_id = ?
    `, [sessionId, userId]);
    return !!row;
}

// Check if a session has expired based on expires_at and update its status if so
async function checkSessionExpiry(session) {
    if (!session || session.status !== 'active' || !session.expires_at) return session;

    const expiryDate = new Date(session.expires_at);
    if (expiryDate < new Date()) {
        console.log(`[AUTO-CLOSE] Session ${session.id} ("${session.name}") has reached its expiry time (${session.expires_at}). Marking as completed.`);
        await queryDb.run("UPDATE sessions SET status = 'completed' WHERE id = ?", [session.id]);
        return { ...session, status: 'completed' };
    }
    return session;
}

async function canStudentAccessSession(studentId, sessionId) {
    const row = await queryDb.get(`
        SELECT s.id
        FROM sessions s
        LEFT JOIN class_students cs ON cs.class_id = s.class_id AND cs.student_id = ?
        LEFT JOIN session_submissions sub ON sub.session_id = s.id AND sub.student_id = ?
        WHERE s.id = ? AND (cs.student_id IS NOT NULL OR sub.student_id IS NOT NULL OR s.class_id IS NULL)
    `, [studentId, studentId, sessionId]);
    return !!row;
}

function getQuestionAccuracy(questions) {
    if (!questions.length) return 0;
    const correctCount = questions.filter((question) => question.isCorrect).length;
    return correctCount / questions.length;
}

async function getOrderedQuestionPerformance(sessionId, studentId) {
    return queryDb.all(`
        SELECT
            q.id AS question_id,
            q.order_idx,
            CASE WHEN r.option_id IS NOT NULL THEN 1 ELSE 0 END AS answered,
            CASE WHEN o.is_correct = 1 THEN 1 ELSE 0 END AS is_correct
        FROM sessions s
        JOIN questions q ON q.quiz_id = s.quiz_id
        LEFT JOIN responses r
            ON r.session_id = s.id
           AND r.student_id = ?
           AND r.question_id = q.id
        LEFT JOIN options o ON o.id = r.option_id
        WHERE s.id = ?
        ORDER BY q.order_idx ASC, q.id ASC
    `, [studentId, sessionId]);
}

async function getStoredBadgeList(sessionId, studentId) {
    const row = await queryDb.get(
        'SELECT badges FROM session_submissions WHERE session_id = ? AND student_id = ?',
        [sessionId, studentId]
    );
    if (!row?.badges) return [];

    try {
        const parsed = JSON.parse(row.badges);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function calculateComebackBadges(questionPerformance) {
    const badges = [];
    if (!questionPerformance.length) return badges;

    const normalized = questionPerformance.map((question) => ({
        answered: question.answered === 1,
        isCorrect: question.is_correct === 1
    }));
    const totalQuestions = normalized.length;
    const lastQuestion = normalized[totalQuestions - 1];
    const midpoint = Math.floor(totalQuestions / 2);
    const firstHalf = normalized.slice(0, midpoint);
    const secondHalf = normalized.slice(midpoint);
    const firstHalfCorrect = firstHalf.filter((question) => question.isCorrect).length;
    const secondHalfCorrect = secondHalf.filter((question) => question.isCorrect).length;
    const firstHalfAccuracy = getQuestionAccuracy(firstHalf);
    const secondHalfAccuracy = getQuestionAccuracy(secondHalf);
    const earlierMisses = normalized.slice(0, -1).some((question) => !question.isCorrect);

    if (lastQuestion?.isCorrect && earlierMisses) {
        badges.push('Clutch 🎯');
    }

    if (
        secondHalf.length >= 2 &&
        secondHalfCorrect >= Math.max(2, Math.ceil(secondHalf.length * 0.67)) &&
        secondHalfAccuracy >= 0.67 &&
        secondHalfAccuracy > firstHalfAccuracy
    ) {
        badges.push('Late Surge 🚀');
    }

    if (
        totalQuestions >= 4 &&
        secondHalf.length >= 2 &&
        secondHalfCorrect >= firstHalfCorrect + 2 &&
        (secondHalfAccuracy - firstHalfAccuracy) >= 0.3
    ) {
        badges.push('Most Improved 📈');
    }

    return badges;
}

function ensureEarnedBadgeSet(sessionData, studentId) {
    if (!sessionData.earnedBadges[studentId]) {
        sessionData.earnedBadges[studentId] = new Set();
    }
    return sessionData.earnedBadges[studentId];
}

function awardLiveBadge(sessionId, studentId, badgeName, extra = {}) {
    const sessionData = activeSessions[sessionId];
    if (!sessionData) return;

    const badgeSet = ensureEarnedBadgeSet(sessionData, studentId);
    if (badgeSet.has(badgeName)) return;

    badgeSet.add(badgeName);
    io.to(`session_${sessionId}`).emit('badge_earned', {
        studentId,
        badge: badgeName,
        ...extra
    });
}

async function buildSubmissionBadges(sessionId, studentId, liveBadges = []) {
    const [storedBadges, questionPerformance] = await Promise.all([
        getStoredBadgeList(sessionId, studentId),
        getOrderedQuestionPerformance(sessionId, studentId)
    ]);
    const comebackBadges = calculateComebackBadges(questionPerformance);

    return Array.from(new Set([
        ...storedBadges,
        ...liveBadges,
        ...comebackBadges
    ]));
}

function parseDatabaseDate(value) {
    if (!value) return null;
    const normalized = String(value).includes('T')
        ? String(value)
        : `${String(value).replace(' ', 'T')}Z`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function getBaseCompletionDate(sessionId, studentId) {
    const submission = await queryDb.get(
        'SELECT submitted_at FROM session_submissions WHERE session_id = ? AND student_id = ?',
        [sessionId, studentId]
    );
    const submittedAt = parseDatabaseDate(submission?.submitted_at);
    if (submittedAt) return submittedAt;

    const lastResponse = await queryDb.get(
        'SELECT MAX(timestamp) as completed_at FROM responses WHERE session_id = ? AND student_id = ?',
        [sessionId, studentId]
    );
    return parseDatabaseDate(lastResponse?.completed_at);
}

async function getLatestSubmittedRetake(sessionId, studentId) {
    return queryDb.get(`
        SELECT *
        FROM session_attempts
        WHERE session_id = ? AND student_id = ? AND status = 'submitted' AND is_official = 1
        ORDER BY attempt_number DESC, id DESC
        LIMIT 1
    `, [sessionId, studentId]);
}

async function getAttemptScoreSummary(sessionId, studentId) {
    const session = await queryDb.get('SELECT quiz_id FROM sessions WHERE id = ?', [sessionId]);
    if (!session) return null;

    const totalRow = await queryDb.get(
        'SELECT COUNT(*) as totalQuestions FROM questions WHERE quiz_id = ?',
        [session.quiz_id]
    );
    const totalQuestions = totalRow?.totalQuestions || 0;

    const originalRow = await queryDb.get(`
        SELECT COUNT(*) as correct
        FROM responses r
        JOIN options o ON o.id = r.option_id
        WHERE r.session_id = ? AND r.student_id = ? AND o.is_correct = 1
    `, [sessionId, studentId]);

    const baseCompletionDate = await getBaseCompletionDate(sessionId, studentId);
    const attempts = [{
        attemptNumber: 1,
        label: 'Original Attempt',
        correct: originalRow?.correct || 0,
        totalQuestions,
        percentage: totalQuestions > 0 ? Math.round(((originalRow?.correct || 0) / totalQuestions) * 100) : 0,
        submittedAt: baseCompletionDate ? baseCompletionDate.toISOString() : null,
        isRetake: false
    }];

    const retakeRows = await queryDb.all(`
        SELECT id, attempt_number, submitted_at
        FROM session_attempts
        WHERE session_id = ? AND student_id = ? AND status = 'submitted' AND is_official = 1
        ORDER BY attempt_number ASC, id ASC
    `, [sessionId, studentId]);

    for (const retake of retakeRows) {
        const scoreRow = await queryDb.get(`
            SELECT COUNT(*) as correct
            FROM attempt_responses ar
            JOIN options o ON o.id = ar.option_id
            WHERE ar.attempt_id = ? AND o.is_correct = 1
        `, [retake.id]);
        attempts.push({
            attemptNumber: retake.attempt_number,
            label: `Retake ${retake.attempt_number - 1}`,
            correct: scoreRow?.correct || 0,
            totalQuestions,
            percentage: totalQuestions > 0 ? Math.round(((scoreRow?.correct || 0) / totalQuestions) * 100) : 0,
            submittedAt: retake.submitted_at,
            isRetake: true
        });
    }

    const latest = attempts[attempts.length - 1];
    const original = attempts[0];

    return {
        original,
        latest,
        attempts,
        improvement: latest.percentage - original.percentage,
        retakeCount: Math.max(0, attempts.length - 1)
    };
}

async function getRetakeAvailability(sessionId, studentId) {
    const baseCompletionDate = await getBaseCompletionDate(sessionId, studentId);
    if (!baseCompletionDate) {
        return {
            hasOfficialAttempt: false,
            available: false,
            eligibleAt: null,
            latestSubmittedRetake: null,
            inProgressAttempt: null,
            nextAttemptNumber: 2
        };
    }

    const [latestSubmittedRetake, inProgressAttempt, maxAttempt] = await Promise.all([
        getLatestSubmittedRetake(sessionId, studentId),
        queryDb.get(`
            SELECT *
            FROM session_attempts
            WHERE session_id = ? AND student_id = ? AND status = 'in_progress'
            ORDER BY attempt_number DESC, id DESC
            LIMIT 1
        `, [sessionId, studentId]),
        queryDb.get(
            'SELECT MAX(attempt_number) as maxAttemptNumber FROM session_attempts WHERE session_id = ? AND student_id = ?',
            [sessionId, studentId]
        )
    ]);

    const latestSubmittedDate = parseDatabaseDate(latestSubmittedRetake?.submitted_at);
    const anchorDate = latestSubmittedDate || baseCompletionDate;
    const eligibleAtDate = new Date(anchorDate.getTime() + RETAKE_WAIT_MS);

    return {
        hasOfficialAttempt: true,
        available: Date.now() >= eligibleAtDate.getTime(),
        eligibleAt: eligibleAtDate.toISOString(),
        latestSubmittedRetake,
        inProgressAttempt,
        nextAttemptNumber: Math.max(2, Number(maxAttempt?.maxAttemptNumber || 1) + 1)
    };
}

async function getOrCreateShortAnswerOption(questionId, text) {
    const cleanText = String(text || '').trim();
    if (!cleanText) return null;

    const options = await queryDb.all('SELECT id, text, is_correct FROM options WHERE question_id = ?', [questionId]);
    const correctOption = options.find(option => option.is_correct === 1);
    const existing = options.find(option => option.text.trim().toLowerCase() === cleanText.toLowerCase());

    if (existing) return existing;

    const isCorrect = correctOption && cleanText.toLowerCase() === correctOption.text.trim().toLowerCase();
    const result = await queryDb.run(
        'INSERT INTO options (question_id, text, is_correct) VALUES (?, ?, ?)',
        [questionId, cleanText, isCorrect ? 1 : 0]
    );
    return { id: result.id, text: cleanText, is_correct: isCorrect ? 1 : 0 };
}

// SQLite initialization is handled in database.js
// We only use queryDb exported from there to ensure one connection pool

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
        const userId = req.user.id;
        const userRole = req.user.role;

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
        
        const updatedSessions = await Promise.all(sessions.map(s => checkSessionExpiry(s)));
        res.json(updatedSessions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get active sessions for a specific student (filtered by their enrolled classes)
app.get('/api/sessions/student/:studentId', authorize(['admin', 'teacher', 'student']), async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;

        // Students can only see their own sessions
        if (userRole === 'student' && userId !== req.params.studentId) {
            return res.status(403).json({ error: 'Forbidden: You can only view your own sessions' });
        }
        if (userRole === 'teacher') {
            const canViewStudent = await queryDb.get(`
                SELECT 1
                FROM class_students cs
                JOIN classes c ON c.id = cs.class_id
                WHERE cs.student_id = ? AND c.teacher_id = ?
                LIMIT 1
            `, [req.params.studentId, userId]);
            if (!canViewStudent) {
                return res.status(403).json({ error: 'Forbidden: You can only view sessions for your own students' });
            }
        }

        const sql = `
            SELECT s.*, q.title as quiz_title, c.name as class_name, t.username as teacher_name, 
                   CASE WHEN sub.student_id IS NOT NULL THEN 1 ELSE 0 END as is_submitted,
                   sub.submitted_at,
                   (SELECT COUNT(*) FROM responses r WHERE r.session_id = s.id AND r.student_id = cs.student_id) as response_count
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
        const updatedSessions = await Promise.all(sessions.map(async (s) => {
            const updatedSession = await checkSessionExpiry(s);
            const [retake, scoreSummary] = await Promise.all([
                getRetakeAvailability(updatedSession.id, req.params.studentId),
                getAttemptScoreSummary(updatedSession.id, req.params.studentId)
            ]);
            return {
                ...updatedSession,
                retake_available: retake.hasOfficialAttempt && retake.available ? 1 : 0,
                retake_eligible_at: retake.eligibleAt,
                retake_in_progress: retake.inProgressAttempt ? 1 : 0,
                latest_retake_submitted_at: retake.latestSubmittedRetake?.submitted_at || null,
                official_original_score: scoreSummary?.original?.percentage ?? null,
                official_latest_score: scoreSummary?.latest?.percentage ?? null,
                official_score_improvement: scoreSummary?.improvement ?? null,
                official_attempt_count: scoreSummary?.attempts?.length || 0
            };
        }));
        res.json(updatedSessions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get session details
app.get('/api/sessions/:id', authorize(['admin', 'teacher', 'student']), async (req, res) => {
    try {
        const session = await queryDb.get('SELECT * FROM sessions WHERE id = ?', [req.params.id]);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (req.user.role === 'teacher') {
            const canManage = await canTeacherManageSession(req.user.id, req.params.id);
            if (!canManage) return res.status(403).json({ error: 'Forbidden' });
        }
        if (req.user.role === 'student') {
            const canAccess = await canStudentAccessSession(req.user.id, req.params.id);
            if (!canAccess) return res.status(403).json({ error: 'Forbidden' });
        }
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
    const { quiz_id, mode, name, class_id, time_limit, randomize_questions, shuffle_options, is_team_mode, expires_at } = req.body;
    console.log(`--- Creating Session: "${name}" (Quiz: ${quiz_id}, Class: ${class_id}) ---`);
    try {
        if (req.user.role === 'teacher') {
            const quiz = await queryDb.get('SELECT id FROM quizzes WHERE id = ? AND author_id = ?', [quiz_id, req.user.id]);
            if (!quiz) return res.status(403).json({ error: 'Forbidden: You can only start sessions for your own quizzes' });

            if (class_id) {
                const ownedClass = await queryDb.get('SELECT id FROM classes WHERE id = ? AND teacher_id = ?', [class_id, req.user.id]);
                if (!ownedClass) return res.status(403).json({ error: 'Forbidden: You can only use your own classes' });
            }
        }

        if (expires_at) {
            const expiryDate = new Date(expires_at);
            if (isNaN(expiryDate.getTime())) {
                return res.status(400).json({ error: 'Invalid date format for expires_at' });
            }
            if (expiryDate <= new Date()) {
                return res.status(400).json({ error: 'Auto-close time must be in the future' });
            }
        }

        let isUnique = false;
        let join_code = '';
        while (!isUnique) {
            join_code = generateJoinCode();
            const existing = await queryDb.get('SELECT id FROM sessions WHERE join_code = ?', [join_code]);
            if (!existing) isUnique = true;
        }

        const result = await queryDb.run(
            'INSERT INTO sessions (quiz_id, mode, status, name, class_id, time_limit, randomize_questions, shuffle_options, is_team_mode, join_code, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [quiz_id, mode, 'active', name, class_id || null, time_limit || null, randomize_questions ? 1 : 0, shuffle_options ? 1 : 0, is_team_mode ? 1 : 0, join_code, expires_at || null]
        );
        console.log(`Success: Session created with ID ${result.id} and Code ${join_code}`);
        res.json({ sessionId: result.id, join_code });
    } catch (error) {
        console.error('ERROR during session creation:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Join session by code
app.get('/api/sessions/join/:code', authorize(['admin', 'teacher', 'student']), async (req, res) => {
    try {
        const session = await queryDb.get(
            `SELECT s.*, q.title as quiz_title 
             FROM sessions s 
             JOIN quizzes q ON s.quiz_id = q.id 
             WHERE s.join_code = ? AND s.status = 'active' AND s.is_archived = 0`,
            [req.params.code.toUpperCase()]
        );
        if (!session) return res.status(404).json({ error: 'Session not found or no longer active' });

        const updatedSession = await checkSessionExpiry(session);
        if (updatedSession.status === 'completed') {
            return res.status(404).json({ error: 'This session has reached its scheduled closing time and is no longer active.' });
        }

        res.json(updatedSession);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Finish a session
app.put('/api/sessions/:id/finish', authorize(['admin', 'teacher']), async (req, res) => {
    try {
        const sessionId = req.params.id;
        if (req.user.role === 'teacher') {
            const canManage = await canTeacherManageSession(req.user.id, sessionId);
            if (!canManage) return res.status(403).json({ error: 'Forbidden' });
        }
        const session = await queryDb.get('SELECT id, name, quiz_id, class_id, status FROM sessions WHERE id = ?', [sessionId]);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        await queryDb.run('UPDATE sessions SET status = "completed" WHERE id = ?', [sessionId]);
        console.log(`[DEBUG] Session ${sessionId} marked as completed via REST API`);
        // Persist all live session data to Database before clearing memory
        const sessionData = activeSessions[sessionId];
        if (sessionData) {
            const participants = Array.from(sessionData.participants);
            for (const pId of participants) {
                const liveBadges = sessionData.earnedBadges[pId]
                    ? Array.from(sessionData.earnedBadges[pId])
                    : [];
                const badgesJson = JSON.stringify(await buildSubmissionBadges(sessionId, pId, liveBadges));
                
                // Use INSERT OR REPLACE to ensure attendance is recorded for everyone
                await queryDb.run(`
                    INSERT INTO session_submissions (session_id, student_id, badges, submitted_at)
                    VALUES (?, ?, ?, datetime('now', 'utc'))
                    ON CONFLICT(session_id, student_id) DO UPDATE SET
                    badges = excluded.badges,
                    submitted_at = excluded.submitted_at
                `, [sessionId, pId, badgesJson]);
            }
        }
        
        // Clean up from memory
        delete activeSessions[sessionId];

        await logAuditEvent({
            actorId: req.user.id,
            actorRole: req.user.role,
            action: 'session_completed',
            targetType: 'session',
            targetId: sessionId,
            details: {
                name: session.name,
                quiz_id: session.quiz_id,
                class_id: session.class_id,
                previous_status: session.status,
                source: 'rest'
            }
        });
        
        res.json({ message: 'Session completed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start an Async session (Personal Timer Start)
app.post('/api/sessions/:id/start', authorize(['student', 'admin']), async (req, res) => {
    const studentId = req.user.role === 'student' ? req.user.id : req.body.studentId;
    try {
        if (!studentId) return res.status(400).json({ error: 'studentId is required' });
        if (req.user.role === 'student') {
            const canAccess = await canStudentAccessSession(req.user.id, req.params.id);
            if (!canAccess) return res.status(403).json({ error: 'Forbidden' });
        }
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
app.get('/api/sessions/:id/submission/:studentId', authorize(['admin', 'teacher', 'student']), async (req, res) => {
    try {
        if (req.user.role === 'teacher') {
            const canManage = await canTeacherManageSession(req.user.id, req.params.id);
            if (!canManage) return res.status(403).json({ error: 'Forbidden' });
        }
        if (req.user.role === 'student' && String(req.user.id) !== String(req.params.studentId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
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
app.post('/api/sessions/:id/submit', authorize(['student', 'admin']), async (req, res) => {
    try {
        const studentId = req.user.role === 'student' ? req.user.id : req.body.studentId;
        const sessionId = req.params.id;
        if (!studentId) return res.status(400).json({ error: 'studentId is required' });
        if (req.user.role === 'student') {
            const canAccess = await canStudentAccessSession(req.user.id, sessionId);
            if (!canAccess) return res.status(403).json({ error: 'Forbidden' });
        }

        const liveBadges = activeSessions[sessionId]?.earnedBadges?.[studentId]
            ? Array.from(activeSessions[sessionId].earnedBadges[studentId])
            : [];
        const badgesJson = JSON.stringify(await buildSubmissionBadges(sessionId, studentId, liveBadges));

        await queryDb.run(
            `INSERT INTO session_submissions (session_id, student_id, badges, submitted_at)
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(session_id, student_id) DO UPDATE SET
                badges = excluded.badges,
                submitted_at = CURRENT_TIMESTAMP`,
            [sessionId, studentId, badgesJson]
        );
        res.json({ message: 'Submission successful' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/sessions/:id/retakes/status', authorize(['student', 'admin']), async (req, res) => {
    try {
        const studentId = req.user.role === 'student' ? req.user.id : req.query.studentId;
        if (!studentId) return res.status(400).json({ error: 'studentId is required' });
        if (req.user.role === 'student') {
            const canAccess = await canStudentAccessSession(req.user.id, req.params.id);
            if (!canAccess) return res.status(403).json({ error: 'Forbidden' });
        }

        const retake = await getRetakeAvailability(req.params.id, studentId);
        res.json({
            hasOfficialAttempt: retake.hasOfficialAttempt,
            available: retake.hasOfficialAttempt && retake.available,
            eligibleAt: retake.eligibleAt,
            inProgressAttempt: retake.inProgressAttempt,
            latestSubmittedRetake: retake.latestSubmittedRetake
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sessions/:id/retakes/start', authorize(['student']), async (req, res) => {
    try {
        const sessionId = req.params.id;
        const studentId = req.user.id;
        const canAccess = await canStudentAccessSession(studentId, sessionId);
        if (!canAccess) return res.status(403).json({ error: 'Forbidden' });

        const session = await queryDb.get('SELECT id, status, is_archived FROM sessions WHERE id = ?', [sessionId]);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.status !== 'completed' && session.is_archived !== 1) {
            return res.status(400).json({ error: 'Retakes are only available after the original session is completed.' });
        }

        const retake = await getRetakeAvailability(sessionId, studentId);
        if (!retake.hasOfficialAttempt) {
            return res.status(400).json({ error: 'You need an official first attempt before retaking this quiz.' });
        }
        if (retake.inProgressAttempt) {
            const nowObj = await queryDb.get('SELECT datetime("now", "utc") as now');
            const savedResponses = await queryDb.all(
                'SELECT question_id, option_id FROM attempt_responses WHERE attempt_id = ?',
                [retake.inProgressAttempt.id]
            );
            return res.json({ attempt: retake.inProgressAttempt, savedResponses, serverNow: nowObj.now });
        }
        if (!retake.available) {
            return res.status(403).json({
                error: 'Retake is not available yet.',
                eligibleAt: retake.eligibleAt
            });
        }

        const result = await queryDb.run(
            'INSERT INTO session_attempts (session_id, student_id, attempt_number, status) VALUES (?, ?, ?, "in_progress")',
            [sessionId, studentId, retake.nextAttemptNumber]
        );
        const attempt = await queryDb.get('SELECT * FROM session_attempts WHERE id = ?', [result.id]);
        const nowObj = await queryDb.get('SELECT datetime("now", "utc") as now');
        res.json({ attempt, savedResponses: [], serverNow: nowObj.now });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sessions/:id/retakes/:attemptId/responses', authorize(['student']), async (req, res) => {
    try {
        const { questionId, optionId, text } = req.body;
        if (!questionId) return res.status(400).json({ error: 'questionId is required' });

        const attempt = await queryDb.get(`
            SELECT a.*, s.quiz_id
            FROM session_attempts a
            JOIN sessions s ON s.id = a.session_id
            WHERE a.id = ? AND a.session_id = ? AND a.student_id = ?
        `, [req.params.attemptId, req.params.id, req.user.id]);

        if (!attempt) return res.status(404).json({ error: 'Retake attempt not found' });
        if (attempt.status !== 'in_progress') {
            return res.status(400).json({ error: 'This retake has already been submitted.' });
        }

        const question = await queryDb.get(
            'SELECT id, type FROM questions WHERE id = ? AND quiz_id = ?',
            [questionId, attempt.quiz_id]
        );
        if (!question) return res.status(404).json({ error: 'Question not found for this quiz.' });

        let selectedOption;
        if (question.type === 'short_answer') {
            selectedOption = await getOrCreateShortAnswerOption(questionId, text);
        } else {
            selectedOption = await queryDb.get(
                'SELECT id, is_correct FROM options WHERE id = ? AND question_id = ?',
                [optionId, questionId]
            );
        }

        if (!selectedOption) return res.status(400).json({ error: 'Answer is required.' });
        const pointsEarned = selectedOption.is_correct === 1 ? 1000 : 0;

        await queryDb.run(`
            INSERT INTO attempt_responses (attempt_id, question_id, option_id, points_earned)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(attempt_id, question_id) DO UPDATE SET
                option_id = excluded.option_id,
                points_earned = excluded.points_earned,
                timestamp = CURRENT_TIMESTAMP
        `, [attempt.id, questionId, selectedOption.id, pointsEarned]);

        res.json({ message: 'Answer saved', isCorrect: selectedOption.is_correct === 1 });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/sessions/:id/retakes/:attemptId/submit', authorize(['student']), async (req, res) => {
    try {
        const attempt = await queryDb.get(
            'SELECT * FROM session_attempts WHERE id = ? AND session_id = ? AND student_id = ?',
            [req.params.attemptId, req.params.id, req.user.id]
        );
        if (!attempt) return res.status(404).json({ error: 'Retake attempt not found' });
        if (attempt.status !== 'in_progress') {
            return res.json({ message: 'Retake already submitted' });
        }

        await queryDb.run(
            `UPDATE session_attempts
             SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [attempt.id]
        );

        res.json({ message: 'Retake submitted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Archive a session (instead of fully deleting)
app.put('/api/sessions/:id/archive', authorize(['admin', 'teacher']), async (req, res) => {
    try {
        if (req.user.role === 'teacher') {
            const canManage = await canTeacherManageSession(req.user.id, req.params.id);
            if (!canManage) return res.status(403).json({ error: 'Forbidden' });
        }
        const session = await queryDb.get('SELECT id, name, quiz_id, class_id, is_archived FROM sessions WHERE id = ?', [req.params.id]);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        await queryDb.run('UPDATE sessions SET is_archived = 1 WHERE id = ?', [req.params.id]);
        await logAuditEvent({
            actorId: req.user.id,
            actorRole: req.user.role,
            action: 'session_archived',
            targetType: 'session',
            targetId: req.params.id,
            details: {
                name: session.name,
                quiz_id: session.quiz_id,
                class_id: session.class_id,
                previous_archived_state: session.is_archived
            }
        });
        res.json({ message: 'Session archived successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get student's review results for a session
app.get('/api/sessions/:id/results/:studentId', authorize(['admin', 'teacher', 'student']), async (req, res) => {
    try {
        const userId = req.user.id;
        const userRole = req.user.role;

        console.log(`[DEBUG] Results Request - Session: ${req.params.id}, Student: ${req.params.studentId}, HeaderID: ${userId}, HeaderRole: ${userRole}`);

        const session = await queryDb.get('SELECT quiz_id, status, mode FROM sessions WHERE id = ?', [req.params.id]);
        if (!session) {
            console.log(`[DEBUG] Session ${req.params.id} not found.`);
            return res.status(404).json({ error: 'Session not found' });
        }
        console.log(`[DEBUG] Session Found - Status: ${session.status}, Mode: ${session.mode}`);

        // Students can only see their own results
        if (userRole === 'student' && String(userId) !== String(req.params.studentId)) {
            console.log(`[DEBUG] ID Mismatch - Header: ${userId} vs Params: ${req.params.studentId}`);
            // Still blocking, but let's be 100% sure we log the reason
            return res.status(403).json({ error: `Forbidden: You can only view your own results (User: ${userId}, Target: ${req.params.studentId})` });
        }
        if (userRole === 'teacher') {
            const canManage = await canTeacherManageSession(userId, req.params.id);
            if (!canManage) {
                return res.status(403).json({ error: 'Forbidden' });
            }
        }

        // Students can only see results if:
        // 1. Session is 'completed'
        // 2. OR they have a submission record (typical for async or finished live)
        // 3. OR (SAFETY NET FOR LIVE) they have answered all questions in the quiz
        if (userRole === 'student') {
            const hasSubmission = await queryDb.get(
                'SELECT 1 FROM session_submissions WHERE session_id = ? AND student_id = ?',
                [req.params.id, req.params.studentId]
            );

            if (!hasSubmission && session.status !== 'completed') {
                // Check if they've answered all questions as a fallback
                const qCount = await queryDb.get('SELECT COUNT(*) as count FROM questions WHERE quiz_id = ?', [session.quiz_id]);
                const aCount = await queryDb.get('SELECT COUNT(*) as count FROM responses WHERE session_id = ? AND student_id = ?', [req.params.id, req.params.studentId]);
                
                if (aCount.count < qCount.count) {
                    console.log(`[DEBUG] Results Blocked - Status: ${session.status}, Answered: ${aCount.count}/${qCount.count}`);
                    return res.status(403).json({ 
                        error: session.mode === 'live' 
                            ? `Results are not available until you finish all ${qCount.count} questions.` 
                            : 'You must submit the quiz first to see results.' 
                    });
                }
                console.log(`[DEBUG] Results Access Granted via Question Completion (${aCount.count}/${qCount.count})`);
            } else {
                console.log(`[DEBUG] Results Access Granted - Status: ${session.status}, HasSubmission: ${!!hasSubmission}`);
            }
        }

        const questionsRows = await queryDb.all('SELECT id, text, type, image_url, code_snippet, code_language, explanation FROM questions WHERE quiz_id = ? ORDER BY order_idx ASC', [session.quiz_id]);
        
        const [latestRetake, scoreSummary] = await Promise.all([
            getLatestSubmittedRetake(req.params.id, req.params.studentId),
            getAttemptScoreSummary(req.params.id, req.params.studentId)
        ]);

        // OPTIMIZATION: Fetch ALL options and ALL student responses for this session in one go
        const allOptions = await queryDb.all('SELECT id, question_id, text, is_correct FROM options WHERE question_id IN (SELECT id FROM questions WHERE quiz_id = ?)', [session.quiz_id]);
        const allResponses = latestRetake
            ? await queryDb.all('SELECT question_id, option_id FROM attempt_responses WHERE attempt_id = ?', [latestRetake.id])
            : await queryDb.all('SELECT question_id, option_id FROM responses WHERE session_id = ? AND student_id = ?', [req.params.id, req.params.studentId]);

        const responsesMap = {};
        allResponses.forEach(r => responsesMap[r.question_id] = r.option_id);

        const optionsMap = {};
        allOptions.forEach(o => {
            if (!optionsMap[o.question_id]) optionsMap[o.question_id] = [];
            optionsMap[o.question_id].push(o);
        });

        const finalResults = questionsRows.map(q => {
            const qOptions = optionsMap[q.id] || [];
            const correctOption = qOptions.find(o => o.is_correct === 1);
            const studentAnswerId = responsesMap[q.id];
            const answeredOption = qOptions.find(o => o.id === studentAnswerId);
            
            return {
                questionId: q.id,
                questionText: q.text,
                questionType: q.type,
                imageUrl: q.image_url,
                codeSnippet: q.code_snippet,
                codeLanguage: q.code_language,
                explanation: q.explanation,
                studentAnswerId,
                studentAnswerText: answeredOption ? answeredOption.text : 'Did not answer',
                correctAnswerId: correctOption ? correctOption.id : null,
                correctAnswerText: correctOption ? correctOption.text : 'Unknown',
                options: qOptions.map(opt => ({ id: opt.id, text: opt.text, is_correct: opt.is_correct })),
                isCorrect: answeredOption ? answeredOption.is_correct === 1 : false
            };
        });

        const pointsRow = latestRetake
            ? await queryDb.get(
                'SELECT SUM(points_earned) as totalPoints FROM attempt_responses WHERE attempt_id = ?',
                [latestRetake.id]
            )
            : await queryDb.get(
                'SELECT SUM(points_earned) as totalPoints FROM responses WHERE session_id = ? AND student_id = ?',
                [req.params.id, req.params.studentId]
            );

        const subRow = await queryDb.get(
            'SELECT badges FROM session_submissions WHERE session_id = ? AND student_id = ?',
            [req.params.id, req.params.studentId]
        );

        // Check if student missed this session completely
        const isMissed = !latestRetake && session.status === 'completed' && allResponses.length === 0 && !subRow;

        res.json({
            results: finalResults,
            totalPoints: pointsRow?.totalPoints || 0,
            badges: subRow ? JSON.parse(subRow.badges || '[]') : [],
            isMissed,
            scoreSummary,
            attempt: latestRetake
                ? {
                    id: latestRetake.id,
                    attemptNumber: latestRetake.attempt_number,
                    submittedAt: latestRetake.submitted_at,
                    isRetake: true
                }
                : {
                    attemptNumber: 1,
                    isRetake: false
                }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get aggregated session results for the teacher
app.get('/api/sessions/:id/teacher-results', authorize(['admin', 'teacher']), async (req, res) => {
    try {
        if (req.user.role === 'teacher') {
            const canManage = await canTeacherManageSession(req.user.id, req.params.id);
            if (!canManage) return res.status(403).json({ error: 'Forbidden' });
        }
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
        const participantRows = await queryDb.all(`
            SELECT DISTINCT u.id, u.username
            FROM users u
            WHERE u.id IN (
                SELECT student_id FROM responses WHERE session_id = ?
                UNION
                SELECT student_id FROM session_attempts WHERE session_id = ? AND status = 'submitted' AND is_official = 1
            )
        `, [session.id, session.id]);

        const totalQuestions = questionsRows.length;
        const participantsWithScores = [];

        for (const p of participantRows) {
            const latestRetake = await getLatestSubmittedRetake(session.id, p.id);
            const scoreSummary = await getAttemptScoreSummary(session.id, p.id);

            // Count how many correct answers this specific participant provided in this session
            const scoreRow = latestRetake
                ? await queryDb.get(`
                    SELECT COUNT(*) as score
                    FROM attempt_responses ar
                    JOIN options o ON ar.option_id = o.id
                    WHERE ar.attempt_id = ? AND o.is_correct = 1
                `, [latestRetake.id])
                : await queryDb.get(`
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
                percentage,
                attemptNumber: latestRetake ? latestRetake.attempt_number : 1,
                latestAttemptSubmittedAt: latestRetake?.submitted_at || null,
                originalPercentage: scoreSummary?.original?.percentage ?? percentage,
                latestPercentage: scoreSummary?.latest?.percentage ?? percentage,
                improvement: scoreSummary?.improvement ?? 0,
                retakeCount: scoreSummary?.retakeCount ?? 0,
                attemptHistory: scoreSummary?.attempts || []
            });
        }

        // Sort by score descending
        participantsWithScores.sort((a, b) => b.score - a.score);

        finalResults.participants = participantsWithScores;
        finalResults.retakeSummary = {
            retakeCount: participantsWithScores.filter(p => p.retakeCount > 0).length,
            averageImprovement: (() => {
                const improved = participantsWithScores.filter(p => p.retakeCount > 0);
                if (!improved.length) return 0;
                return Math.round(improved.reduce((sum, p) => sum + p.improvement, 0) / improved.length);
            })()
        };

        for (const q of questionsRows) {
            const options = await queryDb.all('SELECT id, text, is_correct FROM options WHERE question_id = ?', [q.id]);

            const countsByOption = {};
            for (const p of participantRows) {
                const latestRetake = await getLatestSubmittedRetake(session.id, p.id);
                const responseRow = latestRetake
                    ? await queryDb.get(
                        'SELECT option_id FROM attempt_responses WHERE attempt_id = ? AND question_id = ?',
                        [latestRetake.id, q.id]
                    )
                    : await queryDb.get(
                        'SELECT option_id FROM responses WHERE session_id = ? AND student_id = ? AND question_id = ?',
                        [session.id, p.id, q.id]
                    );
                if (responseRow?.option_id) {
                    countsByOption[responseRow.option_id] = (countsByOption[responseRow.option_id] || 0) + 1;
                }
            }

            // Map counts to options
            const optionsWithCounts = options.map(opt => {
                return { ...opt, count: countsByOption[opt.id] || 0 };
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

io.on('connection', (socket) => {
    try {
        console.log('A user connected:', socket.id);

    // Join a quiz session
        socket.on('join_session', async ({ sessionId }) => {
            try {
                socket.join(`session_${sessionId}`);

                    // Fetch session configuration from DB
                    let sessionRecord;
                    try {
                        sessionRecord = await queryDb.get('SELECT quiz_id, is_team_mode, status, mode FROM sessions WHERE id = ?', [sessionId]);
                        
                        // IMPORTANT: Allow joining if session is active OR completed (to see results)
                        if (!sessionRecord || (sessionRecord.status !== 'active' && sessionRecord.status !== 'completed')) {
                            socket.emit('session_error', { message: 'This session is not available.' });
                            return;
                        }

                        if (sessionRecord.status === 'completed') {
                           // If already completed, tell the client immediately
                           socket.emit('session_finished');
                           return; // No need to setup active state
                        }
                    } catch (err) {
                        console.error("Error fetching session for team mode:", err);
                        return; // Stop if we can't verify the session
                    }

                    // Double check if initialized by another concurrent join while we were awaiting
                    if (!activeSessions[sessionId]) {
                        const questionRows = await queryDb.all(
                            'SELECT id FROM questions WHERE quiz_id = ? ORDER BY order_idx ASC, id ASC',
                            [sessionRecord.quiz_id]
                        );

                        activeSessions[sessionId] = {
                            participants: new Set(),
                            participantDetails: {}, // userId -> username
                            mode: sessionRecord.mode,
                            status: sessionRecord.status,
                            currentQuestionIndex: 0,
                            questionOrder: questionRows.map((question) => question.id),
                            results: {}, // questionId -> optionId -> count
                            answeredStudents: {}, // questionId -> Set of userIds
                            locked: false,
                            timerStart: null,
                            timerDuration: null,
                            timerQuestionIndex: null,
                            isTeamMode: sessionRecord.is_team_mode === 1,
                            teams: {}, // userId -> teamName ('Red', 'Blue', 'Green', 'Yellow')
                            teamScores: { 'Red': 0, 'Blue': 0, 'Green': 0, 'Yellow': 0 },
                            individualScores: {}, // userId -> total score
                            streaks: {}, // userId -> consecutive correct answers
                            fastestCorrectByQuestion: {}, // questionId -> top 5 fastest correct responders
                            questionStartTime: Date.now(), // Track when the question was shown for dynamic scoring
                            firstToAnswer: false, // Flag to track if someone has answered the current question correctly yet
                            earnedBadges: {} // userId -> Set of badge names
                        };
                    }

                if (socket.user.role === 'student') {
                    const canAccess = await canStudentAccessSession(socket.user.id, sessionId);
                    if (!canAccess) {
                        socket.emit('session_error', { message: 'You cannot join this session.' });
                        return;
                    }

                    activeSessions[sessionId].participants.add(socket.user.id);
                    if (socket.user.username) {
                        activeSessions[sessionId].participantDetails[socket.user.id] = socket.user.username;
                    }

                    // Assign to team if in Team Mode and not already assigned
                    if (activeSessions[sessionId].isTeamMode && !activeSessions[sessionId].teams[socket.user.id]) {
                        const availableTeams = ['Red', 'Blue', 'Green', 'Yellow'];
                        const randomTeam = availableTeams[Math.floor(Math.random() * availableTeams.length)];
                        activeSessions[sessionId].teams[socket.user.id] = randomTeam;
                    }

                    // Notify teacher of participant count and newly updated details (ONLY TO TEACHER ROOM)
                    io.to(`teacher_${sessionId}`).emit('participants_update', {
                        count: activeSessions[sessionId].participants.size,
                        details: activeSessions[sessionId].participantDetails,
                        teams: activeSessions[sessionId].teams
                    });

                    // Send standard student joining state, including their team assignment
                    socket.emit('assigned_team', { team: activeSessions[sessionId].teams[socket.user.id] });
                } else if (socket.user.role === 'teacher' || socket.user.role === 'admin') {
                    if (socket.user.role === 'teacher') {
                        const canManage = await canTeacherManageSession(socket.user.id, sessionId);
                        if (!canManage) {
                            socket.emit('session_error', { message: 'You cannot manage this session.' });
                            return;
                        }
                    }
                    // SECURE: Teacher/Admin join a private room for sensitive updates
                    socket.join(`teacher_${sessionId}`);
                }

                // Send current session state to the newly connected user (ROLE-AWARE)
                const answeredArrays = {};
                if (activeSessions[sessionId].answeredStudents) {
                    for (const [qId, stuSet] of Object.entries(activeSessions[sessionId].answeredStudents)) {
                        answeredArrays[qId] = Array.from(stuSet);
                    }
                }

                // Calculate myAnsweredQuestions so students can't bypass UI restrictions by refreshing
                const myAnsweredQuestions = [];
                if (socket.user.role === 'student' && activeSessions[sessionId].answeredStudents) {
                    for (const [qId, stuSet] of Object.entries(activeSessions[sessionId].answeredStudents)) {
                        if (stuSet.has(socket.user.id)) {
                            myAnsweredQuestions.push(qId);
                        }
                    }
                }

                const commonState = {
                    status: activeSessions[sessionId].status,
                    mode: activeSessions[sessionId].mode,
                    currentQuestionIndex: activeSessions[sessionId].currentQuestionIndex,
                    currentQuestionId: activeSessions[sessionId].questionOrder[activeSessions[sessionId].currentQuestionIndex] || null,
                    locked: activeSessions[sessionId].locked,
                    timerStart: activeSessions[sessionId].timerStart,
                    timerDuration: activeSessions[sessionId].timerDuration,
                    timerQuestionIndex: activeSessions[sessionId].timerQuestionIndex,
                    isTeamMode: activeSessions[sessionId].isTeamMode,
                    teamScores: activeSessions[sessionId].teamScores,
                    individualScores: activeSessions[sessionId].individualScores,
                    streaks: activeSessions[sessionId].streaks,
                    participantCount: activeSessions[sessionId].participants.size
                };

                if (socket.user.role === 'teacher' || socket.user.role === 'admin') {
                    socket.emit('session_state', {
                        ...commonState,
                        results: activeSessions[sessionId].results,
                        answeredStudents: answeredArrays,
                        fastestCorrectByQuestion: activeSessions[sessionId].fastestCorrectByQuestion,
                        participantDetails: activeSessions[sessionId].participantDetails,
                        teams: activeSessions[sessionId].teams
                    });
                } else {
                    // Students get NO results or answeredArrays (security)
                    socket.emit('session_state', {
                        ...commonState,
                        myAnsweredQuestions,
                        assignedTeam: activeSessions[sessionId].teams[socket.user.id] || null
                    });
                }
            } catch (err) {
                console.error('Error in join_session handler:', err);
            }
        });

    // Teacher moves to next question
    socket.on('next_question', async ({ sessionId, newIndex }) => {
        try {
            if (socket.user.role === 'teacher' && !(await canTeacherManageSession(socket.user.id, sessionId))) return;
            if (!['teacher', 'admin'].includes(socket.user.role)) return;
            if (activeSessions[sessionId]) {
                activeSessions[sessionId].currentQuestionIndex = newIndex;
                activeSessions[sessionId].locked = false;
                activeSessions[sessionId].timerStart = null;
                activeSessions[sessionId].timerDuration = null;
                activeSessions[sessionId].questionStartTime = Date.now();
                activeSessions[sessionId].firstToAnswer = false;

                // Send restored state for teachers if navigating backward
                const questionId = activeSessions[sessionId].questionOrder[newIndex];
                const answeredSet = questionId ? activeSessions[sessionId].answeredStudents[questionId] : null;
                const answered = answeredSet ? Array.from(answeredSet) : [];
                const results = questionId ? (activeSessions[sessionId].results[questionId] || {}) : {};

                io.to(`session_${sessionId}`).emit('question_changed', { newIndex, questionId, answered, results });
            }
        } catch (err) {
            console.error('Error in next_question handler:', err);
        }
    });

    // Teacher toggles question lock
    socket.on('toggle_lock', async ({ sessionId, locked }) => {
        try {
            if (socket.user.role === 'teacher' && !(await canTeacherManageSession(socket.user.id, sessionId))) return;
            if (!['teacher', 'admin'].includes(socket.user.role)) return;
            if (activeSessions[sessionId]) {
                activeSessions[sessionId].locked = locked;
                io.to(`session_${sessionId}`).emit('question_locked', { locked });
            }
        } catch (err) {
            console.error('Error in toggle_lock handler:', err);
        }
    });

    // Teacher starts a timer for current question
    socket.on('start_question_timer', async ({ sessionId, durationSeconds, autoAdvance }) => {
        try {
            if (socket.user.role === 'teacher' && !(await canTeacherManageSession(socket.user.id, sessionId))) return;
            if (!['teacher', 'admin'].includes(socket.user.role)) return;
            if (activeSessions[sessionId]) {
                activeSessions[sessionId].timerStart = Date.now();
                activeSessions[sessionId].timerDuration = durationSeconds;
                activeSessions[sessionId].timerQuestionIndex = activeSessions[sessionId].currentQuestionIndex;
                io.to(`session_${sessionId}`).emit('timer_started', {
                    duration: durationSeconds,
                    startedAt: activeSessions[sessionId].timerStart,
                    autoAdvance
                });
            }
        } catch (err) {
            console.error('Error in start_question_timer handler:', err);
        }
    });

    // Student submits an answer
    socket.on('submit_answer', async ({ sessionId, questionId, optionId }) => {
        if (activeSessions[sessionId] && activeSessions[sessionId].locked) return;
        try {
            if (socket.user.role !== 'student') return;
            const studentId = socket.user.id;

            // --- DUPLICATE SUBMISSION GUARD ---
            if (!activeSessions[sessionId]) return;
            if (!activeSessions[sessionId].answeredStudents[questionId]) {
                activeSessions[sessionId].answeredStudents[questionId] = new Set();
            }
            if (activeSessions[sessionId].answeredStudents[questionId].has(studentId)) {
                return; // Student already answered this question
            }

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

            // IMPORTANT: Check if session still exists after await
            if (!activeSessions[sessionId]) return;

            if (optRecord && optRecord.is_correct === 1) {
                // Determine streak and badges
                if (!activeSessions[sessionId]. streaks[studentId]) {
                    activeSessions[sessionId].streaks[studentId] = 0;
                }
                activeSessions[sessionId].streaks[studentId] += 1;
                const currentStreak = activeSessions[sessionId].streaks[studentId];

                if (currentStreak >= 3) {
                    awardLiveBadge(sessionId, studentId, 'On Fire! 🔥', { streak: currentStreak });
                }

                if (!activeSessions[sessionId].firstToAnswer) {
                    activeSessions[sessionId].firstToAnswer = true;
                    awardLiveBadge(sessionId, studentId, 'Quick Draw ⚡');
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

                if (!activeSessions[sessionId].fastestCorrectByQuestion[questionId]) {
                    activeSessions[sessionId].fastestCorrectByQuestion[questionId] = [];
                }
                activeSessions[sessionId].fastestCorrectByQuestion[questionId].push({
                        studentId,
                        username: activeSessions[sessionId].participantDetails[studentId] || socket.user.username || `Student ${studentId}`,
                        timeTakenMs: timeTaken,
                        pointsEarned
                });
                activeSessions[sessionId].fastestCorrectByQuestion[questionId]
                    .sort((a, b) => a.timeTakenMs - b.timeTakenMs || b.pointsEarned - a.pointsEarned);
                activeSessions[sessionId].fastestCorrectByQuestion[questionId] =
                    activeSessions[sessionId].fastestCorrectByQuestion[questionId].slice(0, 5);

                if (!activeSessions[sessionId].individualScores[studentId]) {
                    activeSessions[sessionId].individualScores[studentId] = 0;
                }
                activeSessions[sessionId].individualScores[studentId] += pointsEarned;

                // Persist the points earned to the DB
                await queryDb.run(
                    'UPDATE responses SET points_earned = ? WHERE session_id = ? AND student_id = ? AND question_id = ?',
                    [pointsEarned, sessionId, studentId, questionId]
                );

                // IMPORTANT: Check if session still exists after await
                if (!activeSessions[sessionId]) return;

                if (activeSessions[sessionId].isTeamMode) {
                    const studentTeam = activeSessions[sessionId].teams[studentId];
                    if (studentTeam) {
                        activeSessions[sessionId].teamScores[studentTeam] += pointsEarned;
                        io.to(`session_${sessionId}`).emit('team_scores_update', {
                            teamScores: activeSessions[sessionId].teamScores
                        });
                    }
                }

                // Send a private update to the student with their new score/streak
                io.to(`session_${sessionId}`).emit('student_score_update', {
                    studentId,
                    individualScores: activeSessions[sessionId].individualScores,
                    streaks: activeSessions[sessionId].streaks
                });
            } else {
                // Reset streak on wrong answer
                activeSessions[sessionId].streaks[studentId] = 0;
                io.to(`session_${sessionId}`).emit('student_score_update', {
                    studentId,
                    individualScores: activeSessions[sessionId].individualScores, // No change, but helpful to sync
                    streaks: activeSessions[sessionId].streaks
                });
            }

            // Final check
            if (!activeSessions[sessionId]) return;

            io.to(`teacher_${sessionId}`).emit('results_update', {
                questionId,
                results: activeSessions[sessionId].results[questionId],
                answered: Array.from(activeSessions[sessionId].answeredStudents[questionId]),
                fastestCorrect: activeSessions[sessionId].fastestCorrectByQuestion[questionId] || []
            });
        } catch (e) {
            console.error('Error recording answer:', e);
        }
    });

    // Student submits a Short Answer text
    socket.on('submit_answer_text', async ({ sessionId, questionId, text }) => {
        if (activeSessions[sessionId] && activeSessions[sessionId].locked) return;
        try {
            if (socket.user.role !== 'student') return;
            const studentId = socket.user.id;
            if (!text || text.trim() === '') return;

            // --- DUPLICATE SUBMISSION GUARD ---
            if (!activeSessions[sessionId]) return;
            if (!activeSessions[sessionId].answeredStudents[questionId]) {
                activeSessions[sessionId].answeredStudents[questionId] = new Set();
            }
            if (activeSessions[sessionId].answeredStudents[questionId].has(studentId)) {
                return; // Student already answered this question
            }

            // 1. Check if the text matches the correct option (case insensitive)
            const options = await queryDb.all('SELECT id, text FROM options WHERE question_id = ?', [questionId]);
            
            // IMPORTANT: Check if session still exists after await
            if (!activeSessions[sessionId]) return;

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

                    // IMPORTANT: Check if session still exists after await
                    if (!activeSessions[sessionId]) return;

                    targetOptionId = newOpt.id;
                }
            }

            // Record response
            await queryDb.run(
                'INSERT OR REPLACE INTO responses (session_id, student_id, question_id, option_id) VALUES (?, ?, ?, ?)',
                [sessionId, studentId, questionId, targetOptionId]
            );

            // IMPORTANT: Check if session still exists after await
            if (!activeSessions[sessionId]) return;

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
                    awardLiveBadge(sessionId, studentId, 'On Fire! 🔥', { streak: currentStreak });
                }

                if (!activeSessions[sessionId].firstToAnswer) {
                    activeSessions[sessionId].firstToAnswer = true;
                    awardLiveBadge(sessionId, studentId, 'Quick Draw ⚡');
                }

                // Calculate Dynamic Points based on time
                const maxPoints = 1000;
                const timeTaken = Date.now() - (activeSessions[sessionId].questionStartTime || Date.now());
                const timeRatio = Math.min(Math.max(timeTaken / 10000, 0), 1);
                const basePoints = Math.round(maxPoints - ((maxPoints - 500) * timeRatio));

                const multiplier = currentStreak > 1 ? 1 + (Math.min(currentStreak, 5) * 0.1) : 1;
                pointsEarned = Math.round(basePoints * multiplier);

                if (!activeSessions[sessionId].fastestCorrectByQuestion[questionId]) {
                    activeSessions[sessionId].fastestCorrectByQuestion[questionId] = [];
                }
                activeSessions[sessionId].fastestCorrectByQuestion[questionId].push({
                        studentId,
                        username: activeSessions[sessionId].participantDetails[studentId] || socket.user.username || `Student ${studentId}`,
                        timeTakenMs: timeTaken,
                        pointsEarned
                });
                activeSessions[sessionId].fastestCorrectByQuestion[questionId]
                    .sort((a, b) => a.timeTakenMs - b.timeTakenMs || b.pointsEarned - a.pointsEarned);
                activeSessions[sessionId].fastestCorrectByQuestion[questionId] =
                    activeSessions[sessionId].fastestCorrectByQuestion[questionId].slice(0, 5);

                if (!activeSessions[sessionId].individualScores[studentId]) {
                    activeSessions[sessionId].individualScores[studentId] = 0;
                }
                activeSessions[sessionId].individualScores[studentId] += pointsEarned;

                if (activeSessions[sessionId].isTeamMode) {
                    const studentTeam = activeSessions[sessionId].teams[studentId];
                    if (studentTeam) {
                        activeSessions[sessionId].teamScores[studentTeam] += pointsEarned;
                        io.to(`session_${sessionId}`).emit('team_scores_update', {
                            teamScores: activeSessions[sessionId].teamScores
                        });
                    }
                }

                io.to(`session_${sessionId}`).emit('student_score_update', {
                    studentId,
                    individualScores: activeSessions[sessionId].individualScores,
                    streaks: activeSessions[sessionId].streaks
                });
            } else {
                // Reset streak on wrong answer
                activeSessions[sessionId].streaks[studentId] = 0;
                io.to(`session_${sessionId}`).emit('student_score_update', {
                    studentId,
                    individualScores: activeSessions[sessionId].individualScores,
                    streaks: activeSessions[sessionId].streaks
                });
            }

            // Final check
            if (!activeSessions[sessionId]) return;

            io.to(`teacher_${sessionId}`).emit('results_update', {
                questionId,
                results: activeSessions[sessionId].results[questionId],
                answered: Array.from(activeSessions[sessionId].answeredStudents[questionId]),
                fastestCorrect: activeSessions[sessionId].fastestCorrectByQuestion[questionId] || []
            });
        } catch (e) {
            console.error('Error recording text answer:', e);
        }
    });

    // Teacher finishes the session via Socket (Fallback for REST API)
    socket.on('finish_session', async ({ sessionId }) => {
        try {
            if (socket.user.role === 'teacher' && !(await canTeacherManageSession(socket.user.id, sessionId))) return;
            if (!['teacher', 'admin'].includes(socket.user.role)) return;
            console.log(`[DEBUG] Received finish_session socket event for ${sessionId}`);
            const session = await queryDb.get('SELECT id, name, quiz_id, class_id, status FROM sessions WHERE id = ?', [sessionId]);
            if (!session) return;
            await queryDb.run('UPDATE sessions SET status = "completed" WHERE id = ?', [sessionId]);
            io.to(`session_${sessionId}`).emit('session_finished');

            const sessionData = activeSessions[sessionId];
            if (sessionData) {
                const participants = Array.from(sessionData.participants);
                for (const pId of participants) {
                    const liveBadges = sessionData.earnedBadges[pId]
                        ? Array.from(sessionData.earnedBadges[pId])
                        : [];
                    const badgesJson = JSON.stringify(await buildSubmissionBadges(sessionId, pId, liveBadges));
                    
                    await queryDb.run(`
                        INSERT INTO session_submissions (session_id, student_id, badges, submitted_at)
                        VALUES (?, ?, ?, datetime('now', 'utc'))
                        ON CONFLICT(session_id, student_id) DO UPDATE SET
                        badges = excluded.badges,
                        submitted_at = excluded.submitted_at
                    `, [sessionId, pId, badgesJson]);
                }
            }

            delete activeSessions[sessionId];
            await logAuditEvent({
                actorId: socket.user.id,
                actorRole: socket.user.role,
                action: 'session_completed',
                targetType: 'session',
                targetId: sessionId,
                details: {
                    name: session.name,
                    quiz_id: session.quiz_id,
                    class_id: session.class_id,
                    previous_status: session.status,
                    source: 'socket'
                }
            });
        } catch (err) {
            console.error('Error handling finish_session socket event:', err);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
    } catch (err) {
        console.error('Fatal error in Socket.io connection logic:', err);
    }
});


// --- Serve Uploaded Images ---
app.use('/uploads', express.static(join(__dirname, 'public', 'uploads')));

// --- Production Frontend Serving ---
const clientDistPath = join(__dirname, '../client/dist');
console.log('Serving static files from:', clientDistPath);
app.use(express.static(clientDistPath));

const PORT = process.env.PORT || 3001;

// --- PRACTICE MODE ENDPOINTS ---

// Record a completed practice attempt
app.post('/api/quizzes/:quizId/practice', authorize(['student']), async (req, res) => {
    try {
        const { scorePercentage, points } = req.body;
        const quizId = req.params.quizId;
        const userId = req.user.id;

        await queryDb.run(
            'INSERT INTO practice_scores (quiz_id, user_id, score_percentage, points) VALUES (?, ?, ?, ?)',
            [quizId, userId, scorePercentage, points || 0]
        );

        res.json({ message: 'Practice score recorded' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get leaderboard for a quiz
app.get('/api/quizzes/:quizId/leaderboard', authorize(['admin', 'teacher', 'student']), async (req, res) => {
    try {
        const quizId = req.params.quizId;
        const { classId, scope, timeframe } = req.query; // scope: 'class', 'cohort', 'global', timeframe: 'all', 'week', 'month'

        let sql = `
            SELECT ps.score_percentage, ps.points, ps.completed_at, u.username, u.id as user_id,
                   MAX(ps.score_percentage) as best_score
            FROM practice_scores ps
            JOIN users u ON ps.user_id = u.id
        `;
        const params = [];
        const whereClauses = ['ps.quiz_id = ?'];
        params.push(quizId);

        if (scope === 'class' && classId) {
            sql += ` JOIN class_students cs ON u.id = cs.student_id `;
            whereClauses.push('cs.class_id = ?');
            params.push(classId);
        } else if (scope === 'cohort') {
            const quiz = await queryDb.get('SELECT author_id FROM quizzes WHERE id = ?', [quizId]);
            whereClauses.push(`u.id IN (
                SELECT cs.student_id FROM class_students cs 
                JOIN classes c ON cs.class_id = c.id 
                WHERE c.teacher_id = ?
            )`);
            params.push(quiz.author_id);
        }

        // Timeframe filtering
        if (timeframe === 'week') {
            whereClauses.push("ps.completed_at >= datetime('now', '-7 days')");
        } else if (timeframe === 'month') {
            whereClauses.push("ps.completed_at >= datetime('now', '-30 days')");
        }

        sql += ` WHERE ` + whereClauses.join(' AND ');
        sql += ` GROUP BY u.id ORDER BY best_score DESC, ps.points DESC LIMIT 10 `;

        const leaderboard = await queryDb.all(sql, params);
        res.json(leaderboard);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get a list of students who have practiced a specific quiz (Teacher View)
app.get('/api/quizzes/:quizId/practice-stats', authorize(['admin', 'teacher']), async (req, res) => {
    try {
        const quizId = req.params.quizId;
        const sql = `
            SELECT u.username, u.id as user_id, MAX(ps.score_percentage) as best_score, 
                   COUNT(ps.id) as attempt_count, MAX(ps.completed_at) as last_practiced
            FROM users u
            JOIN practice_scores ps ON u.id = ps.user_id
            WHERE ps.quiz_id = ?
            GROUP BY u.id
            ORDER BY best_score DESC
        `;
        const stats = await queryDb.all(sql, [quizId]);
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reset practice leaderboard for a quiz (Teacher View)
app.delete('/api/quizzes/:quizId/practice', authorize(['admin', 'teacher']), async (req, res) => {
    try {
        const quizId = req.params.quizId;
        const userId = req.user.id;
        const userRole = req.user.role;

        // Check if teacher owns the quiz
        if (userRole === 'teacher') {
            const quiz = await queryDb.get('SELECT author_id FROM quizzes WHERE id = ?', [quizId]);
            if (!quiz || String(quiz.author_id) !== String(userId)) {
                return res.status(403).json({ error: 'Forbidden: You can only reset leaderboards for your own quizzes' });
            }
        }

        await queryDb.run('DELETE FROM practice_scores WHERE quiz_id = ?', [quizId]);
        
        await logAuditEvent({
            actorId: userId,
            actorRole: userRole,
            action: 'practice_reset',
            targetType: 'quiz',
            targetId: quizId,
            details: { message: 'Leaderboard reset by teacher' }
        });

        res.json({ message: 'Practice leaderboard reset' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get student's personal best practice scores
app.get('/api/student/practice-scores', authorize(['student']), async (req, res) => {
    try {
        const userId = req.user.id;
        const scores = await queryDb.all(`
            SELECT quiz_id, MAX(score_percentage) as best_score, MAX(completed_at) as last_practiced
            FROM practice_scores
            WHERE user_id = ?
            GROUP BY quiz_id
        `, [userId]);
        res.json(scores);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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



server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT} (0.0.0.0)`);
});
