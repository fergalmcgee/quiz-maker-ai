import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpenText, CheckCircle, ChevronLeft, ChevronRight, ClipboardList, Database, Eye, FileJson, PlayCircle, Plus, Save, Search, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import LongAnswerAnalysisCharts from '../components/LongAnswerAnalysisCharts';

const emptyQuestion = {
    short_name: '',
    answer_type: 'prose',
    question: '',
    student_context: '',
    ai_context: '',
    context_image_url: '',
    max_marks: 4,
    answer_key: '',
    mark_scheme: '',
    acceptable_alternatives: '',
    common_misconceptions: '',
    topic: ''
};

const inputStyle = {
    width: '100%',
    padding: '0.75rem',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    fontSize: '0.95rem'
};

const buttonStyle = {
    border: 'none',
    borderRadius: 'var(--radius-md)',
    padding: '0.7rem 1rem',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.45rem'
};

function linesToArray(value) {
    return String(value || '').split('\n').map(line => line.trim()).filter(Boolean);
}

function buildQuestionPayload(question) {
    return {
        short_name: question.short_name,
        answer_type: question.answer_type || 'prose',
        question: question.question,
        student_context: question.student_context,
        ai_context: question.ai_context,
        context_image_url: question.context_image_url,
        max_marks: Number.parseInt(question.max_marks, 10) || 1,
        answer_key: question.answer_key,
        mark_scheme: linesToArray(question.mark_scheme).map(line => ({ marks: 1, criterion: line })),
        acceptable_alternatives: linesToArray(question.acceptable_alternatives),
        common_misconceptions: linesToArray(question.common_misconceptions),
        topic: question.topic
    };
}

function getQuestionReference(question, index) {
    const shortName = String(question?.short_name || '').trim();
    const reference = shortName.match(/\bQ\d+(?:\([a-z0-9]+\)|[a-z])?/i);
    return reference?.[0] || `Q${index + 1}`;
}

export default function TeacherLongAnswers({ user }) {
    const navigate = useNavigate();
    const [quizzes, setQuizzes] = useState([]);
    const [bankQuestions, setBankQuestions] = useState([]);
    const [bankLoading, setBankLoading] = useState(false);
    const [bankFilters, setBankFilters] = useState({ q: '', subject: '', level: '', topic: '', type: '' });
    const [selectedBankQuestionIds, setSelectedBankQuestionIds] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [classes, setClasses] = useState([]);
    const [config, setConfig] = useState(null);
    const [activePanel, setActivePanel] = useState('library');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [subject, setSubject] = useState('Computer Science');
    const [level, setLevel] = useState('');
    const [topic, setTopic] = useState('');
    const [questions, setQuestions] = useState([{ ...emptyQuestion }]);
    const [jsonText, setJsonText] = useState('');
    const [startState, setStartState] = useState({});
    const [selectedSession, setSelectedSession] = useState(null);
    const [sessionDetails, setSessionDetails] = useState(null);
    const [previewDetails, setPreviewDetails] = useState(null);
    const [saving, setSaving] = useState(false);
    const [reviewDrafts, setReviewDrafts] = useState({});
    const [reviewSaving, setReviewSaving] = useState({});
    const [feedbackReleaseSaving, setFeedbackReleaseSaving] = useState({});
    const [reviewQuestionIndex, setReviewQuestionIndex] = useState(0);
    const [sessionAnalysis, setSessionAnalysis] = useState(null);
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [assignmentQuiz, setAssignmentQuiz] = useState(null);
    const [recentQuiz, setRecentQuiz] = useState(null);

    useEffect(() => {
        fetchAll();
    }, []);

    const fetchAll = async () => {
        await Promise.all([fetchQuizzes(), fetchBankQuestions(), fetchSessions(), fetchClasses(), fetchConfig()]);
    };

    const fetchConfig = async () => {
        const res = await fetch('/api/long-answer/config');
        if (res.ok) setConfig(await res.json());
    };

    const fetchQuizzes = async () => {
        const res = await fetch('/api/long-answer/quizzes');
        if (res.ok) setQuizzes(await res.json());
    };

    const fetchBankQuestions = async () => {
        try {
            setBankLoading(true);
            const params = new URLSearchParams();
            Object.entries(bankFilters).forEach(([key, value]) => {
                if (String(value || '').trim()) params.append(key, String(value).trim());
            });
            const res = await fetch(`/api/long-answer/bank/questions?${params.toString()}`);
            if (res.ok) setBankQuestions(await res.json());
        } finally {
            setBankLoading(false);
        }
    };

    const fetchSessions = async () => {
        const res = await fetch('/api/long-answer/sessions/teacher');
        if (res.ok) setSessions(await res.json());
    };

    const fetchClasses = async () => {
        const res = await fetch(`/api/classes?teacherId=${user.id}`);
        if (res.ok) setClasses(await res.json());
    };

    const updateQuestion = (index, field, value) => {
        setQuestions(current => current.map((question, questionIndex) => (
            questionIndex === index ? { ...question, [field]: value } : question
        )));
    };

    const addQuestion = () => {
        setQuestions(current => [...current, { ...emptyQuestion, topic }]);
    };

    const removeQuestion = (index) => {
        setQuestions(current => current.length === 1 ? current : current.filter((_, questionIndex) => questionIndex !== index));
    };

    const handleCreateQuiz = async (event) => {
        event.preventDefault();
        if (user.role !== 'admin' && selectedBankQuestionIds.length === 0) {
            toast.error('Choose at least one bank question');
            return;
        }
        setSaving(true);
        try {
            let payload;
            if (user.role !== 'admin') {
                payload = {
                    title,
                    description,
                    subject,
                    level,
                    topic,
                    bankQuestionIds: selectedBankQuestionIds
                };
            } else if (jsonText.trim()) {
                const parsed = JSON.parse(jsonText);
                payload = {
                    title: title || parsed.title,
                    description: description || parsed.description,
                    subject: subject || parsed.subject,
                    level: level || parsed.level,
                    topic: topic || parsed.topic,
                    source: parsed
                };
            } else {
                payload = {
                    title,
                    description,
                    subject,
                    level,
                    topic,
                    questions: questions.map(buildQuestionPayload)
                };
            }

            const res = await fetch('/api/long-answer/quizzes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to create long-answer quiz');

            toast.success(`Created ${data.questionsImported} long-answer question${data.questionsImported === 1 ? '' : 's'}`);
            setRecentQuiz({ id: data.id, title: data.title, questionsImported: data.questionsImported });
            setStartState(current => ({
                ...current,
                [data.id]: {
                    ...current[data.id],
                    name: data.title
                }
            }));
            setTitle('');
            setDescription('');
            setTopic('');
            setSelectedBankQuestionIds([]);
            setQuestions([{ ...emptyQuestion }]);
            setJsonText('');
            setActivePanel('library');
            await fetchQuizzes();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error) {
            toast.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleBankQuestion = (questionId) => {
        setSelectedBankQuestionIds(current => (
            current.includes(questionId)
                ? current.filter(id => id !== questionId)
                : [...current, questionId]
        ));
    };

    const hasActiveAssignment = (quizId, classId) => (
        !!classId && sessions.some(session => (
            Number(session.quiz_id) === Number(quizId)
            && Number(session.class_id) === Number(classId)
            && session.status === 'active'
        ))
    );

    const openAssignmentReview = (quiz) => {
        const state = startState[quiz.id] || {};
        if (!state.classId) {
            toast.error('Choose a class first');
            return;
        }
        if (hasActiveAssignment(quiz.id, state.classId)) {
            toast.error('This quiz is already assigned to that class');
            return;
        }
        setStartState(current => ({
            ...current,
            [quiz.id]: {
                releaseFeedback: 'held',
                allowAiHints: 'enabled',
                ...current[quiz.id]
            }
        }));
        setAssignmentQuiz(quiz);
    };

    const selectedBankQuestions = useMemo(() => {
        const byId = new Map(bankQuestions.map(question => [question.id, question]));
        return selectedBankQuestionIds.map(id => byId.get(id)).filter(Boolean);
    }, [bankQuestions, selectedBankQuestionIds]);

    const previewQuiz = async (quiz) => {
        const res = await fetch(`/api/long-answer/quizzes/${quiz.id}`);
        if (!res.ok) {
            toast.error('Could not load preview');
            return;
        }
        setPreviewDetails(await res.json());
        setActivePanel('preview');
    };

    const handleStartSession = async (quizId) => {
        const state = startState[quizId] || {};
        if (!state.classId) {
            toast.error('Choose a class first');
            return false;
        }

        try {
            const res = await fetch('/api/long-answer/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quizId,
                    classId: state.classId,
                    name: state.name,
                    mode: state.mode || 'async',
                    releaseFeedback: state.releaseFeedback === 'immediate',
                    allowAiHints: state.allowAiHints !== 'disabled'
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to assign long-answer quiz');
            toast.success('Long-answer quiz assigned');
            await fetchSessions();
            return true;
        } catch (error) {
            toast.error(error.message);
            return false;
        }
    };

    const confirmAssignment = async () => {
        if (!assignmentQuiz) return;
        const assigned = await handleStartSession(assignmentQuiz.id);
        if (assigned) {
            if (Number(recentQuiz?.id) === Number(assignmentQuiz.id)) setRecentQuiz(null);
            setAssignmentQuiz(null);
        }
    };

    const loadSessionDetails = async (session) => {
        setSelectedSession(session);
        setSessionAnalysis(null);
        const res = await fetch(`/api/long-answer/sessions/${session.id}`);
        if (res.ok) {
            const data = await res.json();
            setSessionDetails(data);
            setReviewQuestionIndex(0);
            setSessionAnalysis(data.savedAnalysis || null);
            setReviewDrafts(Object.fromEntries((data.responses || []).map(response => {
                const hasTeacherOverride = response.teacher_score !== null && response.teacher_score !== undefined;
                return [response.id, {
                    score: String(hasTeacherOverride ? response.teacher_score : (response.ai_score ?? '')),
                    feedback: hasTeacherOverride ? (response.teacher_feedback || '') : (response.ai_feedback || '')
                }];
            })));
            setActivePanel('review');
        }
    };

    const updateReviewDraft = (responseId, field, value) => {
        setReviewDrafts(current => ({
            ...current,
            [responseId]: { ...current[responseId], [field]: value }
        }));
    };

    const updateResponseReviewState = (responseId, review) => {
        setSessionDetails(current => ({
            ...current,
            responses: (current.responses || []).map(response => (
                response.id === responseId ? { ...response, ...review } : response
            ))
        }));
    };

    const saveReview = async (response, question) => {
        const draft = reviewDrafts[response.id] || {};
        const score = Number(draft.score);
        if (!Number.isInteger(score) || score < 0 || score > Number(question.max_marks)) {
            toast.error(`Enter a whole-number mark from 0 to ${question.max_marks}`);
            return;
        }

        setReviewSaving(current => ({ ...current, [response.id]: true }));
        try {
            const res = await fetch(`/api/long-answer/responses/${response.id}/review`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teacherScore: score, teacherFeedback: draft.feedback || '' })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save teacher review');
            updateResponseReviewState(response.id, data);
            setReviewDrafts(current => ({
                ...current,
                [response.id]: {
                    score: String(data.teacher_score),
                    feedback: data.teacher_feedback || ''
                }
            }));
            toast.success('Teacher override saved');
        } catch (error) {
            toast.error(error.message);
        } finally {
            setReviewSaving(current => ({ ...current, [response.id]: false }));
        }
    };

    const resetReview = async (response) => {
        setReviewSaving(current => ({ ...current, [response.id]: true }));
        try {
            const res = await fetch(`/api/long-answer/responses/${response.id}/review`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clearOverride: true })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to remove teacher override');
            updateResponseReviewState(response.id, data);
            setReviewDrafts(current => ({
                ...current,
                [response.id]: {
                    score: String(response.ai_score ?? ''),
                    feedback: response.ai_feedback || ''
                }
            }));
            toast.success('Returned to AI mark');
        } catch (error) {
            toast.error(error.message);
        } finally {
            setReviewSaving(current => ({ ...current, [response.id]: false }));
        }
    };

    const updateSessionStatus = async (sessionId, status) => {
        const res = await fetch(`/api/long-answer/sessions/${sessionId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            toast.success('Session updated');
            fetchSessions();
            if (selectedSession?.id === sessionId) {
                setSelectedSession(null);
                setSessionDetails(null);
                setActivePanel('sessions');
            }
        }
    };

    const updateFeedbackRelease = async (sessionId, releaseFeedback) => {
        if (!releaseFeedback && !window.confirm('Hold marks and feedback? Students who already opened their results may already have seen them.')) {
            return;
        }
        setFeedbackReleaseSaving(current => ({ ...current, [sessionId]: true }));
        try {
            const res = await fetch(`/api/long-answer/sessions/${sessionId}/feedback-release`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ releaseFeedback })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update feedback release');
            setSessions(current => current.map(session => (
                session.id === sessionId ? { ...session, release_feedback: data.release_feedback } : session
            )));
            setSelectedSession(current => (
                current?.id === sessionId ? { ...current, release_feedback: data.release_feedback } : current
            ));
            setSessionDetails(current => (
                current?.session?.id === sessionId
                    ? { ...current, session: { ...current.session, release_feedback: data.release_feedback } }
                    : current
            ));
            toast.success(data.message);
        } catch (error) {
            toast.error(error.message);
        } finally {
            setFeedbackReleaseSaving(current => ({ ...current, [sessionId]: false }));
        }
    };

    const analyzeSession = async () => {
        const sessionId = sessionDetails?.session?.id;
        if (!sessionId) return;

        setAnalysisLoading(true);
        try {
            const res = await fetch(`/api/long-answer/sessions/${sessionId}/analyze`, {
                method: 'POST'
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to analyze quiz responses');
            setSessionAnalysis(data);
            toast.success('AI class analysis ready');
        } catch (error) {
            toast.error(error.message);
        } finally {
            setAnalysisLoading(false);
        }
    };

    const responsesByQuestion = useMemo(() => {
        const grouped = {};
        for (const response of sessionDetails?.responses || []) {
            if (!grouped[response.question_id]) grouped[response.question_id] = [];
            grouped[response.question_id].push(response);
        }
        return grouped;
    }, [sessionDetails]);

    const reviewQuestions = sessionDetails?.questions || [];
    const reviewQuestion = reviewQuestions[reviewQuestionIndex];
    const reviewQuestionResponses = reviewQuestion ? (responsesByQuestion[reviewQuestion.id] || []) : [];
    const studentRoster = sessionDetails?.studentRoster || [];
    const submittedStudents = studentRoster.filter(student => student.submitted_at);
    const waitingStudents = studentRoster.filter(student => !student.submitted_at);
    const assignmentState = assignmentQuiz ? (startState[assignmentQuiz.id] || {}) : {};
    const assignmentClass = assignmentQuiz
        ? classes.find(cls => String(cls.id) === String(assignmentState.classId))
        : null;
    const assignmentAlreadyActive = assignmentQuiz
        ? hasActiveAssignment(assignmentQuiz.id, assignmentState.classId)
        : false;
    const analysisGeneratedAt = Date.parse(sessionAnalysis?.generatedAt || '');
    const analysisIsOutdated = sessionAnalysis
        && (
            Number(sessionAnalysis.responseCount || 0) < (sessionDetails?.responses?.length || 0)
            || (Number.isFinite(analysisGeneratedAt) && (sessionDetails?.responses || []).some(response => (
                Date.parse(response.updated_at || response.submitted_at || '') > analysisGeneratedAt
            )))
        );
    const goToReviewQuestion = (index) => {
        if (index < 0 || index >= reviewQuestions.length) return;
        setReviewQuestionIndex(index);
    };

    const renderQuestionPreview = (question, index) => (
        <div key={question.id || index} style={{ backgroundColor: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                <div>
                    <h4 style={{ margin: 0 }}>Question {index + 1}{question.short_name ? `: ${question.short_name}` : ''}</h4>
                    <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-muted)' }}>
                        {question.answer_type || 'prose'} · {question.max_marks} marks · {question.topic || 'General'}
                    </p>
                </div>
            </div>
            <p style={{ whiteSpace: 'pre-wrap', marginTop: '0.85rem' }}>{question.question_text || question.question}</p>
            {(question.context_image_url || question.student_context) && (
                <div style={{ marginTop: '0.85rem', padding: '1rem', border: '1px solid #E2E8F0', borderRadius: 'var(--radius-md)', backgroundColor: '#F8FAFC' }}>
                    {question.context_image_url && (
                        <img src={question.context_image_url} alt="Question context preview" style={{ display: 'block', maxWidth: '100%', maxHeight: '260px', objectFit: 'contain', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginBottom: question.student_context ? '0.85rem' : 0 }} />
                    )}
                    {question.student_context && (
                        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{question.student_context}</div>
                    )}
                </div>
            )}
            <textarea
                disabled
                placeholder={(question.answer_type || '') === 'sql' ? 'Student SQL answer box' : (question.answer_type || '') === 'pseudocode' ? 'Student pseudocode/code answer box' : 'Student answer box'}
                style={{
                    ...inputStyle,
                    marginTop: '0.85rem',
                    minHeight: ['pseudocode', 'sql'].includes(question.answer_type) ? '180px' : '120px',
                    fontFamily: ['pseudocode', 'sql'].includes(question.answer_type) ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' : undefined,
                    backgroundColor: ['pseudocode', 'sql'].includes(question.answer_type) ? '#0F172A' : '#F9FAFB',
                    color: ['pseudocode', 'sql'].includes(question.answer_type) ? '#E5E7EB' : 'var(--text-muted)'
                }}
            />
        </div>
    );

    return (
        <div className="fade-in">
            <button onClick={() => navigate(user.role === 'admin' ? '/admin' : '/teacher')} style={{ ...buttonStyle, backgroundColor: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border)', marginBottom: '1rem' }}>
                <ArrowLeft size={18} /> Back
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div>
                    <h2 style={{ margin: 0 }}>Long Answer</h2>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                        AI marking: {config?.deepseekConfigured ? `ready (${config.model})` : 'not configured'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {['library', 'create', 'sessions'].map(panel => (
                        <button
                            key={panel}
                            onClick={() => setActivePanel(panel)}
                            style={{
                                ...buttonStyle,
                                backgroundColor: activePanel === panel ? 'var(--primary)' : 'white',
                                color: activePanel === panel ? 'white' : 'var(--text-main)',
                                border: `1px solid ${activePanel === panel ? 'var(--primary)' : 'var(--border)'}`
                            }}
                        >
                            {panel === 'library' && <BookOpenText size={18} />}
                            {panel === 'create' && (user.role === 'admin' ? <Plus size={18} /> : <Database size={18} />)}
                            {panel === 'sessions' && <ClipboardList size={18} />}
                            {panel === 'create' && user.role !== 'admin' ? 'Build Quiz' : panel.charAt(0).toUpperCase() + panel.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {activePanel === 'library' && (
                <div style={{ display: 'grid', gap: '1rem' }}>
                    {recentQuiz && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', padding: '1rem', backgroundColor: '#ECFDF5', border: '1px solid #86EFAC', borderRadius: 'var(--radius-md)', color: '#166534' }}>
                            <div>
                                <strong>New long-answer quiz created: {recentQuiz.title}</strong>
                                <p style={{ margin: '0.35rem 0 0 0' }}>
                                    It is highlighted below. Choose a class on that card, then click Review & Assign.
                                </p>
                            </div>
                            <button type="button" onClick={() => setRecentQuiz(null)} style={{ ...buttonStyle, backgroundColor: 'white', color: '#166534', border: '1px solid #BBF7D0' }}>
                                Dismiss
                            </button>
                        </div>
                    )}
                    {quizzes.length === 0 ? (
                        <div style={{ padding: '1.5rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                            No long-answer quizzes yet.
                        </div>
                    ) : quizzes.map(quiz => {
                        const assignmentAlreadyActive = hasActiveAssignment(quiz.id, startState[quiz.id]?.classId);
                        const isRecentQuiz = Number(recentQuiz?.id) === Number(quiz.id);
                        return (
                        <div key={quiz.id} id={`long-answer-quiz-${quiz.id}`} style={{ padding: '1.25rem', backgroundColor: isRecentQuiz ? '#F0FDF4' : 'var(--surface)', borderRadius: 'var(--radius-md)', border: `2px solid ${isRecentQuiz ? '#22C55E' : 'var(--border)'}`, boxShadow: isRecentQuiz ? '0 12px 30px rgba(34, 197, 94, 0.18)' : 'var(--shadow-sm)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                <h3 style={{ margin: 0 }}>{quiz.title}</h3>
                                {isRecentQuiz && (
                                    <span style={{ padding: '0.35rem 0.7rem', borderRadius: '999px', backgroundColor: '#DCFCE7', color: '#166534', fontWeight: 900, border: '1px solid #86EFAC' }}>
                                        Just Created
                                    </span>
                                )}
                            </div>
                            <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0.75rem 0' }}>
                                {quiz.subject} · {quiz.level || 'General'} · {quiz.topic || 'General'} · {quiz.question_count} question{quiz.question_count === 1 ? '' : 's'}
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(180px, 1fr) auto', gap: '0.75rem', alignItems: 'center' }}>
                                <input
                                    placeholder="Session name"
                                    value={startState[quiz.id]?.name || ''}
                                    onChange={e => setStartState(current => ({ ...current, [quiz.id]: { ...current[quiz.id], name: e.target.value } }))}
                                    style={inputStyle}
                                />
                                <select
                                    value={startState[quiz.id]?.classId || ''}
                                    onChange={e => setStartState(current => ({ ...current, [quiz.id]: { ...current[quiz.id], classId: e.target.value } }))}
                                    style={inputStyle}
                                >
                                    <option value="">Choose class...</option>
                                    {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                                </select>
                                <button
                                    onClick={() => openAssignmentReview(quiz)}
                                    disabled={assignmentAlreadyActive}
                                    style={{ ...buttonStyle, backgroundColor: assignmentAlreadyActive ? '#CBD5E1' : 'var(--primary)', color: assignmentAlreadyActive ? '#475569' : 'white', cursor: assignmentAlreadyActive ? 'not-allowed' : 'pointer' }}
                                >
                                    <PlayCircle size={18} /> {assignmentAlreadyActive ? 'Already Assigned' : 'Review & Assign'}
                                </button>
                            </div>
                            <p style={{ margin: '0.65rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                Review & Assign lets you choose whether student marks are withheld and whether AI hints are available before the quiz opens.
                            </p>
                            <button onClick={() => previewQuiz(quiz)} style={{ ...buttonStyle, marginTop: '0.75rem', backgroundColor: '#F8FAFC', color: 'var(--text-main)', border: '1px solid var(--border)' }}>
                                <Eye size={18} /> Preview Student Layout
                            </button>
                        </div>
                        );
                    })}
                </div>
            )}

            {activePanel === 'create' && user.role !== 'admin' && (
                <form onSubmit={handleCreateQuiz} style={{ display: 'grid', gap: '1rem' }}>
                    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
                        <h3 style={{ marginTop: 0 }}>Build From Approved Questions</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                            <input required placeholder="Quiz title" value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} />
                            <input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} />
                            <input placeholder="Level" value={level} onChange={e => setLevel(e.target.value)} style={inputStyle} />
                        </div>
                        <input placeholder="Topic" value={topic} onChange={e => setTopic(e.target.value)} style={{ ...inputStyle, marginBottom: '1rem' }} />
                        <textarea placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: '80px' }} />
                    </div>

                    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
                            <div>
                                <h3 style={{ margin: 0 }}>Question Bank</h3>
                                <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0 0' }}>{selectedBankQuestionIds.length} selected</p>
                            </div>
                            <button type="button" onClick={fetchBankQuestions} disabled={bankLoading} style={{ ...buttonStyle, backgroundColor: '#EEF2FF', color: '#3730A3', opacity: bankLoading ? 0.65 : 1 }}>
                                <Search size={18} /> {bankLoading ? 'Searching...' : 'Search'}
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) repeat(4, minmax(120px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                            <input placeholder="Search text" value={bankFilters.q} onChange={e => setBankFilters(current => ({ ...current, q: e.target.value }))} style={inputStyle} />
                            <input placeholder="Subject" value={bankFilters.subject} onChange={e => setBankFilters(current => ({ ...current, subject: e.target.value }))} style={inputStyle} />
                            <input placeholder="Level" value={bankFilters.level} onChange={e => setBankFilters(current => ({ ...current, level: e.target.value }))} style={inputStyle} />
                            <input placeholder="Topic" value={bankFilters.topic} onChange={e => setBankFilters(current => ({ ...current, topic: e.target.value }))} style={inputStyle} />
                            <select value={bankFilters.type} onChange={e => setBankFilters(current => ({ ...current, type: e.target.value }))} style={inputStyle}>
                                <option value="">Any type</option>
                                <option value="prose">Prose</option>
                                <option value="pseudocode">Pseudocode</option>
                                <option value="sql">SQL</option>
                            </select>
                        </div>

                        {bankQuestions.length === 0 ? (
                            <div style={{ padding: '1rem', backgroundColor: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)' }}>
                                No approved long-answer bank questions yet. Ask an admin to import or create them.
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '0.75rem', maxHeight: '520px', overflowY: 'auto' }}>
                                {bankQuestions.map(question => {
                                    const selected = selectedBankQuestionIds.includes(question.id);
                                    return (
                                        <label key={question.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.75rem', padding: '1rem', border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', backgroundColor: selected ? '#EEF2FF' : '#F8FAFC', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={selected} onChange={() => toggleBankQuestion(question.id)} style={{ marginTop: '0.25rem' }} />
                                            <div>
                                                <strong>{question.short_name || `Question ${question.id}`}</strong>
                                                <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-main)' }}>{question.question_text}</p>
                                                {question.student_context && (
                                                    <p style={{ whiteSpace: 'pre-wrap', margin: '0.5rem 0 0 0', color: 'var(--text-muted)' }}>{question.student_context.slice(0, 220)}{question.student_context.length > 220 ? '...' : ''}</p>
                                                )}
                                                <div style={{ marginTop: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                                    {question.answer_type} · {question.max_marks} marks · {question.subject} · {question.level || 'General'} · {question.topic || 'General'}
                                                </div>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {selectedBankQuestions.length > 0 && (
                        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
                            <h3 style={{ marginTop: 0 }}>Selected Question Preview</h3>
                            <div style={{ display: 'grid', gap: '1rem' }}>
                                {selectedBankQuestions.map((question, index) => renderQuestionPreview(question, index))}
                            </div>
                        </div>
                    )}

                    <button disabled={saving} type="submit" style={{ ...buttonStyle, backgroundColor: 'var(--primary)', color: 'white', justifyContent: 'center', opacity: saving ? 0.7 : 1 }}>
                        <Save size={18} /> {saving ? 'Saving...' : 'Save Quiz From Selected Questions'}
                    </button>
                </form>
            )}

            {activePanel === 'create' && user.role === 'admin' && (
                <form onSubmit={handleCreateQuiz} style={{ display: 'grid', gap: '1rem', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
                        <input required={!jsonText.trim()} placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} />
                        <input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} />
                        <input placeholder="Level" value={level} onChange={e => setLevel(e.target.value)} style={inputStyle} />
                    </div>
                    <input placeholder="Topic" value={topic} onChange={e => setTopic(e.target.value)} style={inputStyle} />
                    <textarea placeholder="Description" value={description} onChange={e => setDescription(e.target.value)} style={{ ...inputStyle, minHeight: '80px' }} />

                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                            <FileJson size={18} /> Optional JSON Import
                        </label>
                        <textarea
                            placeholder='Paste a long-answer JSON bank here, or leave blank and use the question builder below.'
                            value={jsonText}
                            onChange={e => setJsonText(e.target.value)}
                            style={{ ...inputStyle, minHeight: '140px', fontFamily: 'monospace' }}
                        />
                    </div>

                    {!jsonText.trim() && questions.map((question, index) => (
                        <div key={index} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'grid', gap: '0.75rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong>Question {index + 1}</strong>
                                <button type="button" onClick={() => removeQuestion(index)} style={{ ...buttonStyle, backgroundColor: '#FEF2F2', color: '#B91C1C', padding: '0.45rem 0.7rem' }}>
                                    <X size={16} /> Remove
                                </button>
                            </div>
                            <textarea required placeholder="Question" value={question.question} onChange={e => updateQuestion(index, 'question', e.target.value)} style={{ ...inputStyle, minHeight: '90px' }} />
                            <input placeholder="Short name, e.g. Q8d SQL" value={question.short_name} onChange={e => updateQuestion(index, 'short_name', e.target.value)} style={inputStyle} />
                            <textarea placeholder="Student-facing context, such as a table, scenario, or data schema" value={question.student_context} onChange={e => updateQuestion(index, 'student_context', e.target.value)} style={{ ...inputStyle, minHeight: '80px' }} />
                            <textarea placeholder="AI-only marking context, optional" value={question.ai_context} onChange={e => updateQuestion(index, 'ai_context', e.target.value)} style={{ ...inputStyle, minHeight: '70px' }} />
                            <input placeholder="Context image URL, optional" value={question.context_image_url} onChange={e => updateQuestion(index, 'context_image_url', e.target.value)} style={inputStyle} />
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.75rem' }}>
                                <input type="number" min="1" step="1" value={question.max_marks} onChange={e => updateQuestion(index, 'max_marks', e.target.value)} style={inputStyle} />
                                <input placeholder="Topic" value={question.topic} onChange={e => updateQuestion(index, 'topic', e.target.value)} style={inputStyle} />
                            </div>
                            <select value={question.answer_type} onChange={e => updateQuestion(index, 'answer_type', e.target.value)} style={inputStyle}>
                                <option value="prose">Explanation / Prose</option>
                                <option value="pseudocode">Pseudocode / Program Code</option>
                                <option value="sql">SQL</option>
                            </select>
                            <textarea required placeholder={question.answer_type === 'sql' ? 'Expected SQL / answer key' : question.answer_type === 'pseudocode' ? 'Expected algorithm / model answer' : 'Answer key / model answer'} value={question.answer_key} onChange={e => updateQuestion(index, 'answer_key', e.target.value)} style={{ ...inputStyle, minHeight: '90px' }} />
                            <textarea required placeholder={question.answer_type === 'prose' ? 'Mark scheme, one criterion per line' : 'Required features, one per line'} value={question.mark_scheme} onChange={e => updateQuestion(index, 'mark_scheme', e.target.value)} style={{ ...inputStyle, minHeight: '90px' }} />
                            <textarea placeholder="Acceptable alternatives, one per line" value={question.acceptable_alternatives} onChange={e => updateQuestion(index, 'acceptable_alternatives', e.target.value)} style={{ ...inputStyle, minHeight: '70px' }} />
                            <textarea placeholder="Common misconceptions, one per line" value={question.common_misconceptions} onChange={e => updateQuestion(index, 'common_misconceptions', e.target.value)} style={{ ...inputStyle, minHeight: '70px' }} />
                        </div>
                    ))}

                    {!jsonText.trim() && (
                        <button type="button" onClick={addQuestion} style={{ ...buttonStyle, backgroundColor: '#EEF2FF', color: '#3730A3', justifyContent: 'center' }}>
                            <Plus size={18} /> Add Question
                        </button>
                    )}

                    <button disabled={saving} type="submit" style={{ ...buttonStyle, backgroundColor: 'var(--primary)', color: 'white', justifyContent: 'center', opacity: saving ? 0.7 : 1 }}>
                        <Save size={18} /> {saving ? 'Saving...' : 'Save Long-Answer Quiz'}
                    </button>
                </form>
            )}

            {activePanel === 'sessions' && (
                <div style={{ display: 'grid', gap: '1rem' }}>
                    {sessions.length === 0 ? (
                        <div style={{ padding: '1.5rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                            No long-answer sessions yet.
                        </div>
                    ) : sessions.map(session => (
                        <div key={session.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '1.25rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                            <div>
                                <h3 style={{ margin: 0 }}>{session.name || session.quiz_title}</h3>
                                <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0 0' }}>
                                    {session.quiz_title} · {session.class_name || 'No class'} · {session.status} · {session.submitted_students || 0}/{session.total_students || 0} submitted
                                </p>
                                <p style={{ color: session.release_feedback === 1 ? '#166534' : '#92400E', margin: '0.35rem 0 0 0', fontWeight: 800, fontSize: '0.9rem' }}>
                                    {session.release_feedback === 1 ? 'Marks and feedback released' : 'Marks and feedback held for review'}
                                </p>
                                <p style={{ color: session.allow_ai_hints === 0 ? '#92400E' : '#166534', margin: '0.25rem 0 0 0', fontWeight: 800, fontSize: '0.9rem' }}>
                                    {session.allow_ai_hints === 0 ? 'AI hints disabled' : 'AI hints allowed'}
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                <button onClick={() => loadSessionDetails(session)} style={{ ...buttonStyle, backgroundColor: '#EEF2FF', color: '#3730A3' }}>
                                    <ClipboardList size={18} /> Review
                                </button>
                                <button
                                    onClick={() => updateFeedbackRelease(session.id, session.release_feedback !== 1)}
                                    disabled={feedbackReleaseSaving[session.id]}
                                    style={{ ...buttonStyle, backgroundColor: session.release_feedback === 1 ? '#FFFBEB' : '#ECFDF5', color: session.release_feedback === 1 ? '#92400E' : '#047857', opacity: feedbackReleaseSaving[session.id] ? 0.65 : 1 }}
                                >
                                    {feedbackReleaseSaving[session.id]
                                        ? 'Updating...'
                                        : session.release_feedback === 1 ? 'Hold Marks' : 'Release Marks'}
                                </button>
                                {session.status === 'active' && (
                                    <button onClick={() => updateSessionStatus(session.id, 'completed')} style={{ ...buttonStyle, backgroundColor: '#ECFDF5', color: '#047857' }}>
                                        <CheckCircle size={18} /> Close
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {activePanel === 'preview' && previewDetails && (
                <div style={{ display: 'grid', gap: '1rem' }}>
                    <button onClick={() => setActivePanel('library')} style={{ ...buttonStyle, backgroundColor: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border)', width: 'fit-content' }}>
                        <ArrowLeft size={18} /> Library
                    </button>
                    <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem' }}>
                        <h3 style={{ marginTop: 0 }}>{previewDetails.title}</h3>
                        <p style={{ color: 'var(--text-muted)', marginTop: '-0.35rem' }}>
                            {previewDetails.subject} · {previewDetails.level || 'General'} · {previewDetails.topic || 'General'}
                        </p>
                        <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
                            {(previewDetails.questions || []).map((question, index) => renderQuestionPreview(question, index))}
                        </div>
                    </div>
                </div>
            )}

            {activePanel === 'review' && sessionDetails && (
                <div style={{ display: 'grid', gap: '1rem' }}>
                    <button onClick={() => setActivePanel('sessions')} style={{ ...buttonStyle, backgroundColor: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border)', width: 'fit-content' }}>
                        <ArrowLeft size={18} /> Sessions
                    </button>
                    <div style={{ padding: '1.25rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                        <h3 style={{ marginTop: 0 }}>{selectedSession?.name || sessionDetails.quiz.title}</h3>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', padding: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: sessionDetails.session.release_feedback === 1 ? '#ECFDF5' : '#FFFBEB', border: `1px solid ${sessionDetails.session.release_feedback === 1 ? '#A7F3D0' : '#FDE68A'}` }}>
                            <strong style={{ color: sessionDetails.session.release_feedback === 1 ? '#166534' : '#92400E' }}>
                                {sessionDetails.session.release_feedback === 1
                                    ? 'Students can see their marks and feedback after submitting.'
                                    : 'Marks and feedback are held while you review responses.'}
                            </strong>
                            <button
                                type="button"
                                onClick={() => updateFeedbackRelease(sessionDetails.session.id, sessionDetails.session.release_feedback !== 1)}
                                disabled={feedbackReleaseSaving[sessionDetails.session.id]}
                                style={{ ...buttonStyle, backgroundColor: sessionDetails.session.release_feedback === 1 ? '#FEF3C7' : '#166534', color: sessionDetails.session.release_feedback === 1 ? '#92400E' : 'white', opacity: feedbackReleaseSaving[sessionDetails.session.id] ? 0.65 : 1 }}
                            >
                                {feedbackReleaseSaving[sessionDetails.session.id]
                                    ? 'Updating...'
                                    : sessionDetails.session.release_feedback === 1 ? 'Hold Marks' : 'Release Marks and Feedback'}
                            </button>
                        </div>
                        {studentRoster.length > 0 && (
                            <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: '#F8FAFC', border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                    <div>
                                        <strong>Student Completion</strong>
                                        <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0 0' }}>
                                            {submittedStudents.length} submitted · {waitingStudents.length} not submitted
                                        </p>
                                    </div>
                                    <span style={{ padding: '0.35rem 0.65rem', borderRadius: '999px', backgroundColor: waitingStudents.length ? '#FEF2F2' : '#ECFDF5', color: waitingStudents.length ? '#B91C1C' : '#166534', fontWeight: 800 }}>
                                        {submittedStudents.length}/{studentRoster.length} complete
                                    </span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.85rem', marginTop: '1rem' }}>
                                    <div style={{ padding: '0.85rem', borderRadius: 'var(--radius-md)', backgroundColor: 'white', border: '1px solid #BBF7D0' }}>
                                        <h4 style={{ margin: 0, color: '#166534' }}>Submitted</h4>
                                        {submittedStudents.length === 0 ? (
                                            <p style={{ margin: '0.65rem 0 0 0', color: 'var(--text-muted)' }}>No students have completed the quiz yet.</p>
                                        ) : (
                                            <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
                                                {submittedStudents.map(student => (
                                                    <div key={student.student_id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                                                        <span>{student.student_name}</span>
                                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                            {new Date(student.submitted_at).toLocaleString()}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ padding: '0.85rem', borderRadius: 'var(--radius-md)', backgroundColor: 'white', border: '1px solid #FECACA' }}>
                                        <h4 style={{ margin: 0, color: '#B91C1C' }}>Not Submitted</h4>
                                        {waitingStudents.length === 0 ? (
                                            <p style={{ margin: '0.65rem 0 0 0', color: 'var(--text-muted)' }}>Everyone in this class has submitted.</p>
                                        ) : (
                                            <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.75rem' }}>
                                                {waitingStudents.map(student => (
                                                    <div key={student.student_id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
                                                        <span>{student.student_name}</span>
                                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                            {Number(student.response_count || 0)} answer{Number(student.response_count || 0) === 1 ? '' : 's'} saved
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '1rem', padding: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: '#F5F3FF', border: '1px solid #DDD6FE' }}>
                            <div>
                                <strong style={{ color: '#5B21B6' }}>AI Class Analysis</strong>
                                <p style={{ color: 'var(--text-muted)', margin: '0.35rem 0 0 0' }}>
                                    {sessionAnalysis
                                        ? 'The saved report opens automatically. Run it again after newer submissions or mark changes.'
                                        : 'Summarize recurring problems across the whole quiz before releasing marks.'}
                                </p>
                                {analysisIsOutdated && (
                                    <p style={{ color: '#92400E', margin: '0.35rem 0 0 0', fontWeight: 800 }}>
                                        New responses have arrived since this report was generated.
                                    </p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={analyzeSession}
                                disabled={analysisLoading || !sessionDetails.responses.length || config?.deepseekConfigured === false}
                                title={!sessionDetails.responses.length
                                    ? 'There are no student responses to analyze yet.'
                                    : config?.deepseekConfigured === false ? 'AI analysis is unavailable until DeepSeek is configured.' : ''}
                                style={{ ...buttonStyle, backgroundColor: '#6D28D9', color: 'white', opacity: analysisLoading || !sessionDetails.responses.length || config?.deepseekConfigured === false ? 0.55 : 1 }}
                            >
                                <Sparkles size={18} />
                                {analysisLoading
                                    ? 'Analyzing...'
                                    : sessionAnalysis ? 'Run Analysis Again' : 'Analyze Whole Quiz'}
                            </button>
                        </div>
                        {sessionAnalysis && (
                            <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: '#FAFAFF', border: '1px solid #DDD6FE' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                    <h4 style={{ margin: 0, color: '#4C1D95' }}>Whole Quiz Analysis</h4>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                        {sessionAnalysis.responseCount} responses · {new Date(sessionAnalysis.generatedAt).toLocaleString()}
                                    </span>
                                </div>
                                <p style={{ marginBottom: sessionAnalysis.commonProblems?.length ? '1rem' : 0, lineHeight: 1.55 }}>{sessionAnalysis.summary}</p>
                                <LongAnswerAnalysisCharts analysis={sessionAnalysis} />
                                {sessionAnalysis.commonProblems?.length > 0 && (
                                    <>
                                        <h5 style={{ margin: '1rem 0 0.65rem 0', color: '#4C1D95' }}>Common Problems</h5>
                                        <div style={{ display: 'grid', gap: '0.65rem' }}>
                                            {sessionAnalysis.commonProblems.map((problem, index) => (
                                                <div key={`${problem.issue}-${index}`} style={{ padding: '0.85rem', borderRadius: 'var(--radius-md)', backgroundColor: 'white', border: '1px solid #EDE9FE' }}>
                                                    <strong>{problem.issue}</strong>
                                                    {problem.evidence && <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-muted)' }}>{problem.evidence}</p>}
                                                    {problem.affectedQuestions?.length > 0 && (
                                                        <p style={{ margin: '0.35rem 0 0 0', color: '#5B21B6', fontWeight: 700 }}>
                                                            Questions: {problem.affectedQuestions.join(', ')}
                                                        </p>
                                                    )}
                                                    {problem.teachingAction && (
                                                        <p style={{ margin: '0.35rem 0 0 0' }}>
                                                            <strong>Teaching action:</strong> {problem.teachingAction}
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                                {sessionAnalysis.strengths?.length > 0 && (
                                    <>
                                        <h5 style={{ margin: '1rem 0 0.4rem 0', color: '#166534' }}>Strengths</h5>
                                        <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                                            {sessionAnalysis.strengths.map((strength, index) => <li key={`${strength}-${index}`}>{strength}</li>)}
                                        </ul>
                                    </>
                                )}
                                {sessionAnalysis.priorityActions?.length > 0 && (
                                    <>
                                        <h5 style={{ margin: '1rem 0 0.4rem 0', color: '#92400E' }}>Priority Actions</h5>
                                        <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                                            {sessionAnalysis.priorityActions.map((action, index) => <li key={`${action}-${index}`}>{action}</li>)}
                                        </ul>
                                    </>
                                )}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '1rem', marginTop: '1rem' }}>
                            {reviewQuestions.map((question, index) => {
                                const isSelected = index === reviewQuestionIndex;
                                const responseCount = (responsesByQuestion[question.id] || []).length;
                                return (
                                    <button
                                        key={question.id}
                                        type="button"
                                        title={question.short_name || question.question_text}
                                        onClick={() => goToReviewQuestion(index)}
                                        style={{
                                            ...buttonStyle,
                                            padding: '0.5rem 0.7rem',
                                            backgroundColor: isSelected ? 'var(--primary)' : '#F8FAFC',
                                            color: isSelected ? 'white' : 'var(--text-main)',
                                            border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`
                                        }}
                                    >
                                        {index + 1}. {getQuestionReference(question, index)} · {responseCount}
                                    </button>
                                );
                            })}
                        </div>
                        {reviewQuestion ? (
                            <div style={{ marginTop: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                    <div>
                                        <h4 style={{ margin: '0 0 0.4rem 0' }}>
                                            {getQuestionReference(reviewQuestion, reviewQuestionIndex)}
                                            {reviewQuestion.topic ? ` · ${reviewQuestion.topic}` : ''}
                                        </h4>
                                        <p style={{ margin: 0, color: 'var(--text-muted)' }}>
                                            {reviewQuestion.answer_type || 'prose'} · Max marks: {reviewQuestion.max_marks} · {reviewQuestionResponses.length} student response{reviewQuestionResponses.length === 1 ? '' : 's'}
                                        </p>
                                    </div>
                                    <strong style={{ color: 'var(--text-muted)' }}>
                                        Question {reviewQuestionIndex + 1} of {reviewQuestions.length}
                                    </strong>
                                </div>
                                <p style={{ whiteSpace: 'pre-wrap', margin: '1rem 0 0 0', fontWeight: 700 }}>{reviewQuestion.question_text}</p>
                                {reviewQuestionResponses.length === 0 ? (
                                    <p style={{ color: 'var(--text-muted)' }}>No responses yet.</p>
                                ) : reviewQuestionResponses.map(response => (
                                    <div key={response.id} style={{ marginTop: '0.75rem', padding: '1rem', backgroundColor: '#F9FAFB', borderRadius: 'var(--radius-md)', border: '1px solid #E5E7EB' }}>
                                        <strong>{response.student_name}</strong>
                                        <p style={{ whiteSpace: 'pre-wrap', margin: '0.5rem 0' }}>{response.answer_text}</p>
                                        <div style={{ color: '#3730A3', fontWeight: 800 }}>
                                            AI: {response.ai_score ?? '-'} / {reviewQuestion.max_marks} · Confidence: {response.ai_confidence || 'unknown'}
                                        </div>
                                        <p style={{ color: 'var(--text-muted)' }}>{response.ai_feedback}</p>
                                        <div style={{ marginTop: '0.85rem', padding: '1rem', backgroundColor: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                                                <strong>Teacher Mark and Feedback</strong>
                                                {response.teacher_score !== null && response.teacher_score !== undefined && (
                                                    <span style={{ color: '#166534', fontSize: '0.9rem', fontWeight: 800 }}>Override active</span>
                                                )}
                                            </div>
                                            <label style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.35rem' }}>
                                                Mark out of {reviewQuestion.max_marks}
                                            </label>
                                            <input
                                                type="number"
                                                min="0"
                                                max={reviewQuestion.max_marks}
                                                step="1"
                                                value={reviewDrafts[response.id]?.score ?? ''}
                                                onChange={event => updateReviewDraft(response.id, 'score', event.target.value)}
                                                style={{ ...inputStyle, maxWidth: '130px', marginBottom: '0.75rem' }}
                                            />
                                            <label style={{ display: 'block', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.35rem' }}>
                                                Feedback shown to student
                                            </label>
                                            <textarea
                                                value={reviewDrafts[response.id]?.feedback ?? ''}
                                                onChange={event => updateReviewDraft(response.id, 'feedback', event.target.value)}
                                                style={{ ...inputStyle, minHeight: '95px' }}
                                            />
                                            <div style={{ display: 'flex', gap: '0.65rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => saveReview(response, reviewQuestion)}
                                                    disabled={reviewSaving[response.id]}
                                                    style={{ ...buttonStyle, backgroundColor: 'var(--primary)', color: 'white', opacity: reviewSaving[response.id] ? 0.65 : 1 }}
                                                >
                                                    <Save size={18} /> {reviewSaving[response.id] ? 'Saving...' : 'Save Override'}
                                                </button>
                                                {response.teacher_score !== null && response.teacher_score !== undefined && (
                                                    <button
                                                        type="button"
                                                        onClick={() => resetReview(response)}
                                                        disabled={reviewSaving[response.id]}
                                                        style={{ ...buttonStyle, backgroundColor: 'white', color: 'var(--text-main)', border: '1px solid var(--border)', opacity: reviewSaving[response.id] ? 0.65 : 1 }}
                                                    >
                                                        Use AI Mark
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                                    <button
                                        type="button"
                                        disabled={reviewQuestionIndex === 0}
                                        onClick={() => goToReviewQuestion(reviewQuestionIndex - 1)}
                                        style={{ ...buttonStyle, backgroundColor: reviewQuestionIndex === 0 ? '#E2E8F0' : '#EEF2FF', color: reviewQuestionIndex === 0 ? '#64748B' : '#3730A3', cursor: reviewQuestionIndex === 0 ? 'not-allowed' : 'pointer' }}
                                    >
                                        <ChevronLeft size={18} /> Previous
                                    </button>
                                    <strong style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                                        {getQuestionReference(reviewQuestion, reviewQuestionIndex)}
                                    </strong>
                                    <button
                                        type="button"
                                        disabled={reviewQuestionIndex === reviewQuestions.length - 1}
                                        onClick={() => goToReviewQuestion(reviewQuestionIndex + 1)}
                                        style={{ ...buttonStyle, backgroundColor: reviewQuestionIndex === reviewQuestions.length - 1 ? '#E2E8F0' : '#EEF2FF', color: reviewQuestionIndex === reviewQuestions.length - 1 ? '#64748B' : '#3730A3', cursor: reviewQuestionIndex === reviewQuestions.length - 1 ? 'not-allowed' : 'pointer' }}
                                    >
                                        Next <ChevronRight size={18} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <p style={{ color: 'var(--text-muted)' }}>This session does not contain any questions.</p>
                        )}
                    </div>
                </div>
            )}

            {assignmentQuiz && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50 }}>
                    <div role="dialog" aria-modal="true" aria-labelledby="long-answer-assign-title" style={{ width: 'min(720px, 100%)', maxHeight: '90vh', overflowY: 'auto', backgroundColor: 'white', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', padding: '1.25rem', borderBottom: '1px solid var(--border)' }}>
                            <div>
                                <h3 id="long-answer-assign-title" style={{ margin: 0 }}>Review Before Assigning</h3>
                                <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-muted)' }}>
                                    {assignmentQuiz.title} · {assignmentQuiz.question_count} question{assignmentQuiz.question_count === 1 ? '' : 's'}
                                </p>
                            </div>
                            <button type="button" onClick={() => setAssignmentQuiz(null)} style={{ ...buttonStyle, backgroundColor: '#F8FAFC', color: 'var(--text-main)', border: '1px solid var(--border)', padding: '0.5rem' }} aria-label="Close assignment review">
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{ padding: '1.25rem', display: 'grid', gap: '1rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(180px, 1fr)', gap: '0.75rem' }}>
                                <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 800 }}>
                                    Session name
                                    <input
                                        placeholder={assignmentQuiz.title}
                                        value={assignmentState.name || ''}
                                        onChange={e => setStartState(current => ({ ...current, [assignmentQuiz.id]: { ...current[assignmentQuiz.id], name: e.target.value } }))}
                                        style={inputStyle}
                                    />
                                </label>
                                <label style={{ display: 'grid', gap: '0.35rem', fontWeight: 800 }}>
                                    Class
                                    <select
                                        value={assignmentState.classId || ''}
                                        onChange={e => setStartState(current => ({ ...current, [assignmentQuiz.id]: { ...current[assignmentQuiz.id], classId: e.target.value } }))}
                                        style={inputStyle}
                                    >
                                        <option value="">Choose class...</option>
                                        {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
                                    </select>
                                </label>
                            </div>

                            <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid #FDE68A', backgroundColor: '#FFFBEB' }}>
                                <label style={{ display: 'grid', gap: '0.5rem', fontWeight: 800, color: '#92400E' }}>
                                    Student answers, marks and feedback
                                    <select
                                        value={assignmentState.releaseFeedback || 'held'}
                                        onChange={e => setStartState(current => ({ ...current, [assignmentQuiz.id]: { ...current[assignmentQuiz.id], releaseFeedback: e.target.value } }))}
                                        style={inputStyle}
                                    >
                                        <option value="held">Withhold marks and feedback until I release them</option>
                                        <option value="immediate">Show marks and feedback after the student submits</option>
                                    </select>
                                </label>
                                <p style={{ margin: '0.6rem 0 0 0', color: '#92400E' }}>
                                    Withholding is best for teacher review: students can complete the quiz, but marks and model-answer feedback stay hidden until you release them.
                                </p>
                            </div>

                            <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid #DDD6FE', backgroundColor: '#F5F3FF' }}>
                                <label style={{ display: 'grid', gap: '0.5rem', fontWeight: 800, color: '#5B21B6' }}>
                                    AI hint button
                                    <select
                                        value={assignmentState.allowAiHints || 'enabled'}
                                        onChange={e => setStartState(current => ({ ...current, [assignmentQuiz.id]: { ...current[assignmentQuiz.id], allowAiHints: e.target.value } }))}
                                        style={inputStyle}
                                    >
                                        <option value="enabled">Turn AI hints on for students</option>
                                        <option value="disabled">Turn AI hints off for students</option>
                                    </select>
                                </label>
                                <p style={{ margin: '0.6rem 0 0 0', color: '#5B21B6' }}>
                                    This controls whether students see the AI hint button while answering this assigned quiz.
                                </p>
                            </div>

                            <div style={{ padding: '0.85rem', borderRadius: 'var(--radius-md)', backgroundColor: '#F8FAFC', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                                Assigning to {assignmentClass?.name || 'the selected class'} will create one active long-answer session. A quiz cannot be opened twice for the same class until the existing session is closed.
                            </div>

                            {assignmentAlreadyActive && (
                                <div style={{ padding: '0.85rem', borderRadius: 'var(--radius-md)', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontWeight: 800 }}>
                                    This quiz is already active for {assignmentClass?.name || 'this class'}.
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                                <button type="button" onClick={() => setAssignmentQuiz(null)} style={{ ...buttonStyle, backgroundColor: 'white', color: 'var(--text-main)', border: '1px solid var(--border)' }}>
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={confirmAssignment}
                                    disabled={!assignmentState.classId || assignmentAlreadyActive}
                                    style={{ ...buttonStyle, backgroundColor: (!assignmentState.classId || assignmentAlreadyActive) ? '#CBD5E1' : 'var(--primary)', color: (!assignmentState.classId || assignmentAlreadyActive) ? '#475569' : 'white', cursor: (!assignmentState.classId || assignmentAlreadyActive) ? 'not-allowed' : 'pointer' }}
                                >
                                    <PlayCircle size={18} /> Assign Quiz
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
