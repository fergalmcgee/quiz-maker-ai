const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';
const DEEPSEEK_TIMEOUT_MS = Number.parseInt(process.env.DEEPSEEK_TIMEOUT_MS || '45000', 10);

function getDeepSeekKey() {
    return process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_KEY || '';
}

function extractJsonObject(text) {
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
        try {
            return JSON.parse(text.slice(firstBrace, lastBrace + 1));
        } catch {
            return null;
        }
    }
}

function normalizeStringList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean);
    return [String(value)].filter(Boolean);
}

function normalizeAnalysisItems(value) {
    if (!Array.isArray(value)) return [];
    return value.map(item => {
        if (typeof item === 'string') {
            return {
                issue: item,
                evidence: '',
                affectedQuestions: [],
                teachingAction: ''
            };
        }
        return {
            issue: String(item?.issue || item?.problem || '').trim(),
            evidence: String(item?.evidence || '').trim(),
            affectedQuestions: normalizeStringList(item?.affected_questions || item?.questions),
            teachingAction: String(item?.teaching_action || item?.action || '').trim()
        };
    }).filter(item => item.issue);
}

function safeJsonParse(value, fallback = []) {
    if (!value) return fallback;
    if (Array.isArray(value) || typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function clampScore(score, maxMarks) {
    const parsed = Number.parseInt(score, 10);
    if (!Number.isFinite(parsed)) return null;
    return Math.max(0, Math.min(maxMarks, parsed));
}

async function callDeepSeek(messages, { temperature = 0.2 } = {}) {
    const apiKey = getDeepSeekKey();
    if (!apiKey) {
        const error = new Error('DeepSeek API key is not configured.');
        error.code = 'DEEPSEEK_NOT_CONFIGURED';
        throw error;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEEPSEEK_TIMEOUT_MS);
    let response;

    try {
        response = await fetch(`${DEEPSEEK_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: DEEPSEEK_MODEL,
                messages,
                response_format: { type: 'json_object' },
                thinking: { type: 'enabled' },
                reasoning_effort: 'medium',
                temperature,
                stream: false
            })
        });
    } catch (error) {
        const wrapped = new Error(error.name === 'AbortError'
            ? 'DeepSeek did not respond before the timeout.'
            : 'Could not connect to DeepSeek.');
        wrapped.code = error.name === 'AbortError' ? 'DEEPSEEK_TIMEOUT' : 'DEEPSEEK_CONNECTION_FAILED';
        wrapped.cause = error;
        throw wrapped;
    } finally {
        clearTimeout(timeout);
    }

    const bodyText = await response.text();
    let body;
    try {
        body = JSON.parse(bodyText);
    } catch {
        body = null;
    }

    if (!response.ok) {
        const error = new Error(body?.error?.message || bodyText || 'DeepSeek request failed.');
        error.status = response.status;
        error.code = 'DEEPSEEK_REQUEST_FAILED';
        throw error;
    }

    const content = body?.choices?.[0]?.message?.content || '';
    const parsed = extractJsonObject(content);
    if (!parsed) {
        const error = new Error('DeepSeek returned a non-JSON response.');
        error.raw = content;
        throw error;
    }

    return { parsed, raw: body };
}

export function isDeepSeekConfigured() {
    return !!getDeepSeekKey();
}

function getAnswerType(question) {
    const answerType = String(question.answer_type || 'prose').toLowerCase();
    if (['pseudocode', 'sql'].includes(answerType)) return answerType;

    const searchableText = [
        question.topic,
        question.question_text
    ].join(' ').toLowerCase();

    if (/\bsql\b|structured query language|select .* from|complete the sql/.test(searchableText)) {
        return 'sql';
    }

    if (/write (the )?pseudocode|write pseudocode|program code|write a program|write code|complete .*pseudocode|debug.*pseudocode/.test(searchableText)) {
        return 'pseudocode';
    }

    return 'prose';
}

function getHintInstructions(answerType) {
    if (answerType === 'sql') {
        return [
            'You are a careful SQL tutor.',
            'Help the student understand how to approach the SQL question without giving the final SQL statement.',
            'Give a nudge about the kind of clause or concept to think about, such as SELECT, FROM, WHERE, or ORDER BY.',
            'If the student has already written something, comment only on the next general area to consider.',
            'Use English only.',
            'Do not reveal the final answer, full mark scheme, exact missing bullet list, exact field list, exact condition, or final score.',
            'Return strict JSON only with keys: hint, next_step.'
        ].join(' ');
    }

    if (answerType === 'pseudocode') {
        return [
            'You are a careful Cambridge IGCSE pseudocode tutor.',
            'Help the student understand how to approach the pseudocode question without giving a complete solution.',
            'Give a nudge about the kind of logic to think about, such as loop bounds, selection, array indexes, input, output, or variable updates.',
            'If the student has already written something, comment only on the next general area to consider.',
            'Use English only.',
            'Do not reveal the final answer, full mark scheme, exact missing bullet list, complete algorithm, exact code lines, or final score.',
            'Return strict JSON only with keys: hint, next_step.'
        ].join(' ');
    }

    return [
        'You are a careful school tutor.',
        'Help the student understand how to answer the question without giving the final answer.',
        'Give a useful starting point, concept reminder, or thinking step.',
        'If the student has already written something, comment only on the next general area to consider.',
        'Use English only, even if the student writes in another language.',
        'Do not reveal a model answer, full mark scheme, exact missing bullet list, or final score.',
        'Return strict JSON only with keys: hint, next_step.'
    ].join(' ');
}

function getMarkingInstructions(answerType) {
    if (answerType === 'sql') {
        return [
            'You are an expert Cambridge IGCSE Computer Science SQL marker.',
            'Mark the SQL answer by semantic correctness against the required features and mark scheme.',
            'Accept equivalent valid SQL syntax and harmless optional ASC where appropriate.',
            'Do not require exact formatting, capitalization, or line breaks.',
            'Penalise wrong fields, wrong table, wrong condition, wrong sorting, or missing required clauses according to the marks available.',
            'Use whole-number marks only.',
            'Use English only for feedback.',
            'Return strict JSON only with keys: score, feedback, improvements, matched_criteria, missed_criteria, confidence.'
        ].join(' ');
    }

    if (answerType === 'pseudocode') {
        return [
            'You are an expert Cambridge IGCSE Computer Science pseudocode marker.',
            'Mark the algorithm by logic and required features, not by exact wording.',
            'Accept valid pseudocode or program code if it satisfies the task.',
            'Tolerate minor syntax differences when the intended logic is clear.',
            'Check loop bounds, conditionals, array indexes, input/output, storage, variable updates, and completion conditions where relevant.',
            'Use whole-number marks only.',
            'Use English only for feedback.',
            'Return strict JSON only with keys: score, feedback, improvements, matched_criteria, missed_criteria, confidence.'
        ].join(' ');
    }

    return [
        'You are an expert exam marker.',
        'Mark the student answer fairly against the question and mark scheme.',
        'Award credit for correct valid alternatives, even if they are not explicitly listed in the answer key.',
        'Do not require exact wording.',
        'Use whole-number marks only.',
        'Use English only for feedback.',
        'Return strict JSON only with keys: score, feedback, improvements, matched_criteria, missed_criteria, confidence.'
    ].join(' ');
}

export async function generateLongAnswerHint({ question, answerText }) {
    const answerType = getAnswerType(question);
    const messages = [
        {
            role: 'system',
            content: getHintInstructions(answerType)
        },
        {
            role: 'user',
            content: JSON.stringify({
                task: 'Help the student answer this question without giving the answer.',
                answer_type: answerType,
                question: question.question_text,
                context_for_ai: question.ai_context || '',
                max_marks: question.max_marks,
                student_answer_so_far: answerText || '',
                private_answer_key: question.answer_key || '',
                private_mark_scheme: safeJsonParse(question.mark_scheme, []),
                private_acceptable_alternatives: safeJsonParse(question.acceptable_alternatives, [])
            })
        }
    ];

    const { parsed } = await callDeepSeek(messages, { temperature: 0.4 });
    return {
        hint: String(parsed.hint || 'Think about the key concept being tested and plan one point before writing.'),
        nextStep: String(parsed.next_step || 'Write one clear point, then add a short explanation.')
    };
}

export async function markLongAnswer({ question, answerText }) {
    const maxMarks = Math.max(1, Number.parseInt(question.max_marks, 10) || 1);
    const answerType = getAnswerType(question);
    const messages = [
        {
            role: 'system',
            content: getMarkingInstructions(answerType)
        },
        {
            role: 'user',
            content: JSON.stringify({
                answer_type: answerType,
                question: question.question_text,
                context_for_ai: question.ai_context || '',
                max_marks: maxMarks,
                student_answer: answerText,
                answer_key: question.answer_key || '',
                mark_scheme: safeJsonParse(question.mark_scheme, []),
                acceptable_alternatives: safeJsonParse(question.acceptable_alternatives, []),
                common_misconceptions: safeJsonParse(question.common_misconceptions, [])
            })
        }
    ];

    const { parsed, raw } = await callDeepSeek(messages, { temperature: 0.1 });
    const score = clampScore(parsed.score, maxMarks);
    if (score === null) {
        const error = new Error('DeepSeek did not return a valid whole-number score.');
        error.raw = parsed;
        throw error;
    }

    return {
        score,
        feedback: String(parsed.feedback || ''),
        improvements: normalizeStringList(parsed.improvements),
        matchedCriteria: normalizeStringList(parsed.matched_criteria),
        missedCriteria: normalizeStringList(parsed.missed_criteria),
        confidence: String(parsed.confidence || 'medium'),
        raw
    };
}

export async function analyzeLongAnswerSession({ quiz, questions, responses }) {
    const responseGroups = questions.map((question, index) => {
        const questionResponses = responses.filter(response => String(response.question_id) === String(question.id));
        const scoreDistribution = {};
        let scoreTotal = 0;

        for (const response of questionResponses) {
            const score = Number(response.teacher_score ?? response.ai_score ?? 0);
            scoreTotal += score;
            scoreDistribution[score] = (scoreDistribution[score] || 0) + 1;
        }

        return {
            question_number: index + 1,
            short_name: question.short_name || `Question ${index + 1}`,
            question: question.question_text,
            topic: question.topic || '',
            max_marks: question.max_marks,
            response_count: questionResponses.length,
            average_score: questionResponses.length ? Number((scoreTotal / questionResponses.length).toFixed(2)) : null,
            score_distribution: scoreDistribution,
            representative_responses: questionResponses.slice(0, 40).map(response => ({
                answer: String(response.answer_text || '').slice(0, 1600),
                score: Number(response.teacher_score ?? response.ai_score ?? 0),
                ai_feedback: String(response.ai_feedback || '').slice(0, 800),
                ai_improvements: safeJsonParse(response.ai_improvements, [])
            }))
        };
    });

    const messages = [
        {
            role: 'system',
            content: [
                'You are an expert teacher analyzing anonymized long-answer quiz responses for a class.',
                'Identify recurring misconceptions, omissions, and weak reasoning patterns that would help the teacher plan follow-up teaching.',
                'Use the supplied score distributions and representative responses. Do not invent student counts or claim certainty when evidence is limited.',
                'Keep the analysis concise, practical, and suitable for a teacher. Do not identify or speculate about individual students.',
                'Use English only.',
                'Return strict JSON only with keys: summary, common_problems, strengths, priority_actions.',
                'common_problems must be an array of objects with keys: issue, evidence, affected_questions, teaching_action.',
                'strengths and priority_actions must be arrays of short strings.'
            ].join(' ')
        },
        {
            role: 'user',
            content: JSON.stringify({
                task: 'Summarize the most important class-wide learning patterns in this long-answer quiz.',
                quiz_title: quiz?.title || '',
                total_response_count: responses.length,
                questions: responseGroups
            })
        }
    ];

    const { parsed } = await callDeepSeek(messages, { temperature: 0.2 });
    const questionPerformance = responseGroups.map(group => ({
        questionNumber: group.question_number,
        shortName: group.short_name,
        topic: group.topic,
        responseCount: group.response_count,
        averageScore: group.average_score,
        maxMarks: group.max_marks,
        averagePercent: group.average_score === null
            ? null
            : Number(((group.average_score / group.max_marks) * 100).toFixed(1)),
        scoreDistribution: group.score_distribution
    }));
    const totalMarksAwarded = responseGroups.reduce((total, group) => (
        total + ((group.average_score || 0) * group.response_count)
    ), 0);
    const totalMarksAvailable = responseGroups.reduce((total, group) => (
        total + (group.max_marks * group.response_count)
    ), 0);

    return {
        summary: String(parsed.summary || 'The AI analysis did not provide a summary.'),
        commonProblems: normalizeAnalysisItems(parsed.common_problems),
        strengths: normalizeStringList(parsed.strengths),
        priorityActions: normalizeStringList(parsed.priority_actions),
        overallAveragePercent: totalMarksAvailable
            ? Number(((totalMarksAwarded / totalMarksAvailable) * 100).toFixed(1))
            : null,
        questionPerformance
    };
}
