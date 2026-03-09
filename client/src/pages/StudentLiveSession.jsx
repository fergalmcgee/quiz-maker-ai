import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';

export default function StudentLiveSession({ user }) {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const [socket, setSocket] = useState(null);
    const [session, setSession] = useState(null);
    const [quiz, setQuiz] = useState(null);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [answeredQuestionIds, setAnsweredQuestionIds] = useState(new Set());
    // Store all student answers locally for the UI (so they stay selected)
    const [localAnswers, setLocalAnswers] = useState({});
    const [sessionStatus, setSessionStatus] = useState('active');
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [reviewResults, setReviewResults] = useState(null);
    const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

    // Timer State
    const [timeRemaining, setTimeRemaining] = useState(null); // seconds
    const [timeLimit, setTimeLimit] = useState(null);
    const [isImagesLoading, setIsImagesLoading] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            try {
                const sessRes = await fetch(`http://localhost:3001/api/sessions/${sessionId}`);
                if (!sessRes.ok) throw new Error('Session not found');
                const sessData = await sessRes.json();
                setSession(sessData);
                setSessionStatus(sessData.status);

                if (sessData.status === 'completed' || sessData.is_archived === 1) {
                    setSessionStatus('completed');
                    fetchResults(sessData.id);
                } else {
                    // Check if already submitted
                    const subRes = await fetch(`http://localhost:3001/api/sessions/${sessData.id}/submission/${user.id}`);
                    const subData = await subRes.json();
                    if (subData.isSubmitted) {
                        setIsSubmitted(true);
                    } else {
                        const quizRes = await fetch(`http://localhost:3001/api/quizzes/${sessData.quiz_id}`);
                        const quizData = await quizRes.json();

                        // Intercept and shuffle questions if randomize flag is true and mode is async
                        if (sessData.mode === 'async' && sessData.randomize_questions === 1) {
                            for (let i = quizData.questions.length - 1; i > 0; i--) {
                                const j = Math.floor(Math.random() * (i + 1));
                                [quizData.questions[i], quizData.questions[j]] = [quizData.questions[j], quizData.questions[i]];
                            }
                        }

                        setQuiz(quizData);

                        // 1. Gather all unique image URLs from the quiz
                        const imageUrls = quizData.questions
                            .map(q => q.image_url)
                            .filter(url => url && url.length > 0);

                        if (imageUrls.length > 0 && sessData.mode === 'async') {
                            setIsImagesLoading(true);
                            // 2. Preload all images so the timer doesn't start while waiting for network assets
                            const loadPromises = imageUrls.map(url => {
                                return new Promise((resolve) => {
                                    const img = new Image();
                                    img.onload = () => resolve();
                                    img.onerror = () => resolve(); // Resolve even on error so we don't hang the quiz forever
                                    img.src = url;
                                });
                            });

                            await Promise.all(loadPromises);
                            setIsImagesLoading(false);
                        }

                        // 3. If Async, trigger the Start endpoint to get personal timer
                        if (sessData.mode === 'async') {
                            const startRes = await fetch(`http://localhost:3001/api/sessions/${sessData.id}/start`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ studentId: user.id })
                            });
                            const timerData = await startRes.json();

                            if (timerData.timeLimit) {
                                setTimeLimit(timerData.timeLimit);
                                const startedTime = new Date(timerData.startedAt).getTime();
                                const serverNowTime = new Date(timerData.serverNow).getTime();

                                // Calculate how many seconds have already passed
                                const secondsPassed = Math.floor((serverNowTime - startedTime) / 1000);
                                const totalSecondsAllowed = timerData.timeLimit * 60;
                                const remaining = totalSecondsAllowed - secondsPassed;

                                setTimeRemaining(remaining > 0 ? remaining : 0);
                            }
                        }
                    }
                }
            } catch (err) {
                console.error(err);
                navigate('/student');
            }
        };
        loadData();

        // 1-second countdown tick interval
        const timerInterval = setInterval(() => {
            setTimeRemaining((prev) => {
                if (prev === null) return prev;
                if (prev <= 1) {
                    clearInterval(timerInterval);
                    // Force submit when time runs out
                    confirmSubmitAsync();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        const newSocket = io('http://localhost:3001');
        setSocket(newSocket);

        newSocket.on('connect', () => {
            newSocket.emit('join_session', { sessionId, userId: user.id, username: user.username, role: 'student' });
        });

        newSocket.on('session_state', (state) => {
            setCurrentIdx(state.currentQuestionIndex || 0);
        });

        newSocket.on('question_changed', ({ newIndex }) => {
            // Only force the index if we are in a 'live' session. 
            // In 'async' mode, the student controls their own currendIdx.
            setSession(prev => {
                if (prev && prev.mode !== 'async') {
                    setCurrentIdx(newIndex);
                }
                return prev;
            });
        });

        newSocket.on('session_finished', () => {
            setSessionStatus('completed');
            fetchResults(sessionId);
        });

        newSocket.on('session_finished', () => {
            setSessionStatus('completed');
            fetchResults(sessionId);
        });

        return () => {
            newSocket.close();
            clearInterval(timerInterval);
        };
    }, [sessionId, navigate, user.id]);

    const fetchResults = async (sid) => {
        try {
            const res = await fetch(`http://localhost:3001/api/sessions/${sid}/results/${user.id}`);
            const data = await res.json();
            setReviewResults(data.results);
        } catch (e) {
            console.error('Failed to fetch results', e);
        }
    };

    const handleVote = (optionId, questionId) => {
        if (!socket) return;
        socket.emit('submit_answer', { sessionId, studentId: user.id, questionId, optionId });
        setAnsweredQuestionIds(prev => new Set([...prev, questionId]));
        setLocalAnswers(prev => ({ ...prev, [questionId]: optionId }));
    };

    const handleNextAsync = () => {
        if (currentIdx < quiz.questions.length - 1) {
            setCurrentIdx(currentIdx + 1);
        }
    };

    const handlePrevAsync = () => {
        if (currentIdx > 0) {
            setCurrentIdx(currentIdx - 1);
        }
    };

    const confirmSubmitAsync = async () => {
        try {
            await fetch(`http://localhost:3001/api/sessions/${sessionId}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId: user.id })
            });
            setIsSubmitted(true);
            setShowSubmitConfirm(false);
        } catch (e) {
            console.error('Failed to submit session', e);
        }
    };

    const handleSubmitAsync = () => {
        setShowSubmitConfirm(true);
    };

    if (sessionStatus === 'completed') {
        if (!reviewResults) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading your results...</div>;

        const totalQuestions = reviewResults.length;
        const correctAnswers = reviewResults.filter(r => r.isCorrect).length;
        const scorePercentage = Math.round((correctAnswers / totalQuestions) * 100);

        return (
            <div className="fade-in" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div style={{ textAlign: 'center', backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}>
                    <h1>Quiz Complete!</h1>
                    <div style={{ fontSize: '4rem', fontWeight: 800, color: scorePercentage >= 70 ? 'var(--primary)' : 'var(--secondary)', margin: '1rem 0' }}>
                        {scorePercentage}%
                    </div>
                    <p style={{ fontSize: '1.25rem', color: 'var(--text-muted)' }}>You got {correctAnswers} out of {totalQuestions} correct.</p>
                    <button onClick={() => navigate('/student')} style={{ marginTop: '1.5rem', padding: '0.75rem 1.5rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '1rem', cursor: 'pointer', fontWeight: 600 }}>
                        Return to Dashboard
                    </button>
                </div>

                <div>
                    <h2 style={{ marginBottom: '1.5rem' }}>Review Your Answers</h2>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {reviewResults.map((r, index) => (
                            <div key={r.questionId} style={{ backgroundColor: 'var(--surface)', padding: '1.5rem', borderRadius: 'var(--radius-md)', borderLeft: `6px solid ${r.isCorrect ? '#10B981' : '#EF4444'}` }}>
                                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>{index + 1}. {r.questionText}</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.95rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontWeight: 600, width: '100px' }}>You Answered:</span>
                                        <span style={{ color: r.isCorrect ? '#10B981' : '#EF4444', fontWeight: 500 }}>
                                            {r.studentAnswerText} {r.isCorrect ? '✅' : '❌'}
                                        </span>
                                    </div>
                                    {!r.isCorrect && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontWeight: 600, width: '100px' }}>Correct Answer:</span>
                                            <span style={{ color: '#10B981', fontWeight: 500 }}>{r.correctAnswerText}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (isSubmitted && sessionStatus !== 'completed') {
        return (
            <div className="fade-in" style={{ minHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '2rem 1rem' }}>
                <div style={{ textAlign: 'center', backgroundColor: 'var(--surface)', padding: '3rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', maxWidth: '500px' }}>
                    <h2 style={{ marginBottom: '1rem', color: 'var(--primary)' }}>Quiz Submitted!</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', lineHeight: 1.5 }}>
                        Your answers have been securely recorded. You will be able to view your results here once the teacher has officially ended this session for the class.
                    </p>
                    <button onClick={() => navigate('/student')} style={{ marginTop: '2rem', padding: '0.75rem 1.5rem', backgroundColor: 'var(--border)', color: 'var(--text-main)', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '1rem', cursor: 'pointer', fontWeight: 600 }}>
                        Return to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    if (isImagesLoading) {
        return (
            <div className="fade-in" style={{ padding: '2rem', textAlign: 'center', minHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <div style={{ backgroundColor: 'var(--surface)', padding: '3rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
                    <h2>Loading Quiz Assets...</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Downloading images before starting your timer.</p>
                </div>
            </div>
        );
    }

    if (!quiz) return <div style={{ padding: '2rem', textAlign: 'center' }}>Connecting to Live Session...</div>;

    const currentQ = quiz.questions && quiz.questions[currentIdx];

    if (!currentQ) {
        return <div style={{ padding: '2rem', textAlign: 'center' }}>Waiting for questions to proceed...</div>;
    }

    const hasAnswered = answeredQuestionIds.has(currentQ.id);

    return (
        <div className="fade-in" style={{ minHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '2rem 1rem' }}>

            {hasAnswered && session?.mode !== 'async' ? (
                <div style={{ textAlign: 'center', backgroundColor: 'var(--surface)', padding: '3rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⏱️</div>
                    <h2>Waiting for the next question...</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Hang tight, the teacher will proceed shortly.</p>
                </div>
            ) : (
                <div style={{ width: '100%', maxWidth: '800px', backgroundColor: 'var(--surface)', padding: '3rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}>
                    <div style={{ textAlign: 'center', marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                        <h3 style={{ margin: 0, color: 'var(--text-muted)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{session?.name || quiz.title}</h3>
                    </div>

                    {/* Timer HUD */}
                    {timeRemaining !== null && (
                        <div style={{
                            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem',
                            backgroundColor: timeRemaining < 60 ? '#FEF2F2' : '#F0FDF4', // Turn red if < 1 min
                            color: timeRemaining < 60 ? '#DC2626' : '#16A34A',
                            padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-full)',
                            fontSize: '1.25rem', fontWeight: 700, margin: '0 auto 2rem auto', width: 'fit-content',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                        }}>
                            ⏱️ {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')} remaining
                        </div>
                    )}

                    <h2 style={{ fontSize: '2rem', textAlign: 'center', marginBottom: '3rem' }}>{currentQ.text}</h2>

                    {currentQ.image_url && (
                        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                            <img src={currentQ.image_url} alt="Question Context" style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: 'var(--radius-sm)' }} />
                        </div>
                    )}

                    {currentQ.code_snippet && (
                        <div style={{ marginBottom: '2rem', textAlign: 'left' }}>
                            <pre style={{
                                backgroundColor: '#1E293B',
                                color: '#F8FAFC',
                                padding: '1.5rem',
                                borderRadius: 'var(--radius-md)',
                                overflowX: 'auto',
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                fontSize: '1rem',
                                lineHeight: '1.5',
                                boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)'
                            }}>
                                <code className={currentQ.code_language ? `language-${currentQ.code_language}` : ''}>
                                    {currentQ.code_snippet}
                                </code>
                            </pre>
                        </div>
                    )}

                    {currentQ.type === 'short_answer' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '2rem' }}>
                            <input
                                type="text"
                                placeholder="Type your answer here..."
                                value={localAnswers[currentQ.id] || ''}
                                onChange={(e) => {
                                    const textVal = e.target.value;
                                    setLocalAnswers(prev => ({ ...prev, [currentQ.id]: textVal }));
                                    // For short answer, we must submit the text as the optionId string so the server can record it if needed, or we adapt.
                                    // Actually, we need to send the correct optionId if it matches, or handle string answers. 
                                    // The easiest way without rewriting the DB is to find the single existing option for this question and just submit it if it matches, OR we submit the text and let the server match it.
                                    // Wait, the API `submit_answer` expects an `optionId`. Let's handle this carefully.
                                    // Let's only emit `submit_answer` on a "Submit" button click here, or we send a special text payload.
                                }}
                                style={{ width: '100%', maxWidth: '400px', padding: '1rem', fontSize: '1.25rem', borderRadius: 'var(--radius-md)', border: '2px solid var(--border)' }}
                            />
                            <button
                                onClick={() => {
                                    // We must match the typed text (case insensitive) against the single correct option.
                                    // Let's pass the text up. But `submit_answer` takes `optionId`.
                                    // If we just send the ID of the option that matches the text...
                                    const typed = (localAnswers[currentQ.id] || '').trim().toLowerCase();
                                    const correctOpt = currentQ.options[0]; // Short answers only have 1 option generated by the parser.
                                    const correctText = correctOpt.text.trim().toLowerCase();

                                    // If they got it right, send the correct option ID. If wrong, we have to send SOMETHING so they get marked wrong but it records participation.
                                    // Since we only have 1 option in the DB, if it's wrong, we might need a dummy ID. 
                                    // Actually, let's just send the text to the server and adapt `server.js` to handle text submissions, OR we inject a dummy option for wrong answers.
                                    // For now, let's send a custom payload and modify server.js slightly to accept text.
                                    socket.emit('submit_answer_text', { sessionId, studentId: user.id, questionId: currentQ.id, text: localAnswers[currentQ.id] });
                                    setAnsweredQuestionIds(prev => new Set([...prev, currentQ.id]));
                                }}
                                style={{ backgroundColor: 'var(--primary)', color: 'white', padding: '1rem 2rem', borderRadius: 'var(--radius-md)', fontSize: '1.25rem', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                            >
                                Submit Answer
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                            {currentQ.options.map((opt, i) => {
                                const colors = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6'];
                                const bgColor = colors[i % colors.length];

                                // Visual feedback if the student has selected this option in async mode
                                const isSelected = localAnswers[currentQ.id] === opt.id;

                                return (
                                    <button
                                        key={opt.id}
                                        onClick={() => handleVote(opt.id, currentQ.id)}
                                        style={{
                                            backgroundColor: isSelected ? '#1E3A8A' : bgColor, // Darker blue if selected
                                            color: 'white',
                                            border: isSelected ? '4px solid white' : 'none',
                                            padding: '2rem',
                                            borderRadius: 'var(--radius-md)',
                                            fontSize: '1.25rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            boxShadow: isSelected ? '0 0 0 4px rgba(59, 130, 246, 0.5)' : 'none',
                                            transform: isSelected ? 'scale(0.98)' : 'scale(1)',
                                            transition: 'transform 0.1s ease',
                                            wordBreak: 'break-word',
                                            whiteSpace: 'pre-wrap'
                                        }}
                                        onMouseDown={e => { if (!isSelected) e.currentTarget.style.transform = 'scale(0.95)' }}
                                        onMouseUp={e => { if (!isSelected) e.currentTarget.style.transform = 'scale(1)' }}
                                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.transform = 'scale(1)' }}
                                    >
                                        {opt.text}
                                        {isSelected && <span style={{ display: 'block', fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.8 }}>(Selected)</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Async Navigation Controls */}
                    {session?.mode === 'async' && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
                            <button
                                onClick={handlePrevAsync}
                                disabled={currentIdx === 0}
                                style={{
                                    backgroundColor: currentIdx === 0 ? '#E5E7EB' : 'var(--surface)',
                                    color: currentIdx === 0 ? '#9CA3AF' : 'var(--text-main)',
                                    border: '1px solid var(--border)',
                                    padding: '0.75rem 1.5rem',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: currentIdx === 0 ? 'not-allowed' : 'pointer',
                                    fontWeight: 600
                                }}
                            >
                                ← Previous
                            </button>

                            {currentIdx === quiz.questions.length - 1 ? (
                                <button
                                    onClick={handleSubmitAsync}
                                    style={{
                                        backgroundColor: 'var(--secondary)',
                                        color: 'white',
                                        border: 'none',
                                        padding: '0.75rem 1.5rem',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        boxShadow: 'var(--shadow-sm)'
                                    }}
                                >
                                    Submit Final Quiz ✅
                                </button>
                            ) : (
                                <button
                                    onClick={handleNextAsync}
                                    style={{
                                        backgroundColor: 'var(--primary)',
                                        color: 'white',
                                        border: 'none',
                                        padding: '0.75rem 1.5rem',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: 'pointer',
                                        fontWeight: 600,
                                        boxShadow: 'var(--shadow-sm)'
                                    }}
                                >
                                    Next →
                                </button>
                            )}
                        </div>
                    )}

                </div>
            )}

            {/* Custom Submit Confirmation Modal */}
            {showSubmitConfirm && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: 'var(--radius-lg)', maxWidth: '400px', width: '90%', boxShadow: 'var(--shadow-lg)' }}>
                        <h3 style={{ marginTop: 0, fontSize: '1.5rem', color: 'var(--text-main)' }}>Submit Quiz?</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Are you sure you want to submit your final answers? You cannot change them after submitting.</p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                            <button onClick={() => setShowSubmitConfirm(false)} style={{ padding: '0.75rem 1.5rem', backgroundColor: '#E5E7EB', color: 'var(--text-main)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                            <button onClick={confirmSubmitAsync} style={{ padding: '0.75rem 1.5rem', backgroundColor: 'var(--secondary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>Yes, Submit</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
