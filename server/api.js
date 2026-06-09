import express from 'express';
import bcrypt from 'bcryptjs';
import { logAuditEvent, queryDb } from './database.js';
import { authorize, createLoginSession, clearLoginSession } from './auth.js';
import multer from 'multer';
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { analyzeLongAnswerSession, generateLongAnswerHint, isDeepSeekConfigured, markLongAnswer } from './deepseek.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const uploadDir = join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir)
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        const ext = file.originalname.split('.').pop() || 'tmp';
        cb(null, file.fieldname + '-' + uniqueSuffix + '.' + ext)
    }
});

const upload = multer({ storage: storage });

const router = express.Router();

// --- File Upload ---
router.post('/upload', authorize(['admin', 'teacher']), upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No image uploaded' });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
});

// --- Authentication & Users ---

// Login (Simple auth with bcrypt)
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await queryDb.get(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

        if (user.role === 'teacher' && user.is_approved === 0) {
            return res.status(403).json({ error: 'Your account is pending admin approval' });
        }

        // Remove sensitive data before sending
        const { password_hash, ...safeUser } = user;
        await createLoginSession(res, safeUser);
        res.json({ message: 'Login successful', user: safeUser });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/logout', async (req, res) => {
    await clearLoginSession(req, res);
    res.json({ message: 'Logout successful' });
});

router.get('/me', async (req, res) => {
    if (!req.user) {
        await clearLoginSession(req, res);
        return res.status(401).json({ error: 'Session expired' });
    }

    try {
        const user = await queryDb.get(
            'SELECT * FROM users WHERE id = ?',
            [req.user.id]
        );

        if (!user || (user.role === 'teacher' && user.is_approved === 0)) {
            await clearLoginSession(req, res);
            return res.status(401).json({ error: 'Session expired' });
        }

        const { password_hash, ...safeUser } = user;
        res.json({ user: safeUser });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create User (Admin creates teachers, Teacher creates students)
router.post('/users', authorize(['admin', 'teacher']), async (req, res) => {
    const { username, password, role, form_class, createdBy } = req.body;
    try {
        if (req.user.role === 'teacher' && role !== 'student') {
            return res.status(403).json({ error: 'Teachers can only create student accounts' });
        }

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password || 'password', salt);

        // Teachers are pending (0) by default, students are approved (1) automatically
        const isApproved = role === 'teacher' ? 0 : 1;
        const effectiveCreatorId = req.user.role === 'teacher' ? req.user.id : (createdBy || null);

        const result = await queryDb.run(
            'INSERT INTO users (username, password_hash, role, created_by, is_approved, form_class) VALUES (?, ?, ?, ?, ?, ?)',
            [username, hashedPassword, role, effectiveCreatorId, isApproved, form_class || null]
        );
        await logAuditEvent({
            actorId: req.user.id,
            actorRole: req.user.role,
            action: 'user_created',
            targetType: 'user',
            targetId: result.id,
            details: {
                username,
                role,
                form_class: form_class || null,
                created_by: effectiveCreatorId
            }
        });
        res.json({ id: result.id, username, role, form_class });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get Students for a specific teacher
router.get('/students', authorize(['admin', 'teacher']), async (req, res) => {
    const { teacherId } = req.query;
    try {
        let sql = 'SELECT id, username, created_at FROM users WHERE role = "student"';
        const params = [];
        if (req.user.role === 'teacher') {
            sql += ' AND created_by = ?';
            params.push(req.user.id);
        } else if (teacherId) {
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
router.post('/students/import', authorize(['admin', 'teacher']), async (req, res) => {
    const { bulkText, createdBy } = req.body;
    try {
        const lines = bulkText.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let studentsImported = 0;
        // Pre-hash the default password once to save time
        const salt = await bcrypt.genSalt(10);
        const defaultHashedPassword = await bcrypt.hash('password', salt);
        const effectiveCreatorId = req.user.role === 'teacher' ? req.user.id : (createdBy || null);

        for (const line of lines) {
            const parts = line.split(',');
            if (parts.length >= 1) {
                const username = parts[0].trim();
                const form_class = parts.length > 1 ? parts[1].trim() : null;

                try {
                    await queryDb.run(
                        'INSERT INTO users (username, password_hash, role, created_by, is_approved, form_class) VALUES (?, ?, ?, ?, ?, ?)',
                        [username, defaultHashedPassword, 'student', effectiveCreatorId, 1, form_class]
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
router.get('/students/search', authorize(['admin', 'teacher']), async (req, res) => {
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
router.get('/classes', authorize(['admin', 'teacher']), async (req, res) => {
    const { teacherId } = req.query;
    try {
        const effectiveTeacherId = req.user.role === 'teacher' ? req.user.id : teacherId;
        const classes = await queryDb.all(`
            SELECT c.*, COUNT(cs.student_id) as student_count 
            FROM classes c 
            LEFT JOIN class_students cs ON c.id = cs.class_id
            WHERE c.teacher_id = ?
            GROUP BY c.id
            ORDER BY c.created_at DESC
        `, [effectiveTeacherId]);
        res.json(classes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create a class
router.post('/classes', authorize(['admin', 'teacher']), async (req, res) => {
    const { name, teacherId } = req.body;
    try {
        const effectiveTeacherId = req.user.role === 'teacher' ? req.user.id : teacherId;
        const result = await queryDb.run(
            'INSERT INTO classes (name, teacher_id) VALUES (?, ?)',
            [name, effectiveTeacherId]
        );
        res.json({ id: result.id, name, teacher_id: effectiveTeacherId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get students in a specific class
router.get('/classes/:classId/students', authorize(['admin', 'teacher']), async (req, res) => {
    try {
        if (req.user.role === 'teacher') {
            const ownedClass = await queryDb.get('SELECT id FROM classes WHERE id = ? AND teacher_id = ?', [req.params.classId, req.user.id]);
            if (!ownedClass) return res.status(403).json({ error: 'Forbidden' });
        }

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
router.post('/classes/:classId/students', authorize(['admin', 'teacher']), async (req, res) => {
    const { studentId } = req.body;
    try {
        if (req.user.role === 'teacher') {
            const ownedClass = await queryDb.get('SELECT id FROM classes WHERE id = ? AND teacher_id = ?', [req.params.classId, req.user.id]);
            if (!ownedClass) return res.status(403).json({ error: 'Forbidden' });
        }

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
router.delete('/classes/:classId/students/:studentId', authorize(['admin', 'teacher']), async (req, res) => {
    try {
        if (req.user.role === 'teacher') {
            const ownedClass = await queryDb.get('SELECT id FROM classes WHERE id = ? AND teacher_id = ?', [req.params.classId, req.user.id]);
            if (!ownedClass) return res.status(403).json({ error: 'Forbidden' });
        }

        await queryDb.run(
            'DELETE FROM class_students WHERE class_id = ? AND student_id = ?',
            [req.params.classId, req.params.studentId]
        );
        res.json({ message: 'Student removed from class' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Long Answer Quizzes ---

function safeJsonParse(value, fallback = []) {
    if (!value) return fallback;
    if (Array.isArray(value) || typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function normalizeTextArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value.map(item => {
            if (typeof item === 'string') return item.trim();
            if (item?.criterion) return String(item.criterion).trim();
            return JSON.stringify(item);
        }).filter(Boolean);
    }
    return String(value)
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
}

function normalizeMarkScheme(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
        return value.map(item => {
            if (typeof item === 'string') return { marks: 1, criterion: item };
            return {
                marks: Math.max(1, Number.parseInt(item.marks ?? item.points ?? 1, 10) || 1),
                criterion: String(item.criterion || item.text || item.description || '').trim()
            };
        }).filter(item => item.criterion);
    }
    return normalizeTextArray(value).map(line => ({ marks: 1, criterion: line }));
}

function normalizeAnswerType(value) {
    const normalized = String(value || 'prose').trim().toLowerCase().replace(/[^a-z_]/g, '_');
    return ['prose', 'pseudocode', 'sql'].includes(normalized) ? normalized : 'prose';
}

function getAiErrorResponse(error, fallbackAction = 'AI request') {
    const isAnalysis = fallbackAction === 'AI analysis';
    if (error.code === 'DEEPSEEK_NOT_CONFIGURED') {
        return {
            status: 503,
            error: `${fallbackAction} is not configured yet.`
        };
    }
    if (error.code === 'DEEPSEEK_TIMEOUT') {
        return {
            status: 503,
            error: isAnalysis
                ? 'The AI analysis did not respond in time. Please try again.'
                : 'The AI marker did not respond in time. Your answer was not marked. Please try again.'
        };
    }
    if (error.code === 'DEEPSEEK_CONNECTION_FAILED') {
        return {
            status: 503,
            error: isAnalysis
                ? 'Could not connect to the AI analysis service. Please check the internet connection and try again.'
                : 'Could not connect to the AI marker. Please check the internet connection and try again.'
        };
    }
    if (error.code === 'DEEPSEEK_REQUEST_FAILED') {
        return {
            status: error.status === 401 ? 503 : (error.status || 503),
            error: error.status === 401
                ? 'The AI marker rejected the API key. Please ask the teacher to check the DeepSeek key.'
                : `The AI marker returned an error: ${error.message}`
        };
    }
    if (error.message?.includes('non-JSON') || error.message?.includes('valid whole-number score')) {
        return {
            status: 502,
            error: isAnalysis
                ? 'The AI analysis returned an unexpected response. Please try again.'
                : 'The AI marker returned an unexpected response. Your answer was not marked. Please try again.'
        };
    }
    return null;
}

function flattenLongAnswerQuestions(payload) {
    if (Array.isArray(payload?.questions)) return payload.questions;

    if (payload?.topics && typeof payload.topics === 'object') {
        const questions = [];
        for (const [topicName, groups] of Object.entries(payload.topics)) {
            const groupList = Array.isArray(groups) ? groups : [];
            for (const group of groupList) {
                const groupQuestions = Array.isArray(group.questions) ? group.questions : [];
                groupQuestions.forEach(question => {
                    questions.push({
                        ...question,
                        topic: question.topic || topicName,
                        tags: [...(group.tags || []), ...(question.tags || [])]
                    });
                });
            }
        }
        return questions;
    }

    return [];
}

function normalizeLongAnswerQuestion(question, index, fallbackTopic = 'General') {
    const questionText = String(question.question || question.question_text || question.text || '').trim();
    const maxMarks = Math.max(1, Number.parseInt(question.max_marks ?? question.points ?? question.marks ?? 1, 10) || 1);
    const fallbackShortName = question.topic || (question.id ? String(question.id).trim() : `Question ${index + 1}`);
    return {
        id: question.id,
        bank_question_id: question.bank_question_id || question.bankQuestionId || null,
        short_name: String(question.short_name || question.name || question.title || fallbackShortName).trim(),
        answer_type: normalizeAnswerType(question.answer_type || question.type),
        question_text: questionText,
        student_context: String(question.student_context || question.context || question.source_material || '').trim(),
        ai_context: String(question.ai_context || '').trim(),
        context_image_url: String(question.context_image_url || question.image_url || '').trim(),
        max_marks: maxMarks,
        answer_key: String(question.answer_key || question.answer || question.model_answer || '').trim(),
        mark_scheme: normalizeMarkScheme(question.mark_scheme || question.rubric || question.criteria),
        acceptable_alternatives: normalizeTextArray(question.acceptable_alternatives || question.acceptable_answers || question.alternatives),
        common_misconceptions: normalizeTextArray(question.common_misconceptions || question.misconceptions),
        subject: String(question.subject || '').trim(),
        level: String(question.level || '').trim(),
        topic: String(question.topic || fallbackTopic || 'General').trim() || 'General',
        source: typeof question.source === 'string' ? question.source.trim() : '',
        order_idx: Number.parseInt(question.order_idx ?? index, 10) || index
    };
}

function serializeLongAnswerQuestion(row, includePrivate = false) {
    const base = {
        id: row.id,
        quiz_id: row.quiz_id,
        bank_question_id: row.bank_question_id || null,
        short_name: row.short_name || row.topic || `Question ${(Number.parseInt(row.order_idx, 10) || 0) + 1}`,
        answer_type: row.answer_type || 'prose',
        question_text: row.question_text,
        student_context: row.student_context || '',
        context_image_url: row.context_image_url || '',
        max_marks: row.max_marks,
        topic: row.topic,
        order_idx: row.order_idx
    };

    if (includePrivate) {
        return {
            ...base,
            ai_context: row.ai_context || '',
            answer_key: row.answer_key || '',
            mark_scheme: safeJsonParse(row.mark_scheme, []),
            acceptable_alternatives: safeJsonParse(row.acceptable_alternatives, []),
            common_misconceptions: safeJsonParse(row.common_misconceptions, [])
        };
    }

    return base;
}

function serializeLongAnswerSession(row) {
    if (!row) return row;
    const session = { ...row };
    delete session.ai_analysis;
    return session;
}

function serializeLongAnswerBankQuestion(row) {
    return {
        id: row.id,
        short_name: row.short_name || row.topic || `Question ${row.id}`,
        answer_type: row.answer_type || 'prose',
        question_text: row.question_text,
        student_context: row.student_context || '',
        ai_context: row.ai_context || '',
        context_image_url: row.context_image_url || '',
        max_marks: row.max_marks,
        answer_key: row.answer_key || '',
        mark_scheme: safeJsonParse(row.mark_scheme, []),
        acceptable_alternatives: safeJsonParse(row.acceptable_alternatives, []),
        common_misconceptions: safeJsonParse(row.common_misconceptions, []),
        subject: row.subject || 'General',
        level: row.level || 'General',
        topic: row.topic || 'General',
        source: row.source || '',
        is_archived: row.is_archived || 0,
        created_by: row.created_by || null,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

function bankQuestionToSnapshot(row, index) {
    return {
        bank_question_id: row.id,
        short_name: row.short_name || `Question ${index + 1}`,
        answer_type: row.answer_type || 'prose',
        question_text: row.question_text,
        student_context: row.student_context || '',
        ai_context: row.ai_context || '',
        context_image_url: row.context_image_url || '',
        max_marks: row.max_marks,
        answer_key: row.answer_key || '',
        mark_scheme: safeJsonParse(row.mark_scheme, []),
        acceptable_alternatives: safeJsonParse(row.acceptable_alternatives, []),
        common_misconceptions: safeJsonParse(row.common_misconceptions, []),
        topic: row.topic || 'General',
        order_idx: index
    };
}

async function canTeacherManageLongAnswerQuiz(quizId, teacherId) {
    const row = await queryDb.get(
        'SELECT id FROM long_answer_quizzes WHERE id = ? AND teacher_id = ?',
        [quizId, teacherId]
    );
    return !!row;
}

async function getLongAnswerQuestionForMarking(sessionId, questionId, studentId = null) {
    const params = [sessionId, questionId];
    let studentJoin = '';
    let notSubmitted = '';
    if (studentId) {
        studentJoin = 'JOIN class_students cs ON cs.class_id = las.class_id AND cs.student_id = ?';
        notSubmitted = `
            AND NOT EXISTS (
                SELECT 1
                FROM long_answer_submissions submission
                WHERE submission.session_id = las.id AND submission.student_id = ?
            )
        `;
    }

    return queryDb.get(`
        SELECT laq.*
        FROM long_answer_sessions las
        JOIN long_answer_questions laq ON laq.quiz_id = las.quiz_id
        ${studentJoin}
        WHERE las.id = ? AND laq.id = ? AND las.status = 'active'
        ${notSubmitted}
    `, studentId ? [studentId, sessionId, questionId, studentId] : params);
}

async function getLongAnswerQuestionSnapshot(sessionId, questionId) {
    return queryDb.get(`
        SELECT laq.*
        FROM long_answer_sessions las
        JOIN long_answer_questions laq ON laq.quiz_id = las.quiz_id
        WHERE las.id = ? AND laq.id = ?
    `, [sessionId, questionId]);
}

async function saveLongAnswerResponse({ sessionId, questionId, studentId, answerText, aiResult = null, markingPending = false }) {
    const aiScore = aiResult ? aiResult.score : null;
    const aiFeedback = aiResult
        ? aiResult.feedback
        : markingPending ? 'AI marking is still running.' : null;
    const aiImprovements = aiResult ? aiResult.improvements : [];
    const aiConfidence = aiResult
        ? aiResult.confidence
        : markingPending ? 'pending' : null;
    const aiRaw = aiResult ? aiResult.raw : null;

    return queryDb.run(`
        INSERT INTO long_answer_responses
            (session_id, question_id, student_id, answer_text, ai_score, ai_feedback, ai_improvements, ai_confidence, ai_raw, submitted_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(session_id, question_id, student_id) DO UPDATE SET
            answer_text = excluded.answer_text,
            ai_score = excluded.ai_score,
            ai_feedback = excluded.ai_feedback,
            ai_improvements = excluded.ai_improvements,
            ai_confidence = excluded.ai_confidence,
            ai_raw = excluded.ai_raw,
            teacher_score = NULL,
            teacher_feedback = NULL,
            submitted_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
    `, [
        sessionId,
        questionId,
        studentId,
        answerText,
        aiScore,
        aiFeedback,
        JSON.stringify(aiImprovements),
        aiConfidence,
        aiRaw ? JSON.stringify(aiRaw) : null
    ]);
}

async function markSavedLongAnswerResponse({ sessionId, questionId, studentId, answerText }) {
    try {
        const question = await getLongAnswerQuestionSnapshot(sessionId, questionId);
        if (!question) return;

        const aiResult = await markLongAnswer({ question, answerText });
        await queryDb.run(`
            UPDATE long_answer_responses
            SET ai_score = ?,
                ai_feedback = ?,
                ai_improvements = ?,
                ai_confidence = ?,
                ai_raw = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE session_id = ?
              AND question_id = ?
              AND student_id = ?
              AND answer_text = ?
        `, [
            aiResult.score,
            aiResult.feedback,
            JSON.stringify(aiResult.improvements),
            aiResult.confidence,
            JSON.stringify(aiResult.raw),
            sessionId,
            questionId,
            studentId,
            answerText
        ]);
    } catch (error) {
        const message = error?.message || 'Unknown AI marking error';
        console.error('Background long-answer marking failed:', message);
        await queryDb.run(`
            UPDATE long_answer_responses
            SET ai_feedback = ?,
                ai_improvements = ?,
                ai_confidence = 'error',
                updated_at = CURRENT_TIMESTAMP
            WHERE session_id = ?
              AND question_id = ?
              AND student_id = ?
              AND answer_text = ?
              AND ai_confidence = 'pending'
        `, [
            `AI marking failed in the background: ${message}`,
            JSON.stringify([]),
            sessionId,
            questionId,
            studentId,
            answerText
        ]);
    }
}

async function getLongAnswerSessionForUser(sessionId, user) {
    if (user.role === 'admin') {
        return queryDb.get('SELECT * FROM long_answer_sessions WHERE id = ?', [sessionId]);
    }
    if (user.role === 'teacher') {
        return queryDb.get('SELECT * FROM long_answer_sessions WHERE id = ? AND teacher_id = ?', [sessionId, user.id]);
    }
    return queryDb.get(`
        SELECT las.*
        FROM long_answer_sessions las
        JOIN class_students cs ON cs.class_id = las.class_id
        WHERE las.id = ? AND cs.student_id = ?
    `, [sessionId, user.id]);
}

router.get('/long-answer/config', authorize(['admin', 'teacher', 'student']), async (_req, res) => {
    res.json({
        deepseekConfigured: isDeepSeekConfigured(),
        model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro'
    });
});

router.get('/long-answer/bank/questions', authorize(['teacher', 'admin']), async (req, res) => {
    const { subject, level, topic, type, q } = req.query;
    try {
        let sql = `
            SELECT labq.*, u.username as created_by_name
            FROM long_answer_bank_questions labq
            LEFT JOIN users u ON u.id = labq.created_by
            WHERE labq.is_archived = 0
        `;
        const params = [];

        if (subject) {
            sql += ' AND labq.subject = ?';
            params.push(subject);
        }
        if (level) {
            sql += ' AND labq.level = ?';
            params.push(level);
        }
        if (topic) {
            sql += ' AND labq.topic = ?';
            params.push(topic);
        }
        if (type && ['prose', 'pseudocode', 'sql'].includes(String(type))) {
            sql += ' AND labq.answer_type = ?';
            params.push(type);
        }
        if (q && String(q).trim()) {
            sql += ' AND (labq.short_name LIKE ? OR labq.question_text LIKE ? OR labq.student_context LIKE ? OR labq.topic LIKE ?)';
            const term = `%${String(q).trim()}%`;
            params.push(term, term, term, term);
        }

        sql += " ORDER BY labq.subject ASC, labq.level ASC, COALESCE(NULLIF(labq.short_name, ''), labq.topic) ASC, labq.id ASC LIMIT 500";

        const rows = await queryDb.all(sql, params);
        res.json(rows.map(serializeLongAnswerBankQuestion));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/admin/long-answer/bank/import', authorize(['admin']), async (req, res) => {
    const source = req.body.source || req.body;
    const questionsInput = flattenLongAnswerQuestions(source);
    const subject = String(req.body.subject || source.subject || 'General').trim() || 'General';
    const level = String(req.body.level || source.level || 'General').trim() || 'General';
    const topic = String(req.body.topic || source.topic || 'General').trim() || 'General';
    const sourceName = String(req.body.sourceName || source.title || source.name || '').trim();

    if (!questionsInput.length) return res.status(400).json({ error: 'At least one long-answer question is required' });

    const normalizedQuestions = questionsInput
        .map((question, index) => normalizeLongAnswerQuestion(question, index, question.topic || topic))
        .filter(question => question.question_text && (question.answer_key || question.mark_scheme.length));

    if (!normalizedQuestions.length) {
        return res.status(400).json({ error: 'No valid questions found. Each question needs question text plus an answer key or mark scheme.' });
    }

    try {
        let imported = 0;
        for (const question of normalizedQuestions) {
            await queryDb.run(`
                INSERT INTO long_answer_bank_questions
                    (created_by, short_name, answer_type, question_text, student_context, ai_context, context_image_url, max_marks, answer_key, mark_scheme, acceptable_alternatives, common_misconceptions, subject, level, topic, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                req.user.id,
                question.short_name,
                question.answer_type,
                question.question_text,
                question.student_context,
                question.ai_context,
                question.context_image_url,
                question.max_marks,
                question.answer_key,
                JSON.stringify(question.mark_scheme),
                JSON.stringify(question.acceptable_alternatives),
                JSON.stringify(question.common_misconceptions),
                question.subject || subject,
                question.level || level,
                question.topic || topic,
                question.source || sourceName
            ]);
            imported += 1;
        }

        await logAuditEvent({
            actorId: req.user.id,
            actorRole: req.user.role,
            action: 'long_answer_bank_imported',
            targetType: 'long_answer_bank',
            details: { imported, subject, level, topic, source: sourceName }
        });

        res.json({ message: 'Long-answer bank questions imported', questionsImported: imported });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/admin/long-answer/bank/questions', authorize(['admin']), async (req, res) => {
    const question = normalizeLongAnswerQuestion(req.body, 0, req.body.topic || 'General');
    const subject = String(req.body.subject || 'General').trim() || 'General';
    const level = String(req.body.level || 'General').trim() || 'General';
    const source = String(req.body.source || '').trim();

    if (!question.question_text) return res.status(400).json({ error: 'Question text is required' });
    if (!question.answer_key && !question.mark_scheme.length) {
        return res.status(400).json({ error: 'Answer key or mark scheme is required' });
    }

    try {
        const result = await queryDb.run(`
            INSERT INTO long_answer_bank_questions
                (created_by, short_name, answer_type, question_text, student_context, ai_context, context_image_url, max_marks, answer_key, mark_scheme, acceptable_alternatives, common_misconceptions, subject, level, topic, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            req.user.id,
            question.short_name,
            question.answer_type,
            question.question_text,
            question.student_context,
            question.ai_context,
            question.context_image_url,
            question.max_marks,
            question.answer_key,
            JSON.stringify(question.mark_scheme),
            JSON.stringify(question.acceptable_alternatives),
            JSON.stringify(question.common_misconceptions),
            subject,
            level,
            question.topic,
            source
        ]);

        const saved = await queryDb.get('SELECT * FROM long_answer_bank_questions WHERE id = ?', [result.id]);
        res.json({ question: serializeLongAnswerBankQuestion(saved) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/admin/long-answer/bank/questions/:questionId', authorize(['admin']), async (req, res) => {
    const question = normalizeLongAnswerQuestion(req.body, 0, req.body.topic || 'General');
    const subject = String(req.body.subject || 'General').trim() || 'General';
    const level = String(req.body.level || 'General').trim() || 'General';
    const source = String(req.body.source || '').trim();

    if (!question.question_text) return res.status(400).json({ error: 'Question text is required' });
    if (!question.answer_key && !question.mark_scheme.length) {
        return res.status(400).json({ error: 'Answer key or mark scheme is required' });
    }

    try {
        const existing = await queryDb.get('SELECT id FROM long_answer_bank_questions WHERE id = ? AND is_archived = 0', [req.params.questionId]);
        if (!existing) return res.status(404).json({ error: 'Question not found' });

        await queryDb.run(`
            UPDATE long_answer_bank_questions
            SET short_name = ?, answer_type = ?, question_text = ?, student_context = ?, ai_context = ?, context_image_url = ?,
                max_marks = ?, answer_key = ?, mark_scheme = ?, acceptable_alternatives = ?,
                common_misconceptions = ?, subject = ?, level = ?, topic = ?, source = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            question.short_name,
            question.answer_type,
            question.question_text,
            question.student_context,
            question.ai_context,
            question.context_image_url,
            question.max_marks,
            question.answer_key,
            JSON.stringify(question.mark_scheme),
            JSON.stringify(question.acceptable_alternatives),
            JSON.stringify(question.common_misconceptions),
            subject,
            level,
            question.topic,
            source,
            req.params.questionId
        ]);

        const saved = await queryDb.get('SELECT * FROM long_answer_bank_questions WHERE id = ?', [req.params.questionId]);
        res.json({ question: serializeLongAnswerBankQuestion(saved) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/admin/long-answer/bank/questions/:questionId/archive', authorize(['admin']), async (req, res) => {
    try {
        await queryDb.run('UPDATE long_answer_bank_questions SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.questionId]);
        res.json({ message: 'Long-answer bank question archived' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/long-answer/quizzes', authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const params = [];
        let where = 'WHERE laq.is_archived = 0';
        if (req.user.role === 'teacher') {
            where += ' AND laq.teacher_id = ?';
            params.push(req.user.id);
        }

        const rows = await queryDb.all(`
            SELECT laq.*, COUNT(q.id) as question_count
            FROM long_answer_quizzes laq
            LEFT JOIN long_answer_questions q ON q.quiz_id = laq.id
            ${where}
            GROUP BY laq.id
            ORDER BY datetime(laq.created_at) DESC, laq.id DESC
        `, params);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/long-answer/quizzes', authorize(['teacher', 'admin']), async (req, res) => {
    const source = req.body.source || req.body;
    const bankQuestionIds = Array.isArray(req.body.bankQuestionIds || req.body.questionIds)
        ? (req.body.bankQuestionIds || req.body.questionIds)
            .map(id => Number.parseInt(id, 10))
            .filter(Number.isFinite)
        : [];
    const questionsInput = bankQuestionIds.length ? [] : flattenLongAnswerQuestions(source);
    const title = String(req.body.title || source.title || source.name || 'Long Answer Quiz').trim();
    const description = String(req.body.description || source.description || '').trim();
    const subject = String(req.body.subject || source.subject || 'General').trim() || 'General';
    const level = String(req.body.level || source.level || 'General').trim() || 'General';
    const topic = String(req.body.topic || source.topic || 'General').trim() || 'General';

    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!questionsInput.length && !bankQuestionIds.length) return res.status(400).json({ error: 'At least one long-answer question is required' });
    if (!bankQuestionIds.length && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Teachers can build long-answer quizzes from the approved question bank. Ask an admin to add or edit bank questions.' });
    }

    let normalizedQuestions = [];

    if (!bankQuestionIds.length) {
        normalizedQuestions = questionsInput
            .map((question, index) => normalizeLongAnswerQuestion(question, index, topic))
            .filter(question => question.question_text && (question.answer_key || question.mark_scheme.length));

        if (!normalizedQuestions.length) {
            return res.status(400).json({ error: 'No valid questions found. Each question needs question text plus an answer key or mark scheme.' });
        }
    }

    try {
        if (bankQuestionIds.length) {
            const placeholders = bankQuestionIds.map(() => '?').join(',');
            const bankRows = await queryDb.all(
                `SELECT * FROM long_answer_bank_questions WHERE id IN (${placeholders}) AND is_archived = 0`,
                bankQuestionIds
            );
            const byId = new Map(bankRows.map(row => [Number(row.id), row]));
            normalizedQuestions = bankQuestionIds
                .map((id, index) => byId.has(id) ? bankQuestionToSnapshot(byId.get(id), index) : null)
                .filter(Boolean);

            if (!normalizedQuestions.length) {
                return res.status(400).json({ error: 'No valid approved bank questions were found.' });
            }
        }

        const quizResult = await queryDb.run(`
            INSERT INTO long_answer_quizzes (teacher_id, title, description, subject, level, topic, source_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [req.user.id, title, description, subject, level, topic, JSON.stringify(source)]);

        for (const question of normalizedQuestions) {
            await queryDb.run(`
                INSERT INTO long_answer_questions
                    (quiz_id, bank_question_id, short_name, answer_type, question_text, student_context, ai_context, context_image_url, max_marks, answer_key, mark_scheme, acceptable_alternatives, common_misconceptions, topic, order_idx)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                quizResult.id,
                question.bank_question_id || null,
                question.short_name || '',
                question.answer_type,
                question.question_text,
                question.student_context || '',
                question.ai_context || '',
                question.context_image_url || '',
                question.max_marks,
                question.answer_key,
                JSON.stringify(question.mark_scheme),
                JSON.stringify(question.acceptable_alternatives),
                JSON.stringify(question.common_misconceptions),
                question.topic,
                question.order_idx
            ]);
        }

        await logAuditEvent({
            actorId: req.user.id,
            actorRole: req.user.role,
            action: 'long_answer_quiz_created',
            targetType: 'long_answer_quiz',
            targetId: quizResult.id,
            details: { title, question_count: normalizedQuestions.length }
        });

        res.json({ id: quizResult.id, title, questionsImported: normalizedQuestions.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/long-answer/quizzes/:quizId', authorize(['teacher', 'admin']), async (req, res) => {
    try {
        if (req.user.role === 'teacher' && !(await canTeacherManageLongAnswerQuiz(req.params.quizId, req.user.id))) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const quiz = await queryDb.get('SELECT * FROM long_answer_quizzes WHERE id = ?', [req.params.quizId]);
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
        const questions = await queryDb.all(
            'SELECT * FROM long_answer_questions WHERE quiz_id = ? ORDER BY order_idx ASC, id ASC',
            [req.params.quizId]
        );
        res.json({ ...quiz, questions: questions.map(question => serializeLongAnswerQuestion(question, true)) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/long-answer/quizzes/:quizId/archive', authorize(['teacher', 'admin']), async (req, res) => {
    try {
        if (req.user.role === 'teacher' && !(await canTeacherManageLongAnswerQuiz(req.params.quizId, req.user.id))) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        await queryDb.run('UPDATE long_answer_quizzes SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.quizId]);
        res.json({ message: 'Long-answer quiz archived' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/long-answer/sessions/teacher', authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const params = [];
        let where = 'WHERE las.status != "archived"';
        if (req.user.role === 'teacher') {
            where += ' AND las.teacher_id = ?';
            params.push(req.user.id);
        }

        const sessions = await queryDb.all(`
            SELECT las.*, laq.title as quiz_title, c.name as class_name,
                   COUNT(DISTINCT cs.student_id) as total_students,
                   COUNT(DISTINCT submission.student_id) as submitted_students
            FROM long_answer_sessions las
            JOIN long_answer_quizzes laq ON laq.id = las.quiz_id
            LEFT JOIN classes c ON c.id = las.class_id
            LEFT JOIN class_students cs ON cs.class_id = las.class_id
            LEFT JOIN long_answer_submissions submission ON submission.session_id = las.id
            ${where}
            GROUP BY las.id
            ORDER BY datetime(las.created_at) DESC, las.id DESC
        `, params);
        res.json(sessions.map(serializeLongAnswerSession));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/long-answer/sessions', authorize(['teacher', 'admin']), async (req, res) => {
    const { quizId, classId, name, mode = 'async', releaseFeedback = false, allowAiHints = true, expiresAt = null } = req.body;
    if (!quizId || !classId) return res.status(400).json({ error: 'Quiz and class are required' });

    try {
        if (req.user.role === 'teacher') {
            if (!(await canTeacherManageLongAnswerQuiz(quizId, req.user.id))) {
                return res.status(403).json({ error: 'Forbidden' });
            }
            const ownedClass = await queryDb.get('SELECT id FROM classes WHERE id = ? AND teacher_id = ?', [classId, req.user.id]);
            if (!ownedClass) return res.status(403).json({ error: 'Forbidden' });
        }

        const result = await queryDb.run(`
            INSERT INTO long_answer_sessions (quiz_id, teacher_id, class_id, name, mode, status, release_feedback, allow_ai_hints, expires_at)
            SELECT ?, ?, ?, ?, ?, 'active', ?, ?, ?
            WHERE NOT EXISTS (
                SELECT 1
                FROM long_answer_sessions
                WHERE quiz_id = ? AND class_id = ? AND status = 'active'
            )
        `, [
            quizId,
            req.user.id,
            classId,
            String(name || '').trim() || null,
            ['live', 'async'].includes(mode) ? mode : 'async',
            releaseFeedback ? 1 : 0,
            allowAiHints ? 1 : 0,
            expiresAt || null,
            quizId,
            classId
        ]);
        if (result.changes === 0) {
            return res.status(409).json({
                error: 'This quiz is already assigned to this class in an active session. Close the existing session before assigning it again.'
            });
        }

        res.json({ id: result.id, sessionId: result.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/long-answer/sessions/student/:studentId', authorize(['student', 'teacher', 'admin']), async (req, res) => {
    if (req.user.role === 'student' && String(req.user.id) !== String(req.params.studentId)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        const sessions = await queryDb.all(`
            SELECT las.*, laq.title as quiz_title, laq.subject, laq.level, laq.topic, c.name as class_name,
                   u.username as teacher_name,
                   COUNT(q.id) as question_count,
                   COUNT(r.id) as response_count,
                   CASE WHEN submission.student_id IS NULL OR COALESCE(las.release_feedback, 0) != 1
                       THEN NULL
                       ELSE SUM(COALESCE(r.ai_score, 0))
                   END as ai_total,
                   CASE WHEN submission.student_id IS NULL OR COALESCE(las.release_feedback, 0) != 1
                       THEN NULL
                       ELSE SUM(COALESCE(r.teacher_score, r.ai_score, 0))
                   END as score_total,
                   SUM(q.max_marks) as max_total,
                   CASE WHEN submission.student_id IS NULL THEN 0 ELSE 1 END as is_submitted,
                   submission.submitted_at as completed_at
            FROM long_answer_sessions las
            JOIN long_answer_quizzes laq ON laq.id = las.quiz_id
            JOIN classes c ON c.id = las.class_id
            JOIN class_students cs ON cs.class_id = c.id
            JOIN users u ON u.id = las.teacher_id
            LEFT JOIN long_answer_questions q ON q.quiz_id = laq.id
            LEFT JOIN long_answer_responses r
                ON r.session_id = las.id
               AND r.question_id = q.id
               AND r.student_id = cs.student_id
            LEFT JOIN long_answer_submissions submission
                ON submission.session_id = las.id
               AND submission.student_id = cs.student_id
            WHERE cs.student_id = ? AND las.status != 'archived'
            GROUP BY las.id
            ORDER BY datetime(las.created_at) DESC, las.id DESC
        `, [req.params.studentId]);
        res.json(sessions.map(serializeLongAnswerSession));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/long-answer/sessions/:sessionId', authorize(['student', 'teacher', 'admin']), async (req, res) => {
    try {
        const session = await getLongAnswerSessionForUser(req.params.sessionId, req.user);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const quiz = await queryDb.get('SELECT * FROM long_answer_quizzes WHERE id = ?', [session.quiz_id]);
        const includePrivate = req.user.role === 'admin' || String(session.teacher_id) === String(req.user.id);
        const questionRows = await queryDb.all(
            'SELECT * FROM long_answer_questions WHERE quiz_id = ? ORDER BY order_idx ASC, id ASC',
            [session.quiz_id]
        );
        const questions = questionRows.map(question => serializeLongAnswerQuestion(question, includePrivate));
        const savedAnalysis = includePrivate ? safeJsonParse(session.ai_analysis, null) : null;

        let responses;
        let studentRoster = [];
        let submission = null;
        let feedbackReleased = Number(session.release_feedback) === 1;
        if (includePrivate) {
            responses = await queryDb.all(`
                SELECT r.*, u.username as student_name
                FROM long_answer_responses r
                JOIN users u ON u.id = r.student_id
                WHERE r.session_id = ?
                ORDER BY datetime(r.submitted_at) DESC, r.id DESC
            `, [session.id]);
            if (session.class_id) {
                studentRoster = await queryDb.all(`
                    SELECT u.id as student_id,
                           u.username as student_name,
                           u.form_class,
                           submission.submitted_at,
                           COUNT(r.id) as response_count
                    FROM class_students cs
                    JOIN users u ON u.id = cs.student_id
                    LEFT JOIN long_answer_submissions submission
                        ON submission.session_id = ?
                       AND submission.student_id = u.id
                    LEFT JOIN long_answer_responses r
                        ON r.session_id = ?
                       AND r.student_id = u.id
                    WHERE cs.class_id = ?
                    GROUP BY u.id
                    ORDER BY u.username COLLATE NOCASE ASC
                `, [session.id, session.id, session.class_id]);
            }
        } else {
            submission = await queryDb.get(
                'SELECT submitted_at FROM long_answer_submissions WHERE session_id = ? AND student_id = ?',
                [session.id, req.user.id]
            );
            feedbackReleased = feedbackReleased && !!submission;
            responses = await queryDb.all(`
                SELECT id, session_id, question_id, student_id, answer_text,
                       ${feedbackReleased ? `
                           ai_score, ai_feedback, ai_improvements, ai_confidence,
                           teacher_score, teacher_feedback,
                       ` : ''}
                       submitted_at, updated_at
                FROM long_answer_responses
                WHERE session_id = ? AND student_id = ?
            `, [session.id, req.user.id]);
        }

        res.json({
            session: serializeLongAnswerSession(session),
            quiz,
            questions,
            responses,
            studentRoster,
            submission,
            feedbackReleased,
            savedAnalysis
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/long-answer/sessions/:sessionId/analyze', authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const session = await getLongAnswerSessionForUser(req.params.sessionId, req.user);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const quiz = await queryDb.get('SELECT * FROM long_answer_quizzes WHERE id = ?', [session.quiz_id]);
        const questions = await queryDb.all(
            'SELECT * FROM long_answer_questions WHERE quiz_id = ? ORDER BY order_idx ASC, id ASC',
            [session.quiz_id]
        );
        const responses = await queryDb.all(`
            SELECT question_id, answer_text, ai_score, ai_feedback, ai_improvements, teacher_score
            FROM long_answer_responses
            WHERE session_id = ?
            ORDER BY question_id ASC, id ASC
        `, [session.id]);

        if (responses.length === 0) {
            return res.status(400).json({ error: 'There are no student responses to analyze yet.' });
        }

        const analysis = await analyzeLongAnswerSession({ quiz, questions, responses });
        const savedAnalysis = {
            ...analysis,
            responseCount: responses.length,
            questionCount: questions.length,
            generatedAt: new Date().toISOString()
        };
        await queryDb.run(
            'UPDATE long_answer_sessions SET ai_analysis = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [JSON.stringify(savedAnalysis), session.id]
        );
        res.json(savedAnalysis);
    } catch (error) {
        const aiError = getAiErrorResponse(error, 'AI analysis');
        if (aiError) return res.status(aiError.status).json({ error: aiError.error });
        res.status(500).json({ error: error.message });
    }
});

router.post('/long-answer/sessions/:sessionId/questions/:questionId/help', authorize(['student']), async (req, res) => {
    const { answerText = '' } = req.body;
    try {
        const session = await getLongAnswerSessionForUser(req.params.sessionId, req.user);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (Number(session.allow_ai_hints) !== 1) {
            return res.status(403).json({ error: 'AI hints are disabled for this quiz.' });
        }
        const question = await getLongAnswerQuestionForMarking(req.params.sessionId, req.params.questionId, req.user.id);
        if (!question) return res.status(404).json({ error: 'Question not found or not available' });

        const hint = await generateLongAnswerHint({ question, answerText });
        await queryDb.run(`
            INSERT INTO long_answer_help_logs (session_id, question_id, student_id, answer_text, hint_text)
            VALUES (?, ?, ?, ?, ?)
        `, [req.params.sessionId, req.params.questionId, req.user.id, answerText, hint.hint]);
        res.json(hint);
    } catch (error) {
        const aiError = getAiErrorResponse(error, 'AI help');
        if (aiError) return res.status(aiError.status).json({ error: aiError.error });
        res.status(500).json({ error: error.message });
    }
});

router.post('/long-answer/sessions/:sessionId/questions/:questionId/submit', authorize(['student']), async (req, res) => {
    const answerText = String(req.body.answerText || '').trim();
    if (!answerText) return res.status(400).json({ error: 'Answer text is required' });

    try {
        const session = await getLongAnswerSessionForUser(req.params.sessionId, req.user);
        if (!session) return res.status(404).json({ error: 'Session not found' });

        const question = await getLongAnswerQuestionForMarking(req.params.sessionId, req.params.questionId, req.user.id);
        if (!question) return res.status(404).json({ error: 'Question not found or not available' });

        const completedSubmission = await queryDb.get(
            'SELECT id FROM long_answer_submissions WHERE session_id = ? AND student_id = ?',
            [req.params.sessionId, req.user.id]
        );
        if (completedSubmission) {
            return res.status(409).json({ error: 'This quiz has already been submitted. Answers can no longer be changed.' });
        }

        const feedbackIsImmediate = Number(session.release_feedback) === 1;
        let result;

        if (feedbackIsImmediate) {
            const aiResult = await markLongAnswer({ question, answerText });
            result = await saveLongAnswerResponse({
                sessionId: req.params.sessionId,
                questionId: req.params.questionId,
                studentId: req.user.id,
                answerText,
                aiResult
            });

            return res.json({
                id: result.id,
                question_id: Number(req.params.questionId),
                answer_text: answerText,
                markingPending: false
            });
        }

        result = await saveLongAnswerResponse({
            sessionId: req.params.sessionId,
            questionId: req.params.questionId,
            studentId: req.user.id,
            answerText,
            markingPending: true
        });

        res.json({
            id: result.id,
            question_id: Number(req.params.questionId),
            answer_text: answerText,
            markingPending: true
        });

        markSavedLongAnswerResponse({
            sessionId: req.params.sessionId,
            questionId: req.params.questionId,
            studentId: req.user.id,
            answerText
        });
    } catch (error) {
        const aiError = getAiErrorResponse(error, 'AI marking');
        if (aiError) return res.status(aiError.status).json({ error: aiError.error });
        res.status(500).json({ error: error.message });
    }
});

router.post('/long-answer/sessions/:sessionId/complete', authorize(['student']), async (req, res) => {
    try {
        const session = await getLongAnswerSessionForUser(req.params.sessionId, req.user);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        if (session.status !== 'active') {
            return res.status(400).json({ error: 'This quiz is no longer open for submission.' });
        }

        const totals = await queryDb.get(`
            SELECT COUNT(q.id) as question_count, COUNT(r.id) as response_count
            FROM long_answer_questions q
            LEFT JOIN long_answer_responses r
                ON r.question_id = q.id
               AND r.session_id = ?
               AND r.student_id = ?
            WHERE q.quiz_id = ?
        `, [session.id, req.user.id, session.quiz_id]);
        if (!totals.question_count || totals.response_count < totals.question_count) {
            return res.status(400).json({ error: 'Submit an answer for every question before finishing the quiz.' });
        }

        await queryDb.run(`
            INSERT INTO long_answer_submissions (session_id, student_id, submitted_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(session_id, student_id) DO NOTHING
        `, [session.id, req.user.id]);
        const submission = await queryDb.get(
            'SELECT submitted_at FROM long_answer_submissions WHERE session_id = ? AND student_id = ?',
            [session.id, req.user.id]
        );
        res.json({ message: 'Long-answer quiz submitted', submission });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/long-answer/responses/:responseId/review', authorize(['teacher', 'admin']), async (req, res) => {
    const { teacherScore, teacherFeedback = '', clearOverride = false } = req.body;
    try {
        const response = await queryDb.get(`
            SELECT r.*, las.teacher_id, q.max_marks
            FROM long_answer_responses r
            JOIN long_answer_sessions las ON las.id = r.session_id
            JOIN long_answer_questions q ON q.id = r.question_id
            WHERE r.id = ?
        `, [req.params.responseId]);
        if (!response) return res.status(404).json({ error: 'Response not found' });
        if (req.user.role === 'teacher' && String(response.teacher_id) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        if (clearOverride) {
            await queryDb.run(`
                UPDATE long_answer_responses
                SET teacher_score = NULL, teacher_feedback = NULL, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [req.params.responseId]);
            const savedResponse = await queryDb.get(
                'SELECT teacher_score, teacher_feedback, updated_at FROM long_answer_responses WHERE id = ?',
                [req.params.responseId]
            );
            return res.json({ message: 'Teacher override removed', ...savedResponse });
        }

        const score = Number(teacherScore);
        if (!Number.isInteger(score) || score < 0 || score > response.max_marks) {
            return res.status(400).json({ error: `Teacher score must be a whole number from 0 to ${response.max_marks}` });
        }
        const feedback = String(teacherFeedback || '').trim();
        await queryDb.run(`
            UPDATE long_answer_responses
            SET teacher_score = ?, teacher_feedback = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [score, feedback, req.params.responseId]);
        const savedResponse = await queryDb.get(
            'SELECT teacher_score, teacher_feedback, updated_at FROM long_answer_responses WHERE id = ?',
            [req.params.responseId]
        );
        res.json({ message: 'Review saved', ...savedResponse });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/long-answer/sessions/:sessionId/status', authorize(['teacher', 'admin']), async (req, res) => {
    const status = String(req.body.status || '').toLowerCase();
    if (!['active', 'completed', 'archived'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const session = await getLongAnswerSessionForUser(req.params.sessionId, req.user);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        await queryDb.run('UPDATE long_answer_sessions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, req.params.sessionId]);
        res.json({ message: 'Session status updated', status });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/long-answer/sessions/:sessionId/feedback-release', authorize(['teacher', 'admin']), async (req, res) => {
    const releaseFeedback = req.body.releaseFeedback === true;
    try {
        const session = await getLongAnswerSessionForUser(req.params.sessionId, req.user);
        if (!session) return res.status(404).json({ error: 'Session not found' });
        await queryDb.run(
            'UPDATE long_answer_sessions SET release_feedback = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [releaseFeedback ? 1 : 0, req.params.sessionId]
        );
        res.json({
            message: releaseFeedback ? 'Marks and feedback released' : 'Marks and feedback held',
            release_feedback: releaseFeedback ? 1 : 0
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Exit Tickets ---

async function canTeacherManageExitTicket(ticketId, teacherId) {
    const ticket = await queryDb.get(
        'SELECT id FROM exit_tickets WHERE id = ? AND teacher_id = ?',
        [ticketId, teacherId]
    );
    return !!ticket;
}

async function canStudentAccessExitTicket(ticketId, studentId) {
    const ticket = await queryDb.get(`
        SELECT et.id
        FROM exit_tickets et
        JOIN class_students cs ON cs.class_id = et.class_id
        WHERE et.id = ? AND cs.student_id = ? AND et.status = 'open'
    `, [ticketId, studentId]);
    return !!ticket;
}

async function getExitTicketWithPrompts(ticketId) {
    const ticket = await queryDb.get(`
        SELECT et.*, c.name as class_name, u.username as teacher_name
        FROM exit_tickets et
        JOIN classes c ON c.id = et.class_id
        JOIN users u ON u.id = et.teacher_id
        WHERE et.id = ?
    `, [ticketId]);

    if (!ticket) return null;

    const prompts = await queryDb.all(
        'SELECT * FROM exit_ticket_prompts WHERE ticket_id = ? ORDER BY order_idx ASC, id ASC',
        [ticketId]
    );

    return { ...ticket, prompts };
}

function cleanPromptText(prompt) {
    return String(prompt?.prompt_text || prompt?.text || '').trim();
}

function normalizeTicketStatus(status) {
    const normalized = String(status || 'open').trim().toLowerCase();
    return ['draft', 'open', 'closed', 'archived'].includes(normalized) ? normalized : 'open';
}

router.get('/exit-tickets/teacher', authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const teacherId = req.user.role === 'teacher' ? req.user.id : req.query.teacherId;
        if (!teacherId) return res.status(400).json({ error: 'teacherId is required' });
        const includeArchived = req.query.includeArchived === 'true';

        const tickets = await queryDb.all(`
            SELECT
                et.*,
                c.name as class_name,
                COUNT(DISTINCT p.id) as prompt_count,
                COUNT(DISTINCT r.id) as response_count
            FROM exit_tickets et
            JOIN classes c ON c.id = et.class_id
            LEFT JOIN exit_ticket_prompts p ON p.ticket_id = et.id AND p.is_archived = 0
            LEFT JOIN exit_ticket_responses r ON r.ticket_id = et.id
            WHERE et.teacher_id = ? AND (? = 1 OR et.status != 'archived')
            GROUP BY et.id
            ORDER BY CASE WHEN et.status = 'archived' THEN 1 ELSE 0 END ASC, datetime(et.updated_at) DESC, et.id DESC
        `, [teacherId, includeArchived ? 1 : 0]);

        res.json(tickets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/exit-tickets/student/:studentId', authorize(['student', 'admin', 'teacher']), async (req, res) => {
    try {
        if (req.user.role === 'student' && String(req.user.id) !== String(req.params.studentId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const tickets = await queryDb.all(`
            SELECT
                et.*,
                c.name as class_name,
                u.username as teacher_name,
                COUNT(DISTINCT p.id) as prompt_count,
                CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END as is_submitted,
                r.submitted_at
            FROM exit_tickets et
            JOIN classes c ON c.id = et.class_id
            JOIN users u ON u.id = et.teacher_id
            JOIN class_students cs ON cs.class_id = et.class_id
            LEFT JOIN exit_ticket_prompts p ON p.ticket_id = et.id AND p.is_archived = 0
            LEFT JOIN exit_ticket_responses r ON r.ticket_id = et.id AND r.student_id = cs.student_id
            WHERE cs.student_id = ? AND et.status = 'open'
            GROUP BY et.id
            ORDER BY datetime(et.updated_at) DESC, et.id DESC
        `, [req.params.studentId]);

        res.json(tickets);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/exit-tickets', authorize(['teacher', 'admin']), async (req, res) => {
    const { title, classId, prompts = [], status = 'open' } = req.body;
    const cleanTitle = String(title || '').trim();
    const promptTexts = prompts.map(cleanPromptText).filter(Boolean);

    if (!cleanTitle) return res.status(400).json({ error: 'Title is required' });
    if (!classId) return res.status(400).json({ error: 'Class is required' });
    if (promptTexts.length === 0) return res.status(400).json({ error: 'At least one prompt is required' });

    try {
        const teacherId = req.user.role === 'teacher' ? req.user.id : req.body.teacherId;
        if (!teacherId) return res.status(400).json({ error: 'teacherId is required' });

        if (req.user.role === 'teacher') {
            const ownedClass = await queryDb.get('SELECT id FROM classes WHERE id = ? AND teacher_id = ?', [classId, teacherId]);
            if (!ownedClass) return res.status(403).json({ error: 'Forbidden: You can only assign exit tickets to your own classes' });
        }

        const result = await queryDb.run(
            'INSERT INTO exit_tickets (teacher_id, class_id, title, status) VALUES (?, ?, ?, ?)',
            [teacherId, classId, cleanTitle, normalizeTicketStatus(status)]
        );

        for (const [index, promptText] of promptTexts.entries()) {
            await queryDb.run(
                'INSERT INTO exit_ticket_prompts (ticket_id, prompt_text, order_idx) VALUES (?, ?, ?)',
                [result.id, promptText, index]
            );
        }

        const ticket = await getExitTicketWithPrompts(result.id);
        res.json({ ticket });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/exit-tickets/:ticketId', authorize(['teacher', 'admin', 'student']), async (req, res) => {
    try {
        const ticket = await getExitTicketWithPrompts(req.params.ticketId);
        if (!ticket) return res.status(404).json({ error: 'Exit ticket not found' });

        if (req.user.role === 'teacher') {
            const canManage = await canTeacherManageExitTicket(req.params.ticketId, req.user.id);
            if (!canManage) return res.status(403).json({ error: 'Forbidden' });
        }
        if (req.user.role === 'student') {
            const canAccess = await canStudentAccessExitTicket(req.params.ticketId, req.user.id);
            if (!canAccess) return res.status(403).json({ error: 'Forbidden' });
            ticket.prompts = ticket.prompts.filter(prompt => prompt.is_archived !== 1);
        }

        res.json(ticket);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/exit-tickets/:ticketId', authorize(['teacher', 'admin']), async (req, res) => {
    const { title, classId, prompts = [], status = 'open' } = req.body;
    const cleanTitle = String(title || '').trim();
    const cleanPrompts = prompts
        .map((prompt, index) => ({
            id: prompt.id,
            prompt_text: cleanPromptText(prompt),
            is_archived: prompt.is_archived ? 1 : 0,
            order_idx: index
        }))
        .filter(prompt => prompt.prompt_text || prompt.id);

    if (!cleanTitle) return res.status(400).json({ error: 'Title is required' });

    try {
        const ticket = await queryDb.get('SELECT * FROM exit_tickets WHERE id = ?', [req.params.ticketId]);
        if (!ticket) return res.status(404).json({ error: 'Exit ticket not found' });
        if (req.user.role === 'teacher' && String(ticket.teacher_id) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const effectiveClassId = classId || ticket.class_id;
        if (req.user.role === 'teacher') {
            const ownedClass = await queryDb.get('SELECT id FROM classes WHERE id = ? AND teacher_id = ?', [effectiveClassId, req.user.id]);
            if (!ownedClass) return res.status(403).json({ error: 'Forbidden: You can only assign exit tickets to your own classes' });
        }

        const activePromptCount = cleanPrompts.filter(prompt => prompt.prompt_text && prompt.is_archived !== 1).length;
        if (activePromptCount === 0) {
            return res.status(400).json({ error: 'At least one active prompt is required' });
        }

        await queryDb.run(
            'UPDATE exit_tickets SET title = ?, class_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [cleanTitle, effectiveClassId, normalizeTicketStatus(status), req.params.ticketId]
        );

        const seenPromptIds = new Set();
        for (const prompt of cleanPrompts) {
            if (prompt.id) {
                seenPromptIds.add(Number(prompt.id));
                await queryDb.run(
                    'UPDATE exit_ticket_prompts SET prompt_text = ?, order_idx = ?, is_archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND ticket_id = ?',
                    [prompt.prompt_text || 'Archived prompt', prompt.order_idx, prompt.is_archived, prompt.id, req.params.ticketId]
                );
            } else if (prompt.prompt_text) {
                const result = await queryDb.run(
                    'INSERT INTO exit_ticket_prompts (ticket_id, prompt_text, order_idx, is_archived) VALUES (?, ?, ?, ?)',
                    [req.params.ticketId, prompt.prompt_text, prompt.order_idx, prompt.is_archived]
                );
                seenPromptIds.add(result.id);
            }
        }

        const existingPrompts = await queryDb.all('SELECT id FROM exit_ticket_prompts WHERE ticket_id = ?', [req.params.ticketId]);
        for (const existing of existingPrompts) {
            if (!seenPromptIds.has(Number(existing.id))) {
                await queryDb.run(
                    'UPDATE exit_ticket_prompts SET is_archived = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [existing.id]
                );
            }
        }

        const updatedTicket = await getExitTicketWithPrompts(req.params.ticketId);
        res.json({ ticket: updatedTicket });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/exit-tickets/:ticketId/archive', authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const ticket = await queryDb.get('SELECT * FROM exit_tickets WHERE id = ?', [req.params.ticketId]);
        if (!ticket) return res.status(404).json({ error: 'Exit ticket not found' });
        if (req.user.role === 'teacher' && String(ticket.teacher_id) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const shouldArchive = req.body.archived !== false;
        await queryDb.run(
            'UPDATE exit_tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [shouldArchive ? 'archived' : 'closed', req.params.ticketId]
        );
        res.json({ message: shouldArchive ? 'Exit ticket archived' : 'Exit ticket restored' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/exit-tickets/:ticketId/responses', authorize(['teacher', 'admin']), async (req, res) => {
    try {
        if (req.user.role === 'teacher') {
            const canManage = await canTeacherManageExitTicket(req.params.ticketId, req.user.id);
            if (!canManage) return res.status(403).json({ error: 'Forbidden' });
        }

        const ticket = await getExitTicketWithPrompts(req.params.ticketId);
        if (!ticket) return res.status(404).json({ error: 'Exit ticket not found' });

        const responseRows = await queryDb.all(`
            SELECT r.*, u.username, u.form_class
            FROM exit_ticket_responses r
            JOIN users u ON u.id = r.student_id
            WHERE r.ticket_id = ?
            ORDER BY datetime(r.submitted_at) DESC, r.id DESC
        `, [req.params.ticketId]);

        const responses = [];
        for (const response of responseRows) {
            const answers = await queryDb.all(`
                SELECT a.*, p.prompt_text, p.order_idx, p.is_archived
                FROM exit_ticket_answers a
                JOIN exit_ticket_prompts p ON p.id = a.prompt_id
                WHERE a.response_id = ?
                ORDER BY p.order_idx ASC, p.id ASC
            `, [response.id]);
            responses.push({ ...response, answers });
        }

        res.json({ ticket, responses });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/exit-tickets/:ticketId/responses', authorize(['student']), async (req, res) => {
    const answers = req.body.answers || {};

    try {
        const canAccess = await canStudentAccessExitTicket(req.params.ticketId, req.user.id);
        if (!canAccess) return res.status(403).json({ error: 'Forbidden' });

        const prompts = await queryDb.all(
            'SELECT id FROM exit_ticket_prompts WHERE ticket_id = ? AND is_archived = 0 ORDER BY order_idx ASC, id ASC',
            [req.params.ticketId]
        );

        const missingPrompt = prompts.find(prompt => !String(answers[prompt.id] || '').trim());
        if (missingPrompt) {
            return res.status(400).json({ error: 'Please answer every prompt before submitting.' });
        }

        await queryDb.run(`
            INSERT INTO exit_ticket_responses (ticket_id, student_id)
            VALUES (?, ?)
            ON CONFLICT(ticket_id, student_id) DO UPDATE SET
                updated_at = CURRENT_TIMESTAMP,
                submitted_at = CURRENT_TIMESTAMP
        `, [req.params.ticketId, req.user.id]);

        const response = await queryDb.get(
            'SELECT id FROM exit_ticket_responses WHERE ticket_id = ? AND student_id = ?',
            [req.params.ticketId, req.user.id]
        );

        for (const prompt of prompts) {
            await queryDb.run(`
                INSERT INTO exit_ticket_answers (response_id, prompt_id, answer_text)
                VALUES (?, ?, ?)
                ON CONFLICT(response_id, prompt_id) DO UPDATE SET
                    answer_text = excluded.answer_text,
                    updated_at = CURRENT_TIMESTAMP
            `, [response.id, prompt.id, String(answers[prompt.id] || '').trim()]);
        }

        res.json({ message: 'Exit ticket submitted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/exit-tickets/:ticketId/responses/:responseId/reviewed', authorize(['teacher', 'admin']), async (req, res) => {
    try {
        if (req.user.role === 'teacher') {
            const canManage = await canTeacherManageExitTicket(req.params.ticketId, req.user.id);
            if (!canManage) return res.status(403).json({ error: 'Forbidden' });
        }

        await queryDb.run(
            'UPDATE exit_ticket_responses SET reviewed = ? WHERE id = ? AND ticket_id = ?',
            [req.body.reviewed ? 1 : 0, req.params.responseId, req.params.ticketId]
        );
        res.json({ message: 'Response updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Quick Checks ---

function normalizeQuickCheckMode(mode) {
    return mode === 'whiteboard' ? 'whiteboard' : 'traffic_light';
}

function normalizeQuickCheckStatus(status) {
    const normalized = String(status || 'open').trim().toLowerCase();
    return ['open', 'closed', 'archived'].includes(normalized) ? normalized : 'open';
}

async function canTeacherManageQuickCheck(checkId, teacherId) {
    const check = await queryDb.get(
        'SELECT id FROM quick_checks WHERE id = ? AND teacher_id = ?',
        [checkId, teacherId]
    );
    return !!check;
}

async function canStudentAccessQuickCheck(checkId, studentId) {
    const check = await queryDb.get(`
        SELECT qc.id
        FROM quick_checks qc
        JOIN class_students cs ON cs.class_id = qc.class_id
        WHERE qc.id = ? AND cs.student_id = ? AND qc.status = 'open'
    `, [checkId, studentId]);
    return !!check;
}

async function getQuickCheck(checkId) {
    return queryDb.get(`
        SELECT qc.*, c.name as class_name, u.username as teacher_name
        FROM quick_checks qc
        JOIN classes c ON c.id = qc.class_id
        JOIN users u ON u.id = qc.teacher_id
        WHERE qc.id = ?
    `, [checkId]);
}

router.get('/quick-check-templates', authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const teacherId = req.user.role === 'teacher' ? req.user.id : req.query.teacherId;
        if (!teacherId) return res.status(400).json({ error: 'teacherId is required' });
        const includeArchived = req.query.includeArchived === 'true';

        const templates = await queryDb.all(`
            SELECT *
            FROM quick_check_templates
            WHERE teacher_id = ? AND (? = 1 OR is_archived = 0)
            ORDER BY is_archived ASC, datetime(updated_at) DESC, id DESC
        `, [teacherId, includeArchived ? 1 : 0]);
        res.json(templates);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/quick-check-templates', authorize(['teacher', 'admin']), async (req, res) => {
    const teacherId = req.user.role === 'teacher' ? req.user.id : req.body.teacherId;
    const title = String(req.body.title || '').trim();
    const question = String(req.body.question || '').trim();
    const mode = normalizeQuickCheckMode(req.body.mode);

    if (!teacherId) return res.status(400).json({ error: 'teacherId is required' });
    if (!title || !question) return res.status(400).json({ error: 'Title and question are required' });

    try {
        const result = await queryDb.run(
            'INSERT INTO quick_check_templates (teacher_id, mode, title, question) VALUES (?, ?, ?, ?)',
            [teacherId, mode, title, question]
        );
        const template = await queryDb.get('SELECT * FROM quick_check_templates WHERE id = ?', [result.id]);
        res.json({ template });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/quick-check-templates/:templateId', authorize(['teacher', 'admin']), async (req, res) => {
    const title = String(req.body.title || '').trim();
    const question = String(req.body.question || '').trim();
    const mode = normalizeQuickCheckMode(req.body.mode);

    if (!title || !question) return res.status(400).json({ error: 'Title and question are required' });

    try {
        const template = await queryDb.get('SELECT * FROM quick_check_templates WHERE id = ?', [req.params.templateId]);
        if (!template) return res.status(404).json({ error: 'Template not found' });
        if (req.user.role === 'teacher' && String(template.teacher_id) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        await queryDb.run(
            'UPDATE quick_check_templates SET mode = ?, title = ?, question = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [mode, title, question, req.params.templateId]
        );
        const updatedTemplate = await queryDb.get('SELECT * FROM quick_check_templates WHERE id = ?', [req.params.templateId]);
        res.json({ template: updatedTemplate });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/quick-check-templates/:templateId/archive', authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const template = await queryDb.get('SELECT * FROM quick_check_templates WHERE id = ?', [req.params.templateId]);
        if (!template) return res.status(404).json({ error: 'Template not found' });
        if (req.user.role === 'teacher' && String(template.teacher_id) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        await queryDb.run(
            'UPDATE quick_check_templates SET is_archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [req.body.archived === false ? 0 : 1, req.params.templateId]
        );
        res.json({ message: req.body.archived === false ? 'Template restored' : 'Template archived' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/quick-checks/teacher', authorize(['teacher', 'admin']), async (req, res) => {
    try {
        const teacherId = req.user.role === 'teacher' ? req.user.id : req.query.teacherId;
        if (!teacherId) return res.status(400).json({ error: 'teacherId is required' });
        const includeArchived = req.query.includeArchived === 'true';

        const checks = await queryDb.all(`
            SELECT
                qc.*,
                c.name as class_name,
                COUNT(r.id) as response_count
            FROM quick_checks qc
            JOIN classes c ON c.id = qc.class_id
            LEFT JOIN quick_check_responses r ON r.quick_check_id = qc.id
            WHERE qc.teacher_id = ? AND (? = 1 OR qc.status != 'archived')
            GROUP BY qc.id
            ORDER BY CASE WHEN qc.status = 'open' THEN 0 WHEN qc.status = 'closed' THEN 1 ELSE 2 END ASC,
                     datetime(qc.updated_at) DESC,
                     qc.id DESC
        `, [teacherId, includeArchived ? 1 : 0]);
        res.json(checks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/quick-checks', authorize(['teacher', 'admin']), async (req, res) => {
    const teacherId = req.user.role === 'teacher' ? req.user.id : req.body.teacherId;
    const classId = req.body.classId;
    const templateId = req.body.templateId || null;
    const mode = normalizeQuickCheckMode(req.body.mode);
    const title = String(req.body.title || '').trim() || (mode === 'traffic_light' ? 'Traffic Light Check' : '');
    const question = String(req.body.question || '').trim() || (mode === 'traffic_light' ? 'How are you feeling about this?' : '');
    const saveAsTemplate = !!req.body.saveAsTemplate;

    if (!teacherId) return res.status(400).json({ error: 'teacherId is required' });
    if (!classId) return res.status(400).json({ error: 'Class is required' });
    if (!title || !question) return res.status(400).json({ error: 'Title and question are required for mini whiteboards.' });

    try {
        if (req.user.role === 'teacher') {
            const ownedClass = await queryDb.get('SELECT id FROM classes WHERE id = ? AND teacher_id = ?', [classId, teacherId]);
            if (!ownedClass) return res.status(403).json({ error: 'Forbidden: You can only launch quick checks for your own classes' });
        }

        let effectiveTemplateId = templateId;
        if (templateId && req.user.role === 'teacher') {
            const template = await queryDb.get('SELECT id FROM quick_check_templates WHERE id = ? AND teacher_id = ?', [templateId, teacherId]);
            if (!template) return res.status(403).json({ error: 'Forbidden: Template does not belong to you' });
        }

        if (!effectiveTemplateId && saveAsTemplate) {
            const templateResult = await queryDb.run(
                'INSERT INTO quick_check_templates (teacher_id, mode, title, question) VALUES (?, ?, ?, ?)',
                [teacherId, mode, title, question]
            );
            effectiveTemplateId = templateResult.id;
        }

        const result = await queryDb.run(
            'INSERT INTO quick_checks (template_id, teacher_id, class_id, mode, title, question, status, reveal_responses) VALUES (?, ?, ?, ?, ?, ?, "open", ?)',
            [effectiveTemplateId, teacherId, classId, mode, title, question, mode === 'traffic_light' ? 1 : 0]
        );
        const check = await getQuickCheck(result.id);
        res.json({ check });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/quick-checks/student/:studentId', authorize(['student', 'admin', 'teacher']), async (req, res) => {
    try {
        if (req.user.role === 'student' && String(req.user.id) !== String(req.params.studentId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const checks = await queryDb.all(`
            SELECT
                qc.*,
                c.name as class_name,
                u.username as teacher_name,
                CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END as is_submitted,
                r.submitted_at
            FROM quick_checks qc
            JOIN classes c ON c.id = qc.class_id
            JOIN users u ON u.id = qc.teacher_id
            JOIN class_students cs ON cs.class_id = qc.class_id
            LEFT JOIN quick_check_responses r ON r.quick_check_id = qc.id AND r.student_id = cs.student_id
            WHERE cs.student_id = ? AND qc.status = 'open'
            ORDER BY datetime(qc.created_at) DESC, qc.id DESC
        `, [req.params.studentId]);

        res.json(checks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/quick-checks/:checkId', authorize(['teacher', 'admin', 'student']), async (req, res) => {
    try {
        const check = await getQuickCheck(req.params.checkId);
        if (!check) return res.status(404).json({ error: 'Quick check not found' });

        if (req.user.role === 'teacher') {
            const canManage = await canTeacherManageQuickCheck(req.params.checkId, req.user.id);
            if (!canManage) return res.status(403).json({ error: 'Forbidden' });
        }
        if (req.user.role === 'student') {
            const canAccess = await canStudentAccessQuickCheck(req.params.checkId, req.user.id);
            if (!canAccess) return res.status(403).json({ error: 'Forbidden' });
        }

        res.json(check);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/quick-checks/:checkId/responses', authorize(['teacher', 'admin']), async (req, res) => {
    try {
        if (req.user.role === 'teacher') {
            const canManage = await canTeacherManageQuickCheck(req.params.checkId, req.user.id);
            if (!canManage) return res.status(403).json({ error: 'Forbidden' });
        }

        const check = await getQuickCheck(req.params.checkId);
        if (!check) return res.status(404).json({ error: 'Quick check not found' });

        const responses = await queryDb.all(`
            SELECT r.*, u.username, u.form_class
            FROM quick_check_responses r
            JOIN users u ON u.id = r.student_id
            WHERE r.quick_check_id = ?
            ORDER BY datetime(r.submitted_at) ASC, r.id ASC
        `, [req.params.checkId]);

        const roster = await queryDb.all(`
            SELECT u.id, u.username, u.form_class
            FROM users u
            JOIN class_students cs ON cs.student_id = u.id
            WHERE cs.class_id = ?
            ORDER BY u.username ASC
        `, [check.class_id]);

        res.json({ check, responses, roster });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/quick-checks/:checkId/responses', authorize(['student']), async (req, res) => {
    try {
        const check = await getQuickCheck(req.params.checkId);
        if (!check) return res.status(404).json({ error: 'Quick check not found' });

        const canAccess = await canStudentAccessQuickCheck(req.params.checkId, req.user.id);
        if (!canAccess) return res.status(403).json({ error: 'Forbidden' });

        const trafficLight = ['red', 'yellow', 'green'].includes(req.body.trafficLight)
            ? req.body.trafficLight
            : null;
        const textAnswer = String(req.body.textAnswer || '').trim();

        if (check.mode === 'traffic_light' && !trafficLight) {
            return res.status(400).json({ error: 'Choose red, yellow, or green.' });
        }
        if (check.mode === 'whiteboard' && !textAnswer) {
            return res.status(400).json({ error: 'Write an answer before submitting.' });
        }

        await queryDb.run(`
            INSERT INTO quick_check_responses (quick_check_id, student_id, traffic_light, text_answer)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(quick_check_id, student_id) DO UPDATE SET
                traffic_light = excluded.traffic_light,
                text_answer = excluded.text_answer,
                submitted_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
        `, [req.params.checkId, req.user.id, trafficLight, textAnswer || null]);

        res.json({ message: 'Quick check response submitted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/quick-checks/:checkId/reveal', authorize(['teacher', 'admin']), async (req, res) => {
    try {
        if (req.user.role === 'teacher') {
            const canManage = await canTeacherManageQuickCheck(req.params.checkId, req.user.id);
            if (!canManage) return res.status(403).json({ error: 'Forbidden' });
        }

        await queryDb.run(
            'UPDATE quick_checks SET reveal_responses = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [req.body.reveal ? 1 : 0, req.params.checkId]
        );
        res.json({ message: req.body.reveal ? 'Responses revealed' : 'Responses hidden' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/quick-checks/:checkId/status', authorize(['teacher', 'admin']), async (req, res) => {
    try {
        if (req.user.role === 'teacher') {
            const canManage = await canTeacherManageQuickCheck(req.params.checkId, req.user.id);
            if (!canManage) return res.status(403).json({ error: 'Forbidden' });
        }

        const status = normalizeQuickCheckStatus(req.body.status);
        await queryDb.run(
            'UPDATE quick_checks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [status, req.params.checkId]
        );
        res.json({ message: 'Quick check updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/quick-checks/:checkId', authorize(['teacher', 'admin']), async (req, res) => {
    try {
        if (req.user.role === 'teacher') {
            const canManage = await canTeacherManageQuickCheck(req.params.checkId, req.user.id);
            if (!canManage) return res.status(403).json({ error: 'Forbidden' });
        }

        const result = await queryDb.run('DELETE FROM quick_checks WHERE id = ?', [req.params.checkId]);
        if (result.changes === 0) return res.status(404).json({ error: 'Quick check not found' });

        res.json({ message: 'Quick check permanently deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Admin Tag Management ---

router.get('/admin/tags', authorize(['admin']), async (req, res) => {
    try {
        const fetchTagValues = (field) => queryDb.all(`
            SELECT value FROM (
                SELECT ${field} AS value FROM quizzes WHERE ${field} IS NOT NULL AND ${field} != ''
                UNION
                SELECT ${field} AS value FROM questions WHERE ${field} IS NOT NULL AND ${field} != ''
                UNION
                SELECT ${field} AS value FROM long_answer_bank_questions WHERE ${field} IS NOT NULL AND ${field} != ''
            )
            ORDER BY value ASC
        `);

        const subjects = await fetchTagValues('subject');
        const levels = await fetchTagValues('level');
        const topics = await fetchTagValues('topic');
        
        res.json({
            subjects: subjects.map(s => s.value),
            levels: levels.map(l => l.value),
            topics: topics.map(t => t.value)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/admin/tags/merge', authorize(['admin']), async (req, res) => {
    const { field, oldValues, newValue } = req.body;
    
    if (!['subject', 'level', 'topic'].includes(field)) {
        return res.status(400).json({ error: 'Invalid field for tag merge.' });
    }
    if (!Array.isArray(oldValues) || oldValues.length === 0 || !newValue) {
        return res.status(400).json({ error: 'Invalid parameters for tag merge.' });
    }

    try {
        const placeholders = oldValues.map(() => '?').join(',');
        const quizSql = `UPDATE quizzes SET ${field} = ? WHERE ${field} IN (${placeholders})`;
        const questionSql = `UPDATE questions SET ${field} = ? WHERE ${field} IN (${placeholders})`;
        
        const quizResult = await queryDb.run(quizSql, [newValue, ...oldValues]);
        const questionResult = await queryDb.run(questionSql, [newValue, ...oldValues]);
        res.json({ message: `Successfully merged ${quizResult.changes} quizzes and ${questionResult.changes} questions.` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Question Bank ---

router.put('/admin/bank/questions/:questionId/tags', authorize(['admin']), async (req, res) => {
    const { subject, level, topic } = req.body;
    const cleanSubject = (subject || 'General').trim() || 'General';
    const cleanLevel = (level || 'General').trim() || 'General';
    const cleanTopic = (topic || 'General').trim() || 'General';

    try {
        const question = await queryDb.get('SELECT id, subject, level, topic FROM questions WHERE id = ?', [req.params.questionId]);
        if (!question) {
            return res.status(404).json({ error: 'Question not found.' });
        }

        await queryDb.run(
            'UPDATE questions SET subject = ?, level = ?, topic = ? WHERE id = ?',
            [cleanSubject, cleanLevel, cleanTopic, req.params.questionId]
        );

        await logAuditEvent({
            actorId: req.user.id,
            actorRole: req.user.role,
            action: 'update_question_tags',
            targetType: 'question',
            targetId: req.params.questionId,
            details: {
                from: { subject: question.subject, level: question.level, topic: question.topic },
                to: { subject: cleanSubject, level: cleanLevel, topic: cleanTopic }
            }
        });

        res.json({
            message: 'Question tags updated.',
            question: { ...question, subject: cleanSubject, level: cleanLevel, topic: cleanTopic }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/bank/questions', authorize(['admin', 'teacher']), async (req, res) => {
    const { subject, level, topic, q } = req.query;
    try {
        let sql = `
            SELECT qn.*, qz.title as quiz_title, qz.author_id, u.username as author_name
            FROM questions qn
            JOIN quizzes qz ON qn.quiz_id = qz.id
            LEFT JOIN users u ON qz.author_id = u.id
            WHERE qz.is_active = 1 AND (qz.is_shared = 1 OR qz.author_id = ?)
        `;
        const params = [req.user.role === 'teacher' ? req.user.id : -1]; // Allow admin all or whatever logic, actually admin sees all if we tweak, but req.user.id is safe. Wait, for admin let's just let them see all, or user.id. Let's stick to user.id, if admin, we can check. Actually, let's keep it simple:

        if (req.user.role === 'admin') {
            sql = `
                SELECT qn.*, qz.title as quiz_title, qz.author_id, u.username as author_name
                FROM questions qn
                JOIN quizzes qz ON qn.quiz_id = qz.id
                LEFT JOIN users u ON qz.author_id = u.id
                WHERE qz.is_active = 1
            `;
            params.length = 0; // clear params
        }

        if (subject) {
            sql += ' AND qn.subject = ?';
            params.push(subject);
        }
        if (level) {
            sql += ' AND qn.level = ?';
            params.push(level);
        }
        if (topic) {
            sql += ' AND qn.topic = ?';
            params.push(topic);
        }
        if (q && q.length > 0) {
            sql += ' AND qn.text LIKE ?';
            params.push(`%${q}%`);
        }

        sql += ' ORDER BY qn.id DESC LIMIT 200';

        const questionsRows = await queryDb.all(sql, params);
        
        // Fetch options for these questions
        const questions = [];
        for (const qRow of questionsRows) {
            // We strip answers if not admin/teacher, but this endpoint is only for admin/teacher
            const options = await queryDb.all('SELECT id, text, is_correct FROM options WHERE question_id = ?', [qRow.id]);
            questions.push({ ...qRow, options });
        }

        res.json(questions);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/bank/import', authorize(['admin', 'teacher']), async (req, res) => {
    const { bulkText, subject, level, topic } = req.body;
    try {
        // Find or create Global Question Bank quiz
        let globalBankQuiz = await queryDb.get('SELECT id FROM quizzes WHERE title = "Global Question Bank" AND is_shared = 1');
        
        if (!globalBankQuiz) {
            const quizResult = await queryDb.run(
                'INSERT INTO quizzes (title, description, category, author_id, is_shared) VALUES (?, ?, ?, ?, ?)',
                ['Global Question Bank', 'System-level container for independently uploaded question bank items.', 'Question Bank', req.user.id, 1]
            );
            globalBankQuiz = { id: quizResult.id };
        }

        const quizId = globalBankQuiz.id;

        // Parse bulkText
        const lines = bulkText.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0);

        let currentQuestionId = null;
        let currentQuestionOptions = [];
        let currentImageUrl = null;
        let questionsImported = 0;

        const commitQuestion = async () => {
            if (currentQuestionId && currentQuestionOptions.length > 0) {
                let type = 'multiple_choice';
                if (currentQuestionOptions.length === 1 && currentQuestionOptions[0].isShortAnswer) {
                    type = 'short_answer';
                } else if (currentQuestionOptions.length === 2) {
                    const opts = currentQuestionOptions.map(o => o.text.toLowerCase());
                    if (opts.includes('true') && opts.includes('false')) {
                        type = 'true_false';
                    }
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
                    'INSERT INTO questions (quiz_id, text, type, image_url, subject, level, topic) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [quizId, qText, 'multiple_choice', currentImageUrl, subject || 'General', level || 'General', topic || 'General']
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

        res.json({ message: 'Questions successfully imported into the Bank', questionsImported });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Quizzes ---

// Get quizzes for a specific author (teacher)
router.get('/quizzes', authorize(['admin', 'teacher']), async (req, res) => {
    const { authorId, category } = req.query;
    try {
        let sql = 'SELECT * FROM quizzes WHERE is_active = 1';
        const params = [];
        if (authorId) {
            sql += ' AND author_id = ?';
            params.push(authorId);
        }
        if (category) {
            sql += ' AND category = ?';
            params.push(category);
        }
        sql += ' ORDER BY created_at DESC';
        const quizzes = await queryDb.all(sql, params);
        res.json(quizzes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get ALL quizzes (Community Quizzes - excluding the requesting teacher's own quizzes)
router.get('/quizzes/community/:excludeAuthorId', authorize(['admin', 'teacher']), async (req, res) => {
    const { category } = req.query;
    try {
        // Fetch quizzes and the author's username
        let sql = `
            SELECT q.*, u.username as author_name 
            FROM quizzes q 
            LEFT JOIN users u ON q.author_id = u.id 
            WHERE q.is_shared = 1 AND q.is_active = 1 AND (q.author_id != ? OR q.author_id IS NULL)
        `;
        const params = [req.params.excludeAuthorId];

        if (category) {
            sql += ' AND q.category = ?';
            params.push(category);
        }

        sql += ' ORDER BY q.created_at DESC';

        const quizzes = await queryDb.all(sql, params);
        res.json(quizzes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single quiz with questions and options
router.get('/quizzes/:id', authorize(), async (req, res) => {
    const { studentView } = req.query;
    const userRole = req.user.role;
    const forceStudentView = studentView === 'true' || userRole === 'student';
    
    try {
        const quiz = await queryDb.get('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

        const questionsRows = await queryDb.all('SELECT * FROM questions WHERE quiz_id = ?', [quiz.id]);
        const questions = [];
        for (const q of questionsRows) {
            // If studentView is true or requester is a student, we strip the explanation
            if (forceStudentView) {
                delete q.explanation;
            }

            const options = await queryDb.all('SELECT id, text, is_correct FROM options WHERE question_id = ?', [q.id]);
            
            // If forceStudentView is true:
            // 1. Strip the is_correct flag
            // 2. For short_answer, strip ALL options (since they contain the correct answer text)
            const sanitizedOptions = options.map(opt => {
                if (forceStudentView) {
                    if (q.type === 'short_answer') return null; // We will filter these out
                    const { is_correct, ...rest } = opt;
                    return rest;
                }
                return opt;
            }).filter(opt => opt !== null);

            questions.push({ ...q, options: sanitizedOptions });
        }
        res.json({ ...quiz, questions });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Toggle share status of a quiz
router.put('/quizzes/:id/share', authorize(['admin', 'teacher']), async (req, res) => {
    const { isShared } = req.body;
    try {
        if (req.user.role === 'teacher') {
            const quiz = await queryDb.get('SELECT id FROM quizzes WHERE id = ? AND author_id = ?', [req.params.id, req.user.id]);
            if (!quiz) return res.status(403).json({ error: 'Forbidden' });
        }
        await queryDb.run('UPDATE quizzes SET is_shared = ? WHERE id = ?', [isShared ? 1 : 0, req.params.id]);
        res.json({ message: 'Quiz share status updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Soft delete a quiz
router.delete('/quizzes/:id', authorize(['admin', 'teacher']), async (req, res) => {
    try {
        let quiz = await queryDb.get('SELECT id, title, author_id FROM quizzes WHERE id = ?', [req.params.id]);
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
        if (req.user.role === 'teacher') {
            quiz = await queryDb.get('SELECT id, title, author_id FROM quizzes WHERE id = ? AND author_id = ?', [req.params.id, req.user.id]);
            if (!quiz) return res.status(403).json({ error: 'Forbidden' });
        }
        await queryDb.run('UPDATE quizzes SET is_active = 0 WHERE id = ?', [req.params.id]);
        await logAuditEvent({
            actorId: req.user.id,
            actorRole: req.user.role,
            action: 'quiz_deleted',
            targetType: 'quiz',
            targetId: req.params.id,
            details: {
                title: quiz.title,
                author_id: quiz.author_id
            }
        });
        res.json({ message: 'Quiz deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export Quiz to Bulk Format
router.get('/quizzes/:id/export', authorize(['admin', 'teacher']), async (req, res) => {
    try {
        const quiz = await queryDb.get('SELECT * FROM quizzes WHERE id = ?', [req.params.id]);
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
        if (req.user.role === 'teacher' && String(quiz.author_id) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

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
            if (q.explanation) {
                bulkText += `[EXP: ${q.explanation}]\n`;
            }
            bulkText += '\n'; // Add blank line between questions
        }

        res.json({ bulkText: bulkText.trim(), questions: questionsRows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Edit Quiz (Structured JSON Versioning)
router.put('/quizzes/:id/structure', authorize(['admin', 'teacher']), async (req, res) => {
    const { title, description, category, subject, level, topic, questions } = req.body;
    const oldQuizId = req.params.id;

    try {
        // Fetch old quiz to keep authorId and is_shared
        const oldQuiz = await queryDb.get('SELECT * FROM quizzes WHERE id = ?', [oldQuizId]);
        if (!oldQuiz) return res.status(404).json({ error: 'Quiz not found' });
        if (req.user.role === 'teacher' && String(oldQuiz.author_id) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // 1. Create New Quiz
        const quizResult = await queryDb.run(
            'INSERT INTO quizzes (title, description, category, subject, level, topic, author_id, is_shared, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)',
            [title, description, category || oldQuiz.category || 'General', subject || oldQuiz.subject || 'General', level || oldQuiz.level || 'General', topic || oldQuiz.topic || 'General', oldQuiz.author_id, oldQuiz.is_shared]
        );
        const newQuizId = quizResult.id;

        let questionsImported = 0;

        for (const q of questions) {
            const qSubject = q.subject || subject || oldQuiz.subject || 'General';
            const qLevel = q.level || level || oldQuiz.level || 'General';
            const qTopic = q.topic || topic || oldQuiz.topic || 'General';

            const questionResult = await queryDb.run(
                'INSERT INTO questions (quiz_id, text, type, image_url, code_snippet, code_language, explanation, subject, level, topic) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [newQuizId, q.text, q.type || 'multiple_choice', q.image_url || null, q.code_snippet || null, q.code_language || null, q.explanation || null, qSubject, qLevel, qTopic]
            );

            if (q.options && q.options.length > 0) {
                for (const opt of q.options) {
                    const isCorrect = opt.is_correct !== undefined ? opt.is_correct : opt.isCorrect;
                    await queryDb.run(
                        'INSERT INTO options (question_id, text, is_correct) VALUES (?, ?, ?)',
                        [questionResult.id, opt.text, isCorrect ? 1 : 0]
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
router.put('/quizzes/:id', authorize(['admin', 'teacher']), async (req, res) => {
    const { title, description, category, bulkText } = req.body;
    const oldQuizId = req.params.id;

    try {
        // Fetch old quiz to keep authorId and is_shared
        const oldQuiz = await queryDb.get('SELECT * FROM quizzes WHERE id = ?', [oldQuizId]);
        if (!oldQuiz) return res.status(404).json({ error: 'Quiz not found' });
        if (req.user.role === 'teacher' && String(oldQuiz.author_id) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // 1. Create New Quiz
        const quizResult = await queryDb.run(
            'INSERT INTO quizzes (title, description, category, author_id, is_shared, is_active) VALUES (?, ?, ?, ?, ?, 1)',
            [title, description, category || oldQuiz.category || 'General', oldQuiz.author_id, oldQuiz.is_shared]
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
// { title, description, category, authorId, questions: [{ text, type, image_url, code_snippet, code_language, options: [{text, isCorrect}] }] }
router.post('/quizzes/builder', authorize(['admin', 'teacher']), async (req, res) => {
    const { title, description, category, subject, level, topic, authorId, questions } = req.body;
    try {
        const effectiveAuthorId = req.user.role === 'teacher' ? req.user.id : (authorId || null);
        // 1. Create Quiz
        const quizResult = await queryDb.run(
            'INSERT INTO quizzes (title, description, category, subject, level, topic, author_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [title, description, category || 'General', subject || 'General', level || 'General', topic || 'General', effectiveAuthorId]
        );
        const quizId = quizResult.id;

        let questionsImported = 0;

        for (const q of questions) {
            const qSubject = q.subject || subject || 'General';
            const qLevel = q.level || level || 'General';
            const qTopic = q.topic || topic || 'General';

            const questionResult = await queryDb.run(
                'INSERT INTO questions (quiz_id, text, type, image_url, code_snippet, code_language, explanation, subject, level, topic) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [quizId, q.text, q.type || 'multiple_choice', q.image_url || null, q.code_snippet || null, q.code_language || null, q.explanation || null, qSubject, qLevel, qTopic]
            );

            if (q.options && q.options.length > 0) {
                for (const opt of q.options) {
                    const isCorrect = opt.is_correct !== undefined ? opt.is_correct : opt.isCorrect;
                    await queryDb.run(
                        'INSERT INTO options (question_id, text, is_correct) VALUES (?, ?, ?)',
                        [questionResult.id, opt.text, isCorrect ? 1 : 0]
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
router.post('/quizzes/import', authorize(['admin', 'teacher']), async (req, res) => {
    const { title, description, category, bulkText, authorId } = req.body;
    try {
        const effectiveAuthorId = req.user.role === 'teacher' ? req.user.id : (authorId || null);
        // 1. Create Quiz
        const quizResult = await queryDb.run(
            'INSERT INTO quizzes (title, description, category, author_id) VALUES (?, ?, ?, ?)',
            [title, description, category || 'General', effectiveAuthorId]
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
router.post('/quizzes/:id/copy', authorize(['admin', 'teacher']), async (req, res) => {
    const { newAuthorId } = req.body;
    const sourceQuizId = req.params.id;

    try {
        // 1. Get original quiz
        const originalQuiz = await queryDb.get('SELECT * FROM quizzes WHERE id = ?', [sourceQuizId]);
        if (!originalQuiz) return res.status(404).json({ error: 'Source quiz not found' });
        if (req.user.role === 'teacher' && !originalQuiz.is_shared && String(originalQuiz.author_id) !== String(req.user.id)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const effectiveAuthorId = req.user.role === 'teacher' ? req.user.id : (newAuthorId || null);
        if (!effectiveAuthorId) {
            return res.status(400).json({ error: 'newAuthorId is required' });
        }

        // 2. Insert new copied quiz
        const newQuiz = await queryDb.run(
            'INSERT INTO quizzes (title, description, category, subject, level, topic, author_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [`${originalQuiz.title} (Copy)`, originalQuiz.description, originalQuiz.category || 'General', originalQuiz.subject || 'General', originalQuiz.level || 'General', originalQuiz.topic || 'General', effectiveAuthorId]
        );
        const newQuizId = newQuiz.id;

        // 3. Get and copy all questions
        const questions = await queryDb.all('SELECT * FROM questions WHERE quiz_id = ?', [sourceQuizId]);
        for (const q of questions) {
            const newQuestion = await queryDb.run(
                'INSERT INTO questions (quiz_id, text, type, image_url, code_snippet, code_language, explanation) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [newQuizId, q.text, q.type, q.image_url || null, q.code_snippet || null, q.code_language || null, q.explanation || null]
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

// Get all users (Sanitized)
router.get('/admin/users', authorize(['admin']), async (req, res) => {
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

// Get recent audit logs
router.get('/admin/audit-logs', authorize(['admin']), async (req, res) => {
    try {
        const parsedLimit = Number.parseInt(req.query.limit, 10);
        const limit = Number.isFinite(parsedLimit)
            ? Math.min(Math.max(parsedLimit, 1), 250)
            : 100;

        const rows = await queryDb.all(`
            SELECT
                a.id,
                a.actor_id,
                a.actor_role,
                a.action,
                a.target_type,
                a.target_id,
                a.details,
                a.created_at,
                u.username AS actor_username
            FROM audit_logs a
            LEFT JOIN users u ON u.id = a.actor_id
            ORDER BY datetime(a.created_at) DESC, a.id DESC
            LIMIT ?
        `, [limit]);

        const logs = rows.map((row) => {
            let details = {};
            if (row.details) {
                try {
                    details = JSON.parse(row.details);
                } catch {
                    details = { raw: row.details };
                }
            }

            return {
                ...row,
                details
            };
        });

        res.json({ logs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Approve a teacher
router.put('/admin/users/:id/approve', authorize(['admin']), async (req, res) => {
    try {
        await queryDb.run('UPDATE users SET is_approved = 1 WHERE id = ?', [req.params.id]);
        await logAuditEvent({
            actorId: req.user.id,
            actorRole: req.user.role,
            action: 'user_approved',
            targetType: 'user',
            targetId: req.params.id,
            details: {}
        });
        res.json({ message: 'User approved successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reset password (Admin)
router.put('/admin/users/:id/password', authorize(['admin']), async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'New password is required' });
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        await queryDb.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashedPassword, req.params.id]);
        await logAuditEvent({
            actorId: req.user.id,
            actorRole: req.user.role,
            action: 'password_reset',
            targetType: 'user',
            targetId: req.params.id,
            details: {
                reset_by_admin: true
            }
        });
        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a user
router.delete('/admin/users/:id', authorize(['admin']), async (req, res) => {
    try {
        await queryDb.run('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// User (Student/Teacher) resetting their own password
router.put('/users/:id/password', authorize(['admin', 'teacher', 'student']), async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'New password is required' });
    try {
        if (req.user.role !== 'admin' && String(req.user.id) !== String(req.params.id)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        await queryDb.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashedPassword, req.params.id]);
        if (req.user.role === 'admin' || req.user.role === 'teacher') {
            await logAuditEvent({
                actorId: req.user.id,
                actorRole: req.user.role,
                action: 'password_reset',
                targetType: 'user',
                targetId: req.params.id,
                details: {
                    self_service: String(req.user.id) === String(req.params.id)
                }
            });
        }
        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Teacher resetting a student's password
router.put('/teachers/students/:studentId/password', authorize(['teacher']), async (req, res) => {
    const teacherId = req.user.id;
    const studentId = req.params.studentId;
    const { newPassword } = req.body;

    if (!newPassword) return res.status(400).json({ error: 'New password is required' });

    try {
        // Verify teacher owns the student (created them OR teaches them in a class)
        const student = await queryDb.get(`
            SELECT u.id 
            FROM users u
            LEFT JOIN class_students cs ON u.id = cs.student_id
            LEFT JOIN classes c ON cs.class_id = c.id
            WHERE u.id = ? AND u.role = 'student' AND (
                u.created_by = ? OR c.teacher_id = ?
            )
        `, [studentId, teacherId, teacherId]);

        if (!student) {
            return res.status(403).json({ error: "Forbidden: You do not have permission to reset this student's password." });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        await queryDb.run('UPDATE users SET password_hash = ? WHERE id = ?', [hashedPassword, studentId]);
        
        res.json({ message: 'Student password successfully reset.' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Export session results as CSV
router.get('/sessions/:id/export', authorize(['admin', 'teacher']), async (req, res) => {
    try {
        const sessionId = req.params.id;

        // Fetch session and quiz details
        const session = await queryDb.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
        if (!session) return res.status(404).send('Session not found');
        if (req.user.role === 'teacher') {
            const ownedSession = await queryDb.get(`
                SELECT s.id
                FROM sessions s
                JOIN quizzes q ON q.id = s.quiz_id
                WHERE s.id = ? AND q.author_id = ?
            `, [sessionId, req.user.id]);
            if (!ownedSession) return res.status(403).json({ error: 'Forbidden' });
        }

        const quiz = await queryDb.get('SELECT title FROM quizzes WHERE id = ?', [session.quiz_id]);

        // Fetch all questions for this quiz to calculate max score
        const questionsRows = await queryDb.all('SELECT id FROM questions WHERE quiz_id = ?', [session.quiz_id]);
        const totalQuestions = questionsRows.length;

        const participants = await queryDb.all(`
            SELECT DISTINCT u.id, u.username, u.form_class
            FROM users u
            WHERE u.id IN (
                SELECT student_id FROM responses WHERE session_id = ?
                UNION
                SELECT student_id FROM session_attempts WHERE session_id = ? AND status = 'submitted' AND is_official = 1
            )
            ORDER BY u.username ASC
        `, [sessionId, sessionId]);

        const studentResults = [];

        for (const student of participants) {
            const latestRetake = await queryDb.get(`
                SELECT *
                FROM session_attempts
                WHERE session_id = ? AND student_id = ? AND status = 'submitted' AND is_official = 1
                ORDER BY attempt_number DESC, id DESC
                LIMIT 1
            `, [sessionId, student.id]);

            const scoreRow = latestRetake
                ? await queryDb.get(`
                    SELECT COUNT(*) as correctAnswers
                    FROM attempt_responses ar
                    JOIN options o ON o.id = ar.option_id
                    WHERE ar.attempt_id = ? AND o.is_correct = 1
                `, [latestRetake.id])
                : await queryDb.get(`
                    SELECT COUNT(*) as correctAnswers
                    FROM responses r
                    JOIN options o ON o.id = r.option_id
                    WHERE r.session_id = ? AND r.student_id = ? AND o.is_correct = 1
                `, [sessionId, student.id]);

            studentResults.push({
                name: student.username,
                class: student.form_class || 'N/A',
                correctAnswers: scoreRow?.correctAnswers || 0,
                totalScore: scoreRow?.correctAnswers || 0,
                attemptNumber: latestRetake ? latestRetake.attempt_number : 1
            });
        }

        // Convert the aggregated object into a CSV string
        // Headers: Student Name, Class, Score, Correct Answers, Total Questions, Date
        const csvRows = [];
        csvRows.push(['Student Name', 'Class', 'Score', 'Correct Answers', 'Total Questions', 'Attempt', 'Date Completed']); // Header row

        const dateCompleted = new Date(session.ended_at || session.created_at).toLocaleDateString();

        studentResults.forEach(student => {
            csvRows.push([
                student.name,
                student.class,
                student.totalScore,
                student.correctAnswers,
                totalQuestions,
                student.attemptNumber,
                dateCompleted
            ]);
        });

        // Escape CSV values to handle commas inside text
        const csvString = csvRows.map(row =>
            row.map(cell => {
                let cellStr = String(cell);
                if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                    cellStr = `"${cellStr.replace(/"/g, '""')}"`;
                }
                return cellStr;
            }).join(',')
        ).join('\n');

        // Set response headers to trigger a download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="Quiz_Results_${(quiz?.title || 'Session').replace(/[^a-z0-9]/gi, '_')}.csv"`);

        res.send(csvString);

    } catch (error) {
        console.error('Error generating CSV export:', error);
        res.status(500).send('Failed to generate export');
    }
});

// --- Analytics ---

// Get growth data for a specific class
router.get('/analytics/growth', async (req, res) => {
    const { classId } = req.query;
    if (!classId) return res.status(400).json({ error: 'classId is required' });

    try {
        // 1. Fetch all COMPLETED sessions for this class, ordered by date
        const sessions = await queryDb.all(`
            SELECT s.id, s.name as session_name, q.title as quiz_title, s.created_at
            FROM sessions s
            JOIN quizzes q ON s.quiz_id = q.id
            WHERE s.class_id = ? AND s.status = 'completed'
            ORDER BY s.created_at ASC
        `, [classId]);

        if (sessions.length === 0) {
            return res.json({ labels: [], classAverages: [], studentData: {} });
        }

        // 2. Fetch all responses for these sessions
        const sessionIds = sessions.map(s => s.id);
        const placeholders = sessionIds.map(() => '?').join(',');

        const responses = await queryDb.all(`
            SELECT 
                r.session_id, 
                r.student_id, 
                r.question_id, 
                o.is_correct as score_awarded,
                u.username
            FROM responses r
            JOIN options o ON r.option_id = o.id
            JOIN users u ON r.student_id = u.id
            WHERE r.session_id IN (${placeholders})
        `, sessionIds);

        const questionsPerSession = {};
        for (const session of sessions) {
            const sessionData = await queryDb.get('SELECT quiz_id FROM sessions WHERE id = ?', [session.id]);
            const qs = await queryDb.all('SELECT id FROM questions WHERE quiz_id = ?', [sessionData.quiz_id]);
            questionsPerSession[session.id] = qs.length || 1; // avoid div/0
        }

        // 3. Aggregate data
        const labels = sessions.map(s => {
            const date = new Date(s.created_at);
            return `${s.session_name || s.quiz_title} (${date.toLocaleDateString()})`;
        });

        const classAverages = [];
        const studentData = {}; // studentId -> { username, scores: [score1, score2, ...] }

        sessions.forEach((session, idx) => {
            const sessionResponses = responses.filter(r => r.session_id === session.id);
            const totalQ = questionsPerSession[session.id];

            // Map student -> total score for this session
            const studentScoresThisSession = {};
            sessionResponses.forEach(r => {
                if (!studentScoresThisSession[r.student_id]) studentScoresThisSession[r.student_id] = 0;
                studentScoresThisSession[r.student_id] += (r.score_awarded || 0);

                if (!studentData[r.student_id]) {
                    studentData[r.student_id] = {
                        username: r.username,
                        // initialize array with nulls up to current session to handle missed previous quizzes
                        scores: Array(sessions.length).fill(null)
                    };
                }
            });

            // Calculate class average for this session
            const studentIdsWhoTookIt = Object.keys(studentScoresThisSession);
            if (studentIdsWhoTookIt.length > 0) {
                let sessionTotalPct = 0;
                studentIdsWhoTookIt.forEach(studentId => {
                    const rawScore = studentScoresThisSession[studentId];
                    const pct = Math.round((rawScore / totalQ) * 100);
                    sessionTotalPct += pct;
                    studentData[studentId].scores[idx] = pct;
                });
                classAverages.push(Math.round(sessionTotalPct / studentIdsWhoTookIt.length));
            } else {
                classAverages.push(null);
            }
        });

        res.json({
            labels,
            classAverages,
            studentData
        });

    } catch (error) {
        console.error('Error generating growth analytics:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
