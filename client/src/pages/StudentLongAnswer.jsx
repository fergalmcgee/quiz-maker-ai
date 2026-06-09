import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle, ChevronLeft, ChevronRight, Lightbulb, Loader2, Send } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

const inputStyle = {
    width: '100%',
    padding: '0.85rem',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    fontSize: '1rem',
    lineHeight: 1.5
};

const buttonStyle = {
    border: 'none',
    borderRadius: 'var(--radius-md)',
    padding: '0.75rem 1rem',
    fontWeight: 800,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.45rem',
    position: 'relative',
    overflow: 'hidden'
};

function parseList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function hasTeacherOverride(response) {
    return response?.teacher_score !== null && response?.teacher_score !== undefined;
}

function displayedScore(response) {
    return hasTeacherOverride(response) ? response.teacher_score : response?.ai_score;
}

function displayedFeedback(response) {
    return hasTeacherOverride(response) ? response.teacher_feedback : response?.ai_feedback;
}

function getStudentQuestionLabel(question, index) {
    const shortName = String(question.short_name || '').trim();
    const parts = shortName.split(' - ').map(part => part.trim()).filter(Boolean);

    if (parts.length >= 3 && /^Q\d/i.test(parts[1])) {
        return {
            paper: parts[0],
            reference: parts[1],
            topic: question.topic || parts.slice(2).join(' - ')
        };
    }

    return {
        paper: '',
        reference: `Q${index + 1}`,
        topic: question.topic || shortName || 'General'
    };
}

async function parseResponseBody(response) {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return { error: text };
    }
}

export default function StudentLongAnswer({ user }) {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const [details, setDetails] = useState(null);
    const [answers, setAnswers] = useState({});
    const [hints, setHints] = useState({});
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState({});
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

    useEffect(() => {
        setAnswers({});
        setHints({});
        setErrors({});
        fetchDetails({ preserveDrafts: false });
    }, [sessionId]);

    useEffect(() => {
        if (!details?.questions?.length) return;
        setCurrentQuestionIndex(index => Math.min(index, details.questions.length - 1));
    }, [details?.questions?.length]);

    useEffect(() => {
        if (!details?.submission || details.feedbackReleased) return;
        const interval = setInterval(() => {
            fetchDetails({ preserveDrafts: false });
        }, 15000);
        return () => clearInterval(interval);
    }, [details?.submission, details?.feedbackReleased, sessionId]);

    const fetchDetails = async ({ preserveDrafts = true } = {}) => {
        const res = await fetch(`/api/long-answer/sessions/${sessionId}`);
        if (res.ok) {
            const data = await res.json();
            setDetails(data);
            const savedAnswers = {};
            for (const response of data.responses || []) {
                savedAnswers[response.question_id] = response.answer_text || '';
            }
            setAnswers(current => preserveDrafts
                ? { ...savedAnswers, ...current }
                : savedAnswers);
        } else {
            toast.error('Could not load long-answer session');
        }
    };

    const responsesByQuestion = useMemo(() => {
        const grouped = {};
        for (const response of details?.responses || []) {
            grouped[response.question_id] = response;
        }
        return grouped;
    }, [details]);

    const totalScore = useMemo(() => {
        let score = 0;
        let max = 0;
        for (const question of details?.questions || []) {
            max += Number(question.max_marks || 0);
            const response = responsesByQuestion[question.id];
            const scoreForQuestion = displayedScore(response);
            if (scoreForQuestion !== null && scoreForQuestion !== undefined) {
                score += Number(scoreForQuestion || 0);
            }
        }
        return { score, max };
    }, [details, responsesByQuestion]);
    const hasCompletedQuiz = !!details?.submission;
    const feedbackReleased = details?.feedbackReleased === true;
    const aiHintsAllowed = details?.session?.allow_ai_hints !== 0;
    const canWork = details?.session?.status === 'active' && !hasCompletedQuiz;
    const answeredQuestionCount = (details?.questions || [])
        .filter(question => !!responsesByQuestion[question.id])
        .length;
    const allQuestionsAnswered = (details?.questions?.length || 0) > 0
        && details.questions.every(question => !!responsesByQuestion[question.id]);
    const answerSubmissionInProgress = Object.entries(busy).some(([key, value]) => key.startsWith('submit-') && value);
    const questionNavigationGroups = useMemo(() => {
        const groups = [];
        const groupsByPaper = new Map();

        for (const [index, question] of (details?.questions || []).entries()) {
            const label = getStudentQuestionLabel(question, index);
            const paper = label.paper || 'Questions';
            let group = groupsByPaper.get(paper);
            if (!group) {
                group = { paper, questions: [] };
                groupsByPaper.set(paper, group);
                groups.push(group);
            }
            group.questions.push({ question, index, label });
        }

        return groups;
    }, [details]);

    const setAnswer = (questionId, value) => {
        setAnswers(current => ({ ...current, [questionId]: value }));
        setErrors(current => ({ ...current, [questionId]: null }));
    };

    const blockExternalAnswerInput = (event) => {
        event.preventDefault();
        toast.error('Pasting is disabled for long-answer questions. Please type your answer.');
    };

    const getQuestionAnswerType = (question) => {
        const explicitType = String(question.answer_type || '').toLowerCase();
        if (['pseudocode', 'sql'].includes(explicitType)) return explicitType;

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
    };

    const isCodeAnswer = (question) => ['pseudocode', 'sql'].includes(getQuestionAnswerType(question));

    const getAnswerStyle = (question) => ({
        ...inputStyle,
        minHeight: isCodeAnswer(question) ? '220px' : '160px',
        marginTop: '0.75rem',
        fontFamily: isCodeAnswer(question) ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' : undefined,
        fontSize: isCodeAnswer(question) ? '0.95rem' : '1rem',
        lineHeight: isCodeAnswer(question) ? 1.6 : 1.5,
        tabSize: 4,
        backgroundColor: isCodeAnswer(question) ? '#0F172A' : 'white',
        color: isCodeAnswer(question) ? '#E5E7EB' : 'var(--text-main)',
        caretColor: isCodeAnswer(question) ? 'white' : 'auto',
        whiteSpace: 'pre',
        overflowWrap: 'normal',
        overflowX: 'auto'
    });

    const handleAnswerKeyDown = (event, questionId) => {
        if (event.key !== 'Tab') return;

        event.preventDefault();
        const textarea = event.currentTarget;
        const value = textarea.value;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const indent = '    ';
        const hasSelection = start !== end;
        const selectionContainsLineBreak = value.slice(start, end).includes('\n');

        if (event.shiftKey) {
            const lineStart = value.lastIndexOf('\n', start - 1) + 1;
            const beforeLine = value.slice(0, lineStart);
            const selectedText = value.slice(lineStart, end);
            const afterSelection = value.slice(end);
            const lines = selectedText.split('\n');
            let removedBeforeStart = 0;
            let removedTotal = 0;
            const unindented = lines.map((line, index) => {
                const removeCount = line.startsWith(indent)
                    ? indent.length
                    : Math.min(line.match(/^ */)?.[0]?.length || 0, indent.length);
                if (index === 0) removedBeforeStart = Math.min(removeCount, Math.max(0, start - lineStart));
                removedTotal += removeCount;
                return line.slice(removeCount);
            }).join('\n');
            const nextValue = beforeLine + unindented + afterSelection;
            setAnswer(questionId, nextValue);
            requestAnimationFrame(() => {
                textarea.selectionStart = Math.max(lineStart, start - removedBeforeStart);
                textarea.selectionEnd = Math.max(textarea.selectionStart, end - removedTotal);
            });
            return;
        }

        if (hasSelection && selectionContainsLineBreak) {
            const lineStart = value.lastIndexOf('\n', start - 1) + 1;
            const beforeLine = value.slice(0, lineStart);
            const selectedText = value.slice(lineStart, end);
            const afterSelection = value.slice(end);
            const lines = selectedText.split('\n');
            const indented = lines.map(line => `${indent}${line}`).join('\n');
            const nextValue = beforeLine + indented + afterSelection;
            setAnswer(questionId, nextValue);
            requestAnimationFrame(() => {
                textarea.selectionStart = start + indent.length;
                textarea.selectionEnd = end + (indent.length * lines.length);
            });
            return;
        }

        const nextValue = `${value.slice(0, start)}${indent}${value.slice(end)}`;
        setAnswer(questionId, nextValue);
        requestAnimationFrame(() => {
            textarea.selectionStart = textarea.selectionEnd = start + indent.length;
        });
    };

    const requestHint = async (questionId) => {
        setBusy(current => ({ ...current, [`hint-${questionId}`]: true }));
        try {
            const res = await fetch(`/api/long-answer/sessions/${sessionId}/questions/${questionId}/help`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answerText: answers[questionId] || '' })
            });
            const data = await parseResponseBody(res);
            if (!res.ok) throw new Error(data.error || 'Could not connect to AI help. Please try again.');
            setHints(current => ({ ...current, [questionId]: data }));
        } catch (error) {
            setErrors(current => ({ ...current, [questionId]: error.message }));
            toast.error(error.message);
        } finally {
            setBusy(current => ({ ...current, [`hint-${questionId}`]: false }));
        }
    };

    const submitAnswer = async (questionId) => {
        const answerText = (answers[questionId] || '').trim();
        if (!answerText) {
            toast.error('Write an answer first');
            return;
        }

        setBusy(current => ({ ...current, [`submit-${questionId}`]: true }));
        try {
            const res = await fetch(`/api/long-answer/sessions/${sessionId}/questions/${questionId}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answerText })
            });
            const data = await parseResponseBody(res);
            if (!res.ok) throw new Error(data.error || 'Your answer could not be submitted. Please try again.');
            setErrors(current => ({ ...current, [questionId]: null }));
            toast.success(data.markingPending ? 'Answer submitted' : 'Answer marked and submitted');
            await fetchDetails();
        } catch (error) {
            setErrors(current => ({ ...current, [questionId]: error.message }));
            toast.error(error.message);
        } finally {
            setBusy(current => ({ ...current, [`submit-${questionId}`]: false }));
        }
    };

    const completeQuiz = async () => {
        if (answerSubmissionInProgress) {
            toast.error('Wait for your answer to finish saving before submitting the quiz.');
            return;
        }
        if (!window.confirm('Finish and submit this quiz? You will not be able to change your answers afterwards.')) {
            return;
        }

        setBusy(current => ({ ...current, complete: true }));
        try {
            const res = await fetch(`/api/long-answer/sessions/${sessionId}/complete`, {
                method: 'POST'
            });
            const data = await parseResponseBody(res);
            if (!res.ok) throw new Error(data.error || 'Could not submit the completed quiz.');
            await fetchDetails({ preserveDrafts: false });
            toast.success('Quiz finished and submitted');
        } catch (error) {
            toast.error(error.message);
        } finally {
            setBusy(current => ({ ...current, complete: false }));
        }
    };

    const goToQuestion = (index) => {
        if (!details?.questions?.length) return;
        setCurrentQuestionIndex(Math.max(0, Math.min(index, details.questions.length - 1)));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (!details) {
        return (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                Loading long-answer task...
            </div>
        );
    }

    return (
        <div className="fade-in">
            <button onClick={() => navigate('/student')} style={{ ...buttonStyle, backgroundColor: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border)', marginBottom: '1rem' }}>
                <ArrowLeft size={18} /> Back
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div>
                    <h2 style={{ margin: 0 }}>{details.session.name || details.quiz.title}</h2>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                        {details.quiz.subject} · {details.quiz.level || 'General'} · {details.quiz.topic || 'General'}
                    </p>
                </div>
                <div style={{ backgroundColor: '#EEF2FF', color: '#3730A3', padding: '0.7rem 1rem', borderRadius: 'var(--radius-md)', fontWeight: 900 }}>
                    {feedbackReleased
                        ? `${totalScore.score} / ${totalScore.max}`
                        : hasCompletedQuiz
                            ? 'Submitted'
                            : `${answeredQuestionCount} / ${details.questions.length} answered`}
                </div>
            </div>

            <div style={{ display: 'grid', gap: '0.85rem', marginBottom: '1rem' }}>
                {questionNavigationGroups.map(group => (
                    <div key={group.paper}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 900, marginBottom: '0.4rem' }}>
                            {group.paper}
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {group.questions.map(({ question, index, label }) => {
                                const response = responsesByQuestion[question.id];
                                const isCurrent = index === currentQuestionIndex;
                                return (
                                    <button
                                        key={question.id}
                                        type="button"
                                        title={question.short_name || label.reference}
                                        onClick={() => goToQuestion(index)}
                                        style={{
                                            ...buttonStyle,
                                            padding: '0.55rem 0.75rem',
                                            backgroundColor: isCurrent ? 'var(--primary)' : response ? '#ECFDF5' : 'white',
                                            color: isCurrent ? 'white' : response ? '#047857' : 'var(--text-main)',
                                            border: `1px solid ${isCurrent ? 'var(--primary)' : response ? '#A7F3D0' : 'var(--border)'}`
                                        }}
                                    >
                                        {response && <CheckCircle size={15} />} {label.reference}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {hasCompletedQuiz && (
                <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 'var(--radius-md)', color: '#065F46', fontWeight: 800 }}>
                    <CheckCircle size={18} style={{ verticalAlign: 'middle', marginRight: '0.45rem' }} />
                    {feedbackReleased
                        ? 'Quiz submitted. Your answers are locked and your feedback is available below.'
                        : 'Quiz submitted. Your answers are locked. Your teacher will release marks and feedback after review.'}
                </div>
            )}

            {canWork && allQuestionsAnswered && (
                <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ color: '#3730A3' }}>All questions have been answered. Submit your finished quiz when you are ready.</strong>
                    <button
                        type="button"
                        onClick={completeQuiz}
                        disabled={busy.complete || answerSubmissionInProgress}
                        style={{ ...buttonStyle, backgroundColor: '#166534', color: 'white', opacity: busy.complete || answerSubmissionInProgress ? 0.7 : 1 }}
                    >
                        <CheckCircle size={18} /> {busy.complete ? 'Submitting...' : answerSubmissionInProgress ? 'Saving Answer...' : 'Finish Quiz'}
                    </button>
                </div>
            )}

            <div style={{ display: 'grid', gap: '1.25rem' }}>
                {details.questions.map((question, index) => {
                    if (index !== currentQuestionIndex) return null;
                    const answerType = getQuestionAnswerType(question);
                    const response = responsesByQuestion[question.id];
                    const isSubmitted = !!response;
                    const hint = hints[question.id];
                    const questionLabel = getStudentQuestionLabel(question, index);
                    return (
                        <div key={question.id} style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{questionLabel.reference}</h3>
                                    <p style={{ margin: '0.3rem 0 0 0', color: 'var(--text-muted)', fontWeight: 700 }}>
                                        {questionLabel.paper ? `${questionLabel.paper} · ` : ''}{questionLabel.topic}
                                    </p>
                                </div>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 800 }}>
                                    {answerType.replace('_', ' ')} · {question.max_marks} marks
                                </span>
                            </div>
                            <p style={{ whiteSpace: 'pre-wrap', marginTop: '0.75rem' }}>{question.question_text}</p>

                            {(question.student_context || question.context_image_url) && (
                                <div style={{ marginTop: '0.85rem', padding: '1rem', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 'var(--radius-md)' }}>
                                    {question.context_image_url && (
                                        <img
                                            src={question.context_image_url}
                                            alt="Question context"
                                            style={{ maxWidth: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginBottom: question.student_context ? '0.85rem' : 0 }}
                                        />
                                    )}
                                    {question.student_context && (
                                        <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-main)', lineHeight: 1.55 }}>
                                            {question.student_context}
                                        </div>
                                    )}
                                </div>
                            )}

                            <textarea
                                value={answers[question.id] || ''}
                                onChange={event => setAnswer(question.id, event.target.value)}
                                onKeyDown={event => isCodeAnswer(question) && handleAnswerKeyDown(event, question.id)}
                                onPaste={blockExternalAnswerInput}
                                onDrop={blockExternalAnswerInput}
                                placeholder={answerType === 'sql' ? 'Write your SQL here...' : answerType === 'pseudocode' ? 'Write your pseudocode or code here...' : 'Write your answer here...'}
                                spellCheck={!isCodeAnswer(question)}
                                style={getAnswerStyle(question)}
                                disabled={!canWork}
                            />

                            {errors[question.id] && (
                                <div style={{ marginTop: '0.75rem', padding: '1rem', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius-md)', color: '#991B1B', fontWeight: 700 }}>
                                    {errors[question.id]}
                                </div>
                            )}

                            {hint && (
                                <div style={{ marginTop: '0.75rem', padding: '1rem', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 'var(--radius-md)', color: '#92400E' }}>
                                    <strong>Hint:</strong> {hint.hint}
                                    {hint.nextStep && <p style={{ margin: '0.4rem 0 0 0' }}>{hint.nextStep}</p>}
                                </div>
                            )}

                            {isSubmitted && !hasCompletedQuiz && (
                                <div style={{ marginTop: '0.75rem', padding: '1rem', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 'var(--radius-md)', color: '#166534', fontWeight: 800 }}>
                                    <CheckCircle size={18} style={{ verticalAlign: 'middle', marginRight: '0.45rem' }} />
                                    Answer submitted. You can revise and resubmit it until you finish the quiz.
                                </div>
                            )}

                            {isSubmitted && feedbackReleased && (
                                <div style={{ marginTop: '0.75rem', padding: '1rem', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 'var(--radius-md)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#166534', fontWeight: 900 }}>
                                        <CheckCircle size={18} /> {displayedScore(response) ?? 'Pending'} / {question.max_marks}
                                        {hasTeacherOverride(response) && <span style={{ fontSize: '0.85rem' }}>(reviewed by teacher)</span>}
                                    </div>
                                    <p style={{ margin: '0.5rem 0', color: '#14532D' }}>{displayedFeedback(response)}</p>
                                    {!hasTeacherOverride(response) && parseList(response.ai_improvements).length > 0 && (
                                        <ul style={{ margin: '0.5rem 0 0 1.25rem', color: '#166534' }}>
                                            {parseList(response.ai_improvements).map((item, itemIndex) => (
                                                <li key={itemIndex}>{item}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}

                            {canWork && (
                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                                    {aiHintsAllowed && (
                                        <button
                                            onClick={() => requestHint(question.id)}
                                            disabled={busy[`hint-${question.id}`]}
                                            className={busy[`hint-${question.id}`] ? 'long-answer-loading-button' : ''}
                                            style={{ ...buttonStyle, backgroundColor: '#FFFBEB', color: '#92400E', opacity: busy[`hint-${question.id}`] ? 0.7 : 1 }}
                                        >
                                            <span className="long-answer-button-content">
                                                {busy[`hint-${question.id}`] ? <Loader2 size={18} /> : <Lightbulb size={18} />} {busy[`hint-${question.id}`] ? 'Getting Help...' : 'Help Answer This'}
                                            </span>
                                        </button>
                                    )}
                                    <button
                                        onClick={() => submitAnswer(question.id)}
                                        disabled={busy[`submit-${question.id}`]}
                                        className={busy[`submit-${question.id}`] ? 'long-answer-loading-button long-answer-loading-button-primary' : ''}
                                        style={{ ...buttonStyle, backgroundColor: 'var(--primary)', color: 'white', opacity: busy[`submit-${question.id}`] ? 0.7 : 1 }}
                                    >
                                        <span className="long-answer-button-content">
                                            {busy[`submit-${question.id}`] ? <Loader2 size={18} /> : <Send size={18} />} {busy[`submit-${question.id}`] ? 'Submitting Answer...' : 'Submit Answer'}
                                        </span>
                                    </button>
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                                <button
                                    type="button"
                                    onClick={() => goToQuestion(index - 1)}
                                    disabled={index === 0}
                                    style={{ ...buttonStyle, backgroundColor: 'white', color: 'var(--text-main)', border: '1px solid var(--border)', opacity: index === 0 ? 0.45 : 1 }}
                                >
                                    <ChevronLeft size={18} /> Previous
                                </button>
                                <span style={{ alignSelf: 'center', color: 'var(--text-muted)', fontWeight: 800 }}>
                                    {index + 1} of {details.questions.length}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => goToQuestion(index + 1)}
                                    disabled={index === details.questions.length - 1}
                                    style={{ ...buttonStyle, backgroundColor: 'white', color: 'var(--text-main)', border: '1px solid var(--border)', opacity: index === details.questions.length - 1 ? 0.45 : 1 }}
                                >
                                    Next <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
