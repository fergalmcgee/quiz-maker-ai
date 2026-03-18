import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Users, ChevronRight, CheckCircle2, Clock, UserMinus, Lock, Unlock, Timer, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TeacherPresenter() {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const [socket, setSocket] = useState(null);
    const [session, setSession] = useState(null);
    const [quiz, setQuiz] = useState(null);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [qResults, setQResults] = useState({}); // Renamed from 'results'
    const [resultsRevealed, setResultsRevealed] = useState(false); // New state
    const [participants, setParticipants] = useState(0);
    const [participantDetails, setParticipantDetails] = useState({});
    const [answeredStudents, setAnsweredStudents] = useState(new Set());
    const [classStudents, setClassStudents] = useState([]);

    // Teacher Live Controls
    const [isLocked, setIsLocked] = useState(false);
    const [timerDuration, setTimerDuration] = useState(30);
    const [autoAdvance, setAutoAdvance] = useState(false);
    const [timerRemaining, setTimerRemaining] = useState(null);
    const [timerState, setTimerState] = useState(null);
    const [showDistribution, setShowDistribution] = useState(true);
    const [showLeaderboard, setShowLeaderboard] = useState(false);

    // Team Mode & Scoring
    const [isTeamMode, setIsTeamMode] = useState(false);
    const [teamScores, setTeamScores] = useState({ 'Red': 0, 'Blue': 0, 'Green': 0, 'Yellow': 0 });
    const [individualScores, setIndividualScores] = useState({});
    const [streaks, setStreaks] = useState({});

    // Countdown effect
    useEffect(() => {
        if (!timerState) {
            setTimerRemaining(null);
            return;
        }

        const interval = setInterval(() => {
            const rem = Math.max(0, Math.ceil((timerState.endTime - Date.now()) / 1000));
            setTimerRemaining(rem);
            if (rem <= 0) {
                clearInterval(interval);
                setTimerRemaining(null);
                setTimerState(null);
                if (timerState.autoAdvance) {
                    // Automatically trigger the handleNext from the DOM state logic below
                    document.getElementById('teacher-next-btn')?.click();
                }
            }
        }, 500);
        return () => clearInterval(interval);
    }, [timerState]);

    useEffect(() => {
        // 1. Fetch Session and Quiz info
        const loadData = async () => {
            const user = JSON.parse(localStorage.getItem('quiz_user') || '{}');
            try {
                const sessRes = await fetch(`/api/sessions/${sessionId}`, {
                    headers: {
                        'x-user-id': user.id,
                        'x-user-role': user.role
                    }
                });
                if (!sessRes.ok) throw new Error('Session not found');
                const sessData = await sessRes.json();
                setSession(sessData);

                const quizRes = await fetch(`/api/quizzes/${sessData.quiz_id}`, {
                    headers: {
                        'x-user-id': user.id,
                        'x-user-role': user.role
                    }
                });
                const quizData = await quizRes.json();
                setQuiz(quizData);

                if (sessData.class_id) {
                    try {
                        const classRes = await fetch(`/api/classes/${sessData.class_id}/students`, {
                            headers: {
                                'x-user-id': user.id,
                                'x-user-role': user.role
                            }
                        });
                        if (classRes.ok) {
                            const classData = await classRes.json();
                            setClassStudents(classData);
                        }
                    } catch (e) {
                        console.error('Error fetching class students', e);
                    }
                }
            } catch (err) {
                console.error(err);
                navigate('/teacher');
            }
        };
        loadData();

        // 2. Connect Socket
        const newSocket = io();
        setSocket(newSocket);

        newSocket.on('connect', () => {
            newSocket.emit('join_session', { sessionId, userId: 'teacher', role: 'teacher' });
        });

        newSocket.on('session_state', (state) => {
            setCurrentIdx(state.currentQuestionIndex || 0);
            setQResults(state.results || {}); // Updated to qResults
            setIsLocked(state.locked || false);
            if (state.timerStart) {
                setTimerState({ endTime: state.timerStart + (state.timerDuration * 1000), autoAdvance: false });
            }
            if (state.answeredStudents && state.answeredStudents[state.currentQuestionIndex]) {
                setAnsweredStudents(new Set(state.answeredStudents[state.currentQuestionIndex].map(String)));
            } else {
                setAnsweredStudents(new Set());
            }
            if (state.isTeamMode) {
                setIsTeamMode(true);
                if (state.teamScores) setTeamScores(state.teamScores);
            }
            if (state.individualScores) setIndividualScores(state.individualScores);
            if (state.streaks) setStreaks(state.streaks);
        });

        newSocket.on('participants_update', ({ count, details }) => {
            setParticipants(count);
            if (details) setParticipantDetails(details);
        });

        newSocket.on('results_update', ({ questionId, results: qResultsUpdate, answered }) => { // Updated to qResultsUpdate
            setQResults(prev => ({ // Updated to qResults
                ...prev,
                [questionId]: qResultsUpdate
            }));
            if (answered) {
                setAnsweredStudents(new Set(answered.map(String)));
            }
        });

        newSocket.on('team_scores_update', ({ teamScores }) => {
            setTeamScores(teamScores);
        });

        newSocket.on('student_score_update', ({ individualScores: newScores, streaks: newStreaks }) => {
            if (newScores) setIndividualScores(newScores);
            if (newStreaks) setStreaks(newStreaks);
        });

        newSocket.on('question_changed', ({ newIndex }) => {
            setAnsweredStudents(new Set());
            setIsLocked(false);
            setTimerState(null);
            setTimerRemaining(null);
            setResultsRevealed(false); // Reset results revealed on question change
        });

        newSocket.on('question_locked', ({ locked }) => {
            setIsLocked(locked);
        });

        newSocket.on('timer_started', ({ duration, startedAt, autoAdvance }) => {
            setTimerState({ endTime: startedAt + (duration * 1000), autoAdvance });
        });

        return () => newSocket.close();
    }, [sessionId, navigate]);

    const handleNext = async () => {
        if (!quiz || !socket) return;
        const nextIdx = currentIdx + 1;

        // Reset local timer UI
        setTimerState(null);
        setIsLocked(false);
        setResultsRevealed(false); // Reset results revealed on next question

        if (session?.mode !== 'async' && nextIdx < quiz.questions.length) {
            setCurrentIdx(nextIdx);
            socket.emit('next_question', { sessionId, newIndex: nextIdx });
        } else {
            // Quiz finished (or forced closed for async)
            try {
                const user = JSON.parse(localStorage.getItem('quiz_user') || '{}');
                // Tell server to mark session as complete
                await fetch(`/api/sessions/${sessionId}/finish`, { 
                    method: 'PUT',
                    headers: {
                        'x-user-id': user.id,
                        'x-user-role': user.role
                    }
                });
                // Broadcast to students that it's over
                socket.emit('finish_session', { sessionId });
                toast.success("Session Closed!");
                navigate('/teacher');
            } catch (err) {
                console.error("Error finishing session", err);
            }
        }
    };

    if (!quiz) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Quiz...</div>;

    const currentQ = quiz.questions && quiz.questions[currentIdx];

    if (!currentQ) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
                <h2>No active questions available.</h2>
                <p>This quiz might be empty or the question index is out of bounds.</p>
                <button onClick={() => navigate('/teacher')} style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, marginTop: '1rem' }}>
                    Return to Dashboard
                </button>
            </div>
        );
    }

    const currentQResults = qResults[currentQ.id] || {}; // Updated to currentQResults

    const connectedStudentIds = Object.keys(participantDetails);

    // Roster IDs
    const rosterIds = classStudents.map(s => String(s.id));

    const allExpectedIds = new Set([...rosterIds, ...connectedStudentIds]);

    const studentsAnswered = [];
    const studentsWaiting = [];
    const studentsNotJoined = [];

    allExpectedIds.forEach(id => {
        let name = participantDetails[id];
        if (!name) {
            const studentInClass = classStudents.find(s => String(s.id) === id);
            name = studentInClass ? studentInClass.username : `Student ${id}`;
        }

        if (answeredStudents.has(id)) {
            studentsAnswered.push({ id, name });
        } else if (connectedStudentIds.includes(id)) {
            studentsWaiting.push({ id, name });
        } else {
            studentsNotJoined.push({ id, name });
        }
    });

    return (
        <div className="fade-in" style={{ height: 'calc(100vh - 110px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header Area */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', padding: '0.5rem 1rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{quiz.title} {session?.mode === 'async' && <span style={{ fontSize: '0.8rem', color: 'white', backgroundColor: '#8B5CF6', padding: '0.1rem 0.4rem', borderRadius: '4px', marginLeft: '0.5rem' }}>Async Mode</span>}</h3>
                    {session?.join_code && (
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            Join Code: <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{session.join_code}</span>
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        <Users size={18} /> {participants} Students
                    </div>
                    {session?.mode === 'async' ? (
                        <button onClick={handleNext} style={{ backgroundColor: '#EF4444', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}>
                            Close Session
                        </button>
                    ) : (
                        <button id="teacher-next-btn" onClick={handleNext} style={{ backgroundColor: 'var(--secondary)', color: 'white', border: 'none', padding: '0.5rem 1.25rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600, fontSize: '1rem' }}>
                            {currentIdx < quiz.questions.length - 1 ? 'Next Question' : 'Finish Quiz'} <ChevronRight size={18} />
                        </button>
                    )}
                </div>
            </div>

            {session?.mode === 'async' ? (
                <div style={{ flex: 1, backgroundColor: 'white', padding: '2rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>📝</div>
                    <h2 style={{ fontSize: '1.75rem', textAlign: 'center', marginBottom: '0.5rem' }}>Student-Paced Session Active</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', textAlign: 'center', maxWidth: '500px' }}>
                        Students are navigating through the quiz at their own speed.
                    </p>
                </div>
            ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: '1rem' }}>

                    {/* Compact Controls Ribbon */}
                    <div style={{ backgroundColor: '#F8FAFC', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <button
                                onClick={() => socket?.emit('toggle_lock', { sessionId, locked: !isLocked })}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    backgroundColor: isLocked ? '#FEF2F2' : 'white',
                                    color: isLocked ? '#DC2626' : 'var(--text-main)',
                                    border: `1px solid ${isLocked ? '#FCA5A5' : 'var(--border)'}`,
                                    padding: '0.5rem 1rem',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: '0.9rem'
                                }}
                            >
                                {isLocked ? <Lock size={16} /> : <Unlock size={16} />}
                                {isLocked ? 'Locked' : 'Lock'}
                            </button>
                            <button
                                onClick={() => setShowDistribution(!showDistribution)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    backgroundColor: 'white',
                                    color: 'var(--text-main)',
                                    border: '1px solid var(--border)',
                                    padding: '0.5rem 1rem',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: '0.9rem'
                                }}
                            >
                                <BarChart3 size={16} color={showDistribution ? 'var(--secondary)' : 'var(--text-muted)'} />
                                {showDistribution ? 'Hide Stats' : 'Show Stats'}
                            </button>
                            <button
                                onClick={() => setResultsRevealed(!resultsRevealed)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    backgroundColor: resultsRevealed ? '#F0FDF4' : 'white',
                                    color: resultsRevealed ? '#166534' : 'var(--text-main)',
                                    border: `1px solid ${resultsRevealed ? '#BBF7D0' : 'var(--border)'}`,
                                    padding: '0.5rem 1rem',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: '0.9rem'
                                }}
                            >
                                <CheckCircle2 size={16} color={resultsRevealed ? '#10B981' : 'var(--text-muted)'} />
                                {resultsRevealed ? 'Hide Result' : 'Reveal Result'}
                            </button>
                            <button
                                onClick={() => setShowLeaderboard(!showLeaderboard)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                    backgroundColor: showLeaderboard ? '#EEF2FF' : 'white',
                                    color: showLeaderboard ? 'var(--primary)' : 'var(--text-main)',
                                    border: `1px solid ${showLeaderboard ? 'var(--primary)' : 'var(--border)'}`,
                                    padding: '0.5rem 1rem',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    fontSize: '0.9rem'
                                }}
                            >
                                <Users size={16} color={showLeaderboard ? 'var(--primary)' : 'var(--text-muted)'} />
                                {showLeaderboard ? 'Hide Leaderboard' : 'Show Leaderboard'}
                            </button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            {timerRemaining !== null ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#FEF08A', color: '#92400E', padding: '0.5rem 1rem', borderRadius: 'var(--radius-full)', fontWeight: 'bold', fontSize: '1rem', border: '1px solid #FDE047' }}>
                                    <Timer size={18} /> {timerRemaining}s
                                </div>
                            ) : (
                                <>
                                    <select
                                        value={timerDuration}
                                        onChange={(e) => setTimerDuration(e.target.value)}
                                        style={{ padding: '0.4rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', fontSize: '0.85rem' }}
                                    >
                                        <option value="15">15s</option>
                                        <option value="30">30s</option>
                                        <option value="60">60s</option>
                                        <option value="120">120s</option>
                                    </select>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 500 }}>
                                        <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} style={{ width: '14px', height: '14px' }} />
                                        Auto
                                    </label>
                                    <button
                                        onClick={() => socket?.emit('start_question_timer', { sessionId, durationSeconds: parseInt(timerDuration), autoAdvance })}
                                        style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}
                                    >
                                        Start Timer
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Main Dashboard Content */}
                    <div style={{ flex: 1, display: 'flex', gap: '1rem', overflow: 'hidden' }}>

                        {/* Left Column: Question Preview */}
                        <div style={{ flex: '0 0 40%', backgroundColor: 'white', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: '1.5rem', display: 'flex', flexDirection: 'column', overflowY: 'auto', border: '1px solid var(--border)' }}>
                            <div style={{ marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase' }}>
                                Question {currentIdx + 1} of {quiz.questions.length}
                            </div>

                            <h2 style={{ fontSize: '1.75rem', marginBottom: '1.5rem', lineHeight: 1.3 }}>{currentQ.text}</h2>

                            {currentQ.image_url && (
                                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                                    <img src={currentQ.image_url} alt="Question Context" style={{ maxWidth: '100%', maxHeight: '250px', objectFit: 'contain', borderRadius: 'var(--radius-sm)' }} />
                                </div>
                            )}

                            {currentQ.code_snippet && (
                                <div style={{ width: '100%', marginBottom: '1.5rem' }}>
                                    <pre style={{
                                        backgroundColor: '#1E293B', color: '#F8FAFC', padding: '1rem', borderRadius: 'var(--radius-md)', overflowX: 'auto', fontSize: '0.9rem', lineHeight: '1.4'
                                    }}>
                                        <code>{currentQ.code_snippet}</code>
                                    </pre>
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: 'auto' }}>
                                {currentQ.options?.map((opt, i) => {
                                    const isCorrect = opt.is_correct === 1;
                                    const shouldHighlight = resultsRevealed && isCorrect;
                                    return (
                                        <div key={opt.id} style={{
                                            padding: '0.75rem 1rem',
                                            borderRadius: 'var(--radius-md)',
                                            border: `1px solid ${shouldHighlight ? '#BBF7D0' : 'var(--border)'}`,
                                            backgroundColor: shouldHighlight ? '#F0FDF4' : '#F8FAFC',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            transition: 'all 0.3s ease'
                                        }}>
                                            <div style={{
                                                width: '24px', height: '24px', borderRadius: '50%',
                                                backgroundColor: shouldHighlight ? '#10B981' : '#CBD5E1',
                                                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700
                                            }}>
                                                {i + 1}
                                            </div>
                                            <span style={{
                                                fontSize: '1rem',
                                                fontWeight: shouldHighlight ? 600 : 400,
                                                color: shouldHighlight ? '#166534' : 'var(--text-main)'
                                            }}>{opt.text}</span>
                                            {shouldHighlight && <CheckCircle2 size={16} color="#10B981" style={{ marginLeft: 'auto' }} />}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Right Column: Session Data */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', paddingRight: '0.5rem' }}>

                            {/* Distribution & Leaderboards Row */}
                            <div style={{ display: 'grid', gridTemplateColumns: showDistribution ? '1fr 1fr' : '1fr', gap: '1rem' }}>

                                {showDistribution && (
                                    <div style={{ backgroundColor: '#F0FDF4', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid #BBF7D0' }}>
                                        <h4 style={{ color: '#166534', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '1rem' }}>
                                            <BarChart3 size={18} /> Live Distribution ({studentsAnswered.length})
                                        </h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            {currentQ.options?.map((opt, i) => {
                                                const count = currentQResults[opt.id] || 0; // Updated to currentQResults
                                                const total = studentsAnswered.length || 1;
                                                const percent = Math.round((count / total) * 100);
                                                const isCorrect = opt.is_correct === 1;
                                                const shouldHighlight = resultsRevealed && isCorrect;
                                                return (
                                                    <div key={opt.id}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem', fontSize: '0.85rem' }}>
                                                            <span style={{ fontWeight: 600 }}>Option {i + 1}</span>
                                                            <span>{count} ({percent}%)</span>
                                                        </div>
                                                        <div style={{ width: '100%', height: '12px', backgroundColor: '#E5E7EB', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                                                            <div style={{ width: `${percent}%`, height: '100%', backgroundColor: shouldHighlight ? '#10B981' : 'var(--primary)', transition: 'width 0.3s' }}></div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {isTeamMode ? (
                                    <div style={{ backgroundColor: '#FAF5FF', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid #E9D5FF' }}>
                                        <h4 style={{ color: '#6B21A8', margin: '0 0 1rem 0', fontSize: '1rem' }}>🏆 Team Leaderboard</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            {Object.entries(teamScores).sort((a, b) => b[1] - a[1]).map(([team, score]) => (
                                                <div key={team} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', padding: '0.4rem 0.75rem', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #F3E8FF' }}>
                                                    <span style={{ fontWeight: 700 }}>{team}</span>
                                                    <span style={{ fontSize: '1.1rem', fontWeight: 800 }}>{score}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ backgroundColor: '#F0FDF4', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid #BBF7D0' }}>
                                        <h4 style={{ color: '#166534', margin: '0 0 1rem 0', fontSize: '1rem' }}>⭐ Top Students</h4>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {Object.entries(individualScores).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, score], idx) => (
                                                <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem', padding: '0.4rem 0.75rem', backgroundColor: 'white', borderRadius: '4px', border: '1px solid #DCFCE7' }}>
                                                    <span style={{ fontWeight: 600 }}>{idx === 0 && '🥇 '}{idx === 1 && '🥈 '}{idx === 2 && '🥉 '}{participantDetails[id] || 'Student'}</span>
                                                    <span style={{ fontWeight: 700 }}>{score}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {showLeaderboard && (
                                <div className="fade-in" style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--primary)', boxShadow: 'var(--shadow-md)', marginTop: '0.5rem' }}>
                                    <h3 style={{ margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
                                        <BarChart3 size={20} /> Overall Leaderboard (All Participants)
                                    </h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                                        {Object.entries(individualScores).sort((a, b) => b[1] - a[1]).map(([id, score], idx) => (
                                            <div key={id} style={{
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                padding: '0.75rem', borderRadius: 'var(--radius-md)',
                                                backgroundColor: idx < 3 ? '#F0FDF4' : '#F8FAFC',
                                                border: `1px solid ${idx < 3 ? '#BBF7D0' : '#E2E8F0'}`
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span style={{ fontWeight: 800, color: 'var(--text-muted)', width: '24px' }}>{idx + 1}.</span>
                                                    <span style={{ fontWeight: 600 }}>{participantDetails[id] || 'Student'}</span>
                                                </div>
                                                <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{score}</span>
                                            </div>
                                        ))}
                                    </div>
                                    {Object.keys(individualScores).length === 0 && (
                                        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>No scores recorded yet.</p>
                                    )}
                                </div>
                            )}

                            {/* Participant Status Lists */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div style={{ backgroundColor: '#FFFBEB', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid #FDE68A' }}>
                                    <h4 style={{ color: '#92400E', margin: '0 0 0.75rem 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        <Clock size={16} /> Waiting ({studentsWaiting.length})
                                    </h4>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        {studentsWaiting.map(s => (
                                            <span key={s.id} style={{ fontSize: '0.8rem', backgroundColor: '#FEF3C7', padding: '0.2rem 0.6rem', borderRadius: '4px', border: '1px solid #FDE68A' }}>{s.name}</span>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ backgroundColor: '#F3F4F6', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid #D1D5DB' }}>
                                    <h4 style={{ color: '#374151', margin: '0 0 0.75rem 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        <UserMinus size={16} /> Missing ({studentsNotJoined.length})
                                    </h4>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                                        {studentsNotJoined.map(s => (
                                            <span key={s.id} style={{ fontSize: '0.8rem', backgroundColor: '#E5E7EB', padding: '0.2rem 0.6rem', borderRadius: '4px', border: '1px solid #D1D5DB' }}>{s.name}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
