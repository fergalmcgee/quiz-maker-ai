import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Flag, CheckCircle2, AlertCircle, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

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
    const [totalPoints, setTotalPoints] = useState(0);
    const [finalBadges, setFinalBadges] = useState([]);
    const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

    // In-Quiz Experience State
    const [flaggedQuestions, setFlaggedQuestions] = useState(new Set());
    const [showAutosave, setShowAutosave] = useState(false);

    // Live Session Controls
    const [isLocked, setIsLocked] = useState(false);
    const [questionTimerState, setQuestionTimerState] = useState(null);
    const [questionTimerRemaining, setQuestionTimerRemaining] = useState(null);
    const [myTeam, setMyTeam] = useState(null);
    const [teamScores, setTeamScores] = useState(null);

    // Question Timer Effect
    useEffect(() => {
        if (!questionTimerState) {
            setQuestionTimerRemaining(null);
            return;
        }
        const interval = setInterval(() => {
            const rem = Math.max(0, Math.ceil((questionTimerState.endTime - Date.now()) / 1000));
            setQuestionTimerRemaining(rem);
            if (rem <= 0) {
                clearInterval(interval);
                setQuestionTimerRemaining(null);
                setQuestionTimerState(null);
                // Preemptively lock if timer hits 0 (server will also send lock, but this is immediate)
                setIsLocked(true);
            }
        }, 500);
        return () => clearInterval(interval);
    }, [questionTimerState]);

    // Timer State (Async Quiz-wide)
    const [timeRemaining, setTimeRemaining] = useState(null); // seconds
    const [timeLimit, setTimeLimit] = useState(null);
    const [isImagesLoading, setIsImagesLoading] = useState(false);

    // Scoring & Badges
    const [myScore, setMyScore] = useState(0);
    const [myStreak, setMyStreak] = useState(0);

    useEffect(() => {
        const loadData = async () => {
            try {
                const sessRes = await fetch(`/api/sessions/${sessionId}`);
                if (!sessRes.ok) throw new Error('Session not found');
                const sessData = await sessRes.json();
                setSession(sessData);
                setSessionStatus(sessData.status);

                if (sessData.status === 'completed' || sessData.is_archived === 1) {
                    setSessionStatus('completed');
                    fetchResults(sessData.id);
                } else {
                    // Check if already submitted
                    const subRes = await fetch(`/api/sessions/${sessData.id}/submission/${user.id}`);
                    const subData = await subRes.json();
                    if (subData.isSubmitted) {
                        setIsSubmitted(true);
                        if (sessData.mode === 'async') {
                            setSessionStatus('completed');
                            fetchResults(sessData.id);
                        }
                    } else {
                        const quizRes = await fetch(`/api/quizzes/${sessData.quiz_id}`);
                        const quizData = await quizRes.json();

                        // Intercept and shuffle questions if randomize flag is true and mode is async
                        if (sessData.mode === 'async' && sessData.randomize_questions === 1) {
                            for (let i = quizData.questions.length - 1; i > 0; i--) {
                                const j = Math.floor(Math.random() * (i + 1));
                                [quizData.questions[i], quizData.questions[j]] = [quizData.questions[j], quizData.questions[i]];
                            }
                        }

                        // Shuffle options within each question if shuffle flag is true
                        if (sessData.shuffle_options === 1) {
                            quizData.questions.forEach(q => {
                                if (q.options && q.options.length > 0) {
                                    for (let i = q.options.length - 1; i > 0; i--) {
                                        const j = Math.floor(Math.random() * (i + 1));
                                        [q.options[i], q.options[j]] = [q.options[j], q.options[i]];
                                    }
                                }
                            });
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
                            const startRes = await fetch(`/api/sessions/${sessData.id}/start`, {
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

        const newSocket = io();
        setSocket(newSocket);

        newSocket.on('connect', () => {
            newSocket.emit('join_session', { sessionId, userId: user.id, username: user.username, role: 'student' });
        });

        newSocket.on('session_state', (state) => {
            setCurrentIdx(state.currentQuestionIndex || 0);
            setIsLocked(state.locked || false);
            if (state.timerStart) {
                setQuestionTimerState({ endTime: state.timerStart + (state.timerDuration * 1000) });
            }
            if (state.teamScores) {
                setTeamScores(state.teamScores);
            }
            if (state.individualScores && state.individualScores[user.id]) {
                setMyScore(state.individualScores[user.id]);
            }
            if (state.streaks && state.streaks[user.id]) {
                setMyStreak(state.streaks[user.id]);
            }
        });

        newSocket.on('assigned_team', ({ team }) => {
            setMyTeam(team);
        });

        newSocket.on('team_scores_update', ({ teamScores }) => {
            setTeamScores(teamScores);
        });

        newSocket.on('student_score_update', ({ studentId, individualScores, streaks }) => {
            if (studentId === user.id) {
                if (individualScores && individualScores[user.id] !== undefined) setMyScore(individualScores[user.id]);
                if (streaks && streaks[user.id] !== undefined) setMyStreak(streaks[user.id]);
            }
        });

        newSocket.on('badge_earned', ({ studentId, badge, streak }) => {
            if (studentId === user.id) {
                let msg = `You earned a badge: ${badge}!`;
                if (streak) msg = `You earned a badge: ${badge} (${streak} in a row!)`;
                toast(msg, {
                    icon: '🏅',
                    style: {
                        borderRadius: '10px',
                        background: '#333',
                        color: '#fff',
                    },
                });
            }
        });

        newSocket.on('question_changed', ({ newIndex }) => {
            // Only force the index if we are in a 'live' session. 
            // In 'async' mode, the student controls their own currendIdx.
            setSession(prev => {
                if (prev && prev.mode !== 'async') {
                    setCurrentIdx(newIndex);
                    setIsLocked(false);
                    setQuestionTimerState(null);
                    setQuestionTimerRemaining(null);
                }
                return prev;
            });
        });

        newSocket.on('question_locked', ({ locked }) => {
            setIsLocked(locked);
        });

        newSocket.on('timer_started', ({ duration, startedAt }) => {
            setQuestionTimerState({ endTime: startedAt + (duration * 1000) });
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

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (sessionStatus === 'completed' || isSubmitted || !quiz || isLocked) return;
            const currentQ = quiz.questions && quiz.questions[currentIdx];
            if (!currentQ || currentQ.type === 'short_answer') return;

            // Check if user is typing in an input
            if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

            const keyInfo = parseInt(e.key, 10);
            if (!isNaN(keyInfo) && keyInfo >= 1 && keyInfo <= currentQ.options.length) {
                const optIndex = keyInfo - 1;
                handleVote(currentQ.options[optIndex].id, currentQ.id);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [sessionStatus, isSubmitted, quiz, currentIdx, localAnswers, isLocked]);

    const fetchResults = async (sid) => {
        try {
            const res = await fetch(`/api/sessions/${sid}/results/${user.id}`);
            const data = await res.json();
            setReviewResults(data.results);
            setTotalPoints(data.totalPoints || 0);
            setFinalBadges(data.badges || []);
        } catch (e) {
            console.error('Failed to fetch results', e);
        }
    };

    const handleVote = (optionId, questionId) => {
        if (!socket || isLocked) return;
        socket.emit('submit_answer', { sessionId, studentId: user.id, questionId, optionId });
        setAnsweredQuestionIds(prev => new Set([...prev, questionId]));
        setLocalAnswers(prev => ({ ...prev, [questionId]: optionId }));

        setShowAutosave(true);
        setTimeout(() => setShowAutosave(false), 2000);
    };

    const toggleFlag = () => {
        if (!quiz || !quiz.questions[currentIdx]) return;
        const qId = quiz.questions[currentIdx].id;
        setFlaggedQuestions(prev => {
            const next = new Set(prev);
            if (next.has(qId)) next.delete(qId);
            else next.add(qId);
            return next;
        });
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
            await fetch(`/api/sessions/${sessionId}/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId: user.id })
            });
            setIsSubmitted(true);
            setShowSubmitConfirm(false);

            // Instantly show results if this is an async session
            if (session?.mode === 'async') {
                setSessionStatus('completed');
                fetchResults(sessionId);
            }
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
                <div style={{ textAlign: 'center', backgroundColor: 'var(--surface)', padding: '2.5rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🎉</div>
                    <h1 style={{ marginBottom: '0.5rem' }}>Quiz Complete!</h1>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Great job, {user.username}!</p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2.5rem' }}>
                        <div style={{ backgroundColor: '#F0FDF4', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid #BBF7D0' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: '#166534', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Final Score</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#10B981' }}>{scorePercentage}%</div>
                            <div style={{ fontSize: '0.9rem', color: '#166534' }}>{correctAnswers} / {totalQuestions} correct</div>
                        </div>
                        <div style={{ backgroundColor: '#EFF6FF', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid #BFDBFE' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: '#1E40AF', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Total Points</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#2563EB' }}>{totalPoints.toLocaleString()}</div>
                            <div style={{ fontSize: '0.9rem', color: '#1E40AF' }}>Points awarded for speed & streaks</div>
                        </div>
                    </div>

                    {finalBadges.length > 0 && (
                        <div style={{ marginBottom: '2.5rem' }}>
                            <h3 style={{ fontSize: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '1rem', letterSpacing: '0.05em' }}>Badges Achieved</h3>
                            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.75rem' }}>
                                {finalBadges.map((badge, i) => (
                                    <div key={i} style={{ backgroundColor: '#FEF9C3', color: '#854D0E', padding: '0.6rem 1.25rem', borderRadius: 'var(--radius-full)', fontWeight: 700, border: '1px solid #FDE047', boxShadow: '0 2px 4px rgba(234,179,8,0.1)', animation: 'pop 0.3s ease-out' }}>
                                        {badge}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <button onClick={() => navigate('/student')} style={{ padding: '1rem 2rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '1.1rem', cursor: 'pointer', fontWeight: 700, boxShadow: 'var(--shadow-md)', transition: 'transform 0.2s' }}>
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
                                    {r.explanation && (
                                        <div style={{ marginTop: '0.5rem', padding: '0.75rem', backgroundColor: '#F8FAFC', borderLeft: '3px solid var(--primary)', borderRadius: '0 4px 4px 0', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                                            <strong>Explanation:</strong> {r.explanation}
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
            <div className="fade-in" style={{ minHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                <div className="responsive-padding" style={{ textAlign: 'center', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', maxWidth: '500px' }}>
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
                <div className="responsive-padding" style={{ backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
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
        <div className="fade-in" style={{ minHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>

            {hasAnswered && session?.mode !== 'async' ? (
                <div className="responsive-padding" style={{ textAlign: 'center', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⏱️</div>
                    <h2>Waiting for the next question...</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Hang tight, the teacher will proceed shortly.</p>
                </div>
            ) : (
                <div className="responsive-padding" style={{ width: '100%', maxWidth: '800px', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', position: 'relative' }}>

                    {/* Autosave Badge */}
                    <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#ECFDF5', color: '#059669', padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-full)', fontSize: '0.8rem', fontWeight: 600, opacity: showAutosave ? 1 : 0, transition: 'opacity 0.3s ease', pointerEvents: 'none' }}>
                        <CheckCircle2 size={16} /> Saved just now
                    </div>

                    <div style={{ textAlign: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
                        <h3 style={{ margin: 0, color: 'var(--text-muted)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{session?.name || quiz.title}</h3>
                        {myTeam && (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '0.75rem' }}>
                                <div style={{
                                    padding: '0.4rem 1rem',
                                    borderRadius: 'var(--radius-full)',
                                    backgroundColor: myTeam === 'Red' ? '#FCA5A5' : myTeam === 'Blue' ? '#BFDBFE' : myTeam === 'Green' ? '#A7F3D0' : myTeam === 'Yellow' ? '#FEF08A' : 'var(--border)',
                                    color: myTeam === 'Red' ? '#991B1B' : myTeam === 'Blue' ? '#1E40AF' : myTeam === 'Green' ? '#065F46' : myTeam === 'Yellow' ? '#854D0E' : 'var(--text-main)',
                                    fontWeight: 'bold',
                                    fontSize: '0.9rem',
                                    border: `1px solid ${myTeam === 'Red' ? '#EF4444' : myTeam === 'Blue' ? '#3B82F6' : myTeam === 'Green' ? '#10B981' : myTeam === 'Yellow' ? '#EAB308' : 'var(--border)'}`
                                }}>
                                    {myTeam} Team
                                </div>
                                {teamScores && teamScores[myTeam] !== undefined && (
                                    <div style={{ fontSize: '1.25rem', fontWeight: 800 }}>
                                        Team Score: {teamScores[myTeam]}
                                    </div>
                                )}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: myTeam ? '0.75rem' : '0' }}>
                            {myScore > 0 && (
                                <div style={{ backgroundColor: '#FEF9C3', color: '#854D0E', padding: '0.4rem 1rem', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: '1rem', border: '1px solid #EAB308', boxShadow: '0 2px 4px rgba(234,179,8,0.2)' }}>
                                    ⭐ {myScore} pts
                                </div>
                            )}
                            {myStreak >= 3 && (
                                <div style={{ backgroundColor: '#FEF2F2', color: '#B91C1C', padding: '0.4rem 1rem', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: '1rem', border: '1px solid #FCA5A5', boxShadow: '0 2px 4px rgba(239,68,68,0.2)', animation: 'pulse 1.5s infinite' }}>
                                    🔥 Streak x{myStreak}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Question Navigator */}
                    {session?.mode === 'async' && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
                            {quiz.questions.map((q, idx) => {
                                const isCurrent = currentIdx === idx;
                                const isAnswered = answeredQuestionIds.has(q.id);
                                const isFlagged = flaggedQuestions.has(q.id);

                                let bgColor = 'var(--surface)';
                                let borderColor = 'var(--border)';
                                let textColor = 'var(--text-muted)';

                                if (isCurrent) {
                                    bgColor = 'var(--primary)';
                                    borderColor = 'var(--primary)';
                                    textColor = 'white';
                                } else if (isAnswered) {
                                    bgColor = '#ECFDF5';
                                    borderColor = '#10B981';
                                    textColor = '#10B981';
                                }

                                return (
                                    <button
                                        key={q.id}
                                        onClick={() => setCurrentIdx(idx)}
                                        style={{
                                            position: 'relative', width: '32px', height: '32px', borderRadius: '50%', backgroundColor: bgColor, border: `2px solid ${borderColor}`, color: textColor, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s'
                                        }}
                                        title={`Question ${idx + 1}`}
                                    >
                                        {isAnswered && !isCurrent ? <CheckCircle2 size={16} strokeWidth={3} /> : (idx + 1)}
                                        {isFlagged && (
                                            <div style={{ position: 'absolute', top: '-6px', right: '-6px', backgroundColor: '#FEF08A', color: '#CA8A04', borderRadius: '50%', padding: '2px', border: '1px solid #CA8A04' }}>
                                                <Flag size={10} fill="currentColor" />
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Async Timer HUD */}
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

                    {/* Live Timer HUD */}
                    {session?.mode !== 'async' && questionTimerRemaining !== null && (
                        <div style={{
                            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem',
                            backgroundColor: questionTimerRemaining <= 5 ? '#FEF2F2' : '#EFF6FF',
                            color: questionTimerRemaining <= 5 ? '#DC2626' : '#2563EB',
                            padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-full)',
                            fontSize: '1.25rem', fontWeight: 700, margin: '0 auto 2rem auto', width: 'fit-content',
                            border: `2px solid ${questionTimerRemaining <= 5 ? '#FCA5A5' : '#BFDBFE'}`,
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                        }}>
                            ⏱️ {questionTimerRemaining}s remaining
                        </div>
                    )}

                    <h2 style={{ fontSize: '2rem', textAlign: 'center', marginBottom: '1rem' }}>{currentQ.text}</h2>

                    {isLocked && (
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#DC2626', padding: '0.5rem 1rem', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>
                                <Lock size={16} /> Question Locked by Teacher
                            </div>
                        </div>
                    )}

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
                                disabled={isLocked}
                                onChange={(e) => {
                                    if (isLocked) return;
                                    const textVal = e.target.value;
                                    setLocalAnswers(prev => ({ ...prev, [currentQ.id]: textVal }));
                                }}
                                style={{ width: '100%', maxWidth: '400px', padding: '1rem', fontSize: '1.25rem', borderRadius: 'var(--radius-md)', border: '2px solid var(--border)', backgroundColor: isLocked ? '#F3F4F6' : 'white', cursor: isLocked ? 'not-allowed' : 'text' }}
                            />
                            <button
                                onClick={() => {
                                    if (isLocked) return;
                                    socket.emit('submit_answer_text', { sessionId, studentId: user.id, questionId: currentQ.id, text: localAnswers[currentQ.id] });
                                    setAnsweredQuestionIds(prev => new Set([...prev, currentQ.id]));
                                    setShowAutosave(true);
                                    setTimeout(() => setShowAutosave(false), 2000);
                                }}
                                disabled={isLocked}
                                style={{ backgroundColor: isLocked ? '#9CA3AF' : 'var(--primary)', color: 'white', padding: '1rem 2rem', borderRadius: 'var(--radius-md)', fontSize: '1.25rem', border: 'none', cursor: isLocked ? 'not-allowed' : 'pointer', fontWeight: 600 }}
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
                                        disabled={isLocked}
                                        style={{
                                            backgroundColor: isLocked ? '#9CA3AF' : (isSelected ? '#1E3A8A' : bgColor),
                                            color: 'white',
                                            border: isSelected ? '4px solid white' : 'none',
                                            padding: '2rem',
                                            borderRadius: 'var(--radius-md)',
                                            fontSize: '1.25rem',
                                            fontWeight: 600,
                                            cursor: isLocked ? 'not-allowed' : 'pointer',
                                            boxShadow: isSelected ? '0 0 0 4px rgba(59, 130, 246, 0.5)' : 'none',
                                            transform: isSelected ? 'scale(0.98)' : 'scale(1)',
                                            transition: 'transform 0.1s ease, background-color 0.2s',
                                            wordBreak: 'break-word',
                                            whiteSpace: 'pre-wrap',
                                            opacity: isLocked && !isSelected ? 0.7 : 1
                                        }}
                                        onMouseDown={e => { if (!isSelected && !isLocked) e.currentTarget.style.transform = 'scale(0.95)' }}
                                        onMouseUp={e => { if (!isSelected && !isLocked) e.currentTarget.style.transform = 'scale(1)' }}
                                        onMouseLeave={e => { if (!isSelected && !isLocked) e.currentTarget.style.transform = 'scale(1)' }}
                                    >
                                        {opt.text}
                                        {isSelected && <span style={{ display: 'block', fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.8 }}>(Selected)</span>}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Async Navigation Controls */}
                    {session?.mode === 'async' ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)' }}>
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

                            <button
                                onClick={toggleFlag}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    backgroundColor: flaggedQuestions.has(currentQ.id) ? '#FEF08A' : 'transparent',
                                    color: flaggedQuestions.has(currentQ.id) ? '#CA8A04' : 'var(--text-muted)',
                                    border: `1px solid ${flaggedQuestions.has(currentQ.id) ? '#FDE047' : 'var(--border)'}`,
                                    padding: '0.75rem 1.5rem',
                                    borderRadius: 'var(--radius-full)',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Flag size={18} fill={flaggedQuestions.has(currentQ.id) ? 'currentColor' : 'none'} />
                                {flaggedQuestions.has(currentQ.id) ? 'Flagged' : 'Flag for Review'}
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
                    ) : (
                        <p style={{ textAlign: 'center', marginTop: '2rem', color: 'var(--text-muted)' }}>Use keyboard shortcuts <strong>1, 2, 3, 4</strong> to answer.</p>
                    )}

                </div>
            )}

            {/* Custom Submit Confirmation Modal */}
            {showSubmitConfirm && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: 'var(--radius-lg)', maxWidth: '450px', width: '90%', boxShadow: 'var(--shadow-lg)' }}>
                        <h3 style={{ marginTop: 0, fontSize: '1.5rem', color: 'var(--text-main)', marginBottom: '1rem' }}>Submit Quiz?</h3>

                        {(quiz.questions.length > answeredQuestionIds.size || flaggedQuestions.size > 0) ? (
                            <div style={{ backgroundColor: '#FEF2F2', borderLeft: '4px solid #DC2626', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#DC2626', fontWeight: 600, marginBottom: '0.5rem' }}>
                                    <AlertCircle size={18} /> Wait! Before you submit:
                                </div>
                                <ul style={{ margin: 0, paddingLeft: '1.5rem', color: '#991B1B', fontSize: '0.9rem' }}>
                                    {quiz.questions.length > answeredQuestionIds.size && (
                                        <li>You have <strong>{quiz.questions.length - answeredQuestionIds.size} unanswered</strong> question(s).</li>
                                    )}
                                    {flaggedQuestions.size > 0 && (
                                        <li>You have <strong>{flaggedQuestions.size} flagged</strong> question(s) for review.</li>
                                    )}
                                </ul>
                            </div>
                        ) : (
                            <div style={{ backgroundColor: '#ECFDF5', color: '#065F46', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <CheckCircle2 size={18} /> All questions answered!
                            </div>
                        )}

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
