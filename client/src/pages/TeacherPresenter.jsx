import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Users, ChevronRight, CheckCircle2, Clock, UserMinus } from 'lucide-react';

export default function TeacherPresenter() {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const [socket, setSocket] = useState(null);
    const [session, setSession] = useState(null);
    const [quiz, setQuiz] = useState(null);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [results, setResults] = useState({});
    const [participants, setParticipants] = useState(0);
    const [participantDetails, setParticipantDetails] = useState({});
    const [answeredStudents, setAnsweredStudents] = useState(new Set());
    const [classStudents, setClassStudents] = useState([]);

    useEffect(() => {
        // 1. Fetch Session and Quiz info
        const loadData = async () => {
            try {
                const sessRes = await fetch(`http://localhost:3001/api/sessions/${sessionId}`);
                if (!sessRes.ok) throw new Error('Session not found');
                const sessData = await sessRes.json();
                setSession(sessData);

                const quizRes = await fetch(`http://localhost:3001/api/quizzes/${sessData.quiz_id}`);
                const quizData = await quizRes.json();
                setQuiz(quizData);

                if (sessData.class_id) {
                    try {
                        const classRes = await fetch(`http://localhost:3001/api/classes/${sessData.class_id}/students`);
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
        const newSocket = io('http://localhost:3001');
        setSocket(newSocket);

        newSocket.on('connect', () => {
            newSocket.emit('join_session', { sessionId, userId: 'teacher', role: 'teacher' });
        });

        newSocket.on('session_state', (state) => {
            setCurrentIdx(state.currentQuestionIndex || 0);
            setResults(state.results || {});
            if (state.answeredStudents && state.answeredStudents[state.currentQuestionIndex]) {
                setAnsweredStudents(new Set(state.answeredStudents[state.currentQuestionIndex].map(String)));
            } else {
                setAnsweredStudents(new Set());
            }
        });

        newSocket.on('participants_update', ({ count, details }) => {
            setParticipants(count);
            if (details) setParticipantDetails(details);
        });

        newSocket.on('results_update', ({ questionId, results: qResults, answered }) => {
            setResults(prev => ({
                ...prev,
                [questionId]: qResults
            }));
            if (answered) {
                setAnsweredStudents(new Set(answered.map(String)));
            }
        });

        newSocket.on('question_changed', ({ newIndex }) => {
            setAnsweredStudents(new Set());
        });

        return () => newSocket.close();
    }, [sessionId, navigate]);

    const handleNext = async () => {
        if (!quiz || !socket) return;
        const nextIdx = currentIdx + 1;
        if (session?.mode !== 'async' && nextIdx < quiz.questions.length) {
            setCurrentIdx(nextIdx);
            socket.emit('next_question', { sessionId, newIndex: nextIdx });
        } else {
            // Quiz finished (or forced closed for async)
            try {
                // Tell server to mark session as complete
                await fetch(`http://localhost:3001/api/sessions/${sessionId}/finish`, { method: 'PUT' });
                // Broadcast to students that it's over
                socket.emit('finish_session', { sessionId });
                alert("Session Closed!");
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

    const qResults = results[currentQ.id] || {};

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
        <div className="fade-in" style={{ minHeight: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2>Live Session: {quiz.title} {session?.mode === 'async' && <span style={{ fontSize: '1rem', color: 'white', backgroundColor: '#8B5CF6', padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-md)', marginLeft: '1rem' }}>Async Mode</span>}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                        <Users size={20} /> {participants} Students Joined
                    </div>
                    {session?.mode === 'async' ? (
                        <button onClick={handleNext} style={{ backgroundColor: '#EF4444', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                            Close Session
                        </button>
                    ) : (
                        <button onClick={handleNext} style={{ backgroundColor: 'var(--secondary)', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                            {currentIdx < quiz.questions.length - 1 ? 'Next Question' : 'Finish Quiz'} <ChevronRight size={18} />
                        </button>
                    )}
                </div>
            </div>

            {session?.mode === 'async' ? (
                <div style={{ flex: 1, backgroundColor: 'white', padding: '3rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📝</div>
                    <h1 style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '1rem' }}>Student-Paced Session Active</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1.25rem', textAlign: 'center', maxWidth: '600px' }}>
                        Students are navigating through the quiz at their own speed.
                        You can close the session at any time using the button in the top right.
                    </p>
                </div>
            ) : (
                <div style={{ flex: 1, backgroundColor: 'white', padding: '3rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto' }}>
                    {currentQ.image_url && (
                        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                            <img src={currentQ.image_url} alt="Question Context" style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain', borderRadius: 'var(--radius-sm)' }} />
                        </div>
                    )}

                    {currentQ.code_snippet && (
                        <div style={{ width: '100%', maxWidth: '800px', marginBottom: '2rem', textAlign: 'left' }}>
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

                    <h1 style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '3rem' }}>{currentQ.text}</h1>

                    <div style={{ width: '100%', maxWidth: '1000px', flex: 1, minHeight: 0 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1.5rem' }}>
                            {/* Answered Column */}
                            <div style={{ backgroundColor: '#F0FDF4', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid #BBF7D0', height: 'fit-content' }}>
                                <h3 style={{ color: '#166534', marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <CheckCircle2 size={24} /> Answered ({studentsAnswered.length})
                                </h3>
                                {studentsAnswered.length === 0 ? (
                                    <p style={{ color: '#15803D', fontStyle: 'italic', margin: 0 }}>Waiting for first answer...</p>
                                ) : (
                                    <ul style={{ listStyleType: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {studentsAnswered.map(student => (
                                            <li key={student.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#166534', fontWeight: 600, fontSize: '1.1rem', backgroundColor: '#DCFCE7', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
                                                {student.name}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            {/* Waiting Column */}
                            <div style={{ backgroundColor: '#FFFBEB', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid #FDE68A', height: 'fit-content' }}>
                                <h3 style={{ color: '#92400E', marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Clock size={24} /> Waiting ({studentsWaiting.length})
                                </h3>
                                {studentsWaiting.length === 0 ? (
                                    <p style={{ color: '#B45309', fontStyle: 'italic', margin: 0 }}>All connected students have answered!</p>
                                ) : (
                                    <ul style={{ listStyleType: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {studentsWaiting.map(student => (
                                            <li key={student.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#92400E', fontWeight: 500, fontSize: '1.1rem', backgroundColor: '#FEF3C7', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
                                                {student.name}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            {/* Not Joined Column */}
                            <div style={{ backgroundColor: '#F3F4F6', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid #D1D5DB', height: 'fit-content' }}>
                                <h3 style={{ color: '#374151', marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <UserMinus size={24} /> Not Joined ({studentsNotJoined.length})
                                </h3>
                                {studentsNotJoined.length === 0 ? (
                                    <p style={{ color: '#4B5563', fontStyle: 'italic', margin: 0 }}>All students have joined!</p>
                                ) : (
                                    <ul style={{ listStyleType: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {studentsNotJoined.map(student => (
                                            <li key={student.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#4B5563', fontWeight: 500, fontSize: '1.1rem', backgroundColor: '#E5E7EB', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)' }}>
                                                {student.name}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
