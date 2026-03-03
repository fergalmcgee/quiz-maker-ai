import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Bar } from 'react-chartjs-2';
import {
    Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend
} from 'chart.js';
import { Users, ChevronRight } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function TeacherPresenter() {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const [socket, setSocket] = useState(null);
    const [session, setSession] = useState(null);
    const [quiz, setQuiz] = useState(null);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [results, setResults] = useState({});
    const [participants, setParticipants] = useState(0);

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
        });

        newSocket.on('participants_update', ({ count }) => {
            setParticipants(count);
        });

        newSocket.on('results_update', ({ questionId, results: qResults }) => {
            setResults(prev => ({
                ...prev,
                [questionId]: qResults
            }));
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

    // Build Chart Data
    const chartData = {
        labels: currentQ.options.map(o => o.text),
        datasets: [{
            label: 'Responses',
            data: currentQ.options.map(o => qResults[o.id] || 0),
            backgroundColor: 'rgba(79, 70, 229, 0.8)', // var(--primary)
            borderRadius: 8,
        }]
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1 } }
        },
        plugins: {
            legend: { display: false }
        }
    };

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

                    <h1 style={{ fontSize: '2.5rem', textAlign: 'center', marginBottom: '3rem' }}>{currentQ.text}</h1>

                    <div style={{ width: '80%', flex: 1, minHeight: 0 }}>
                        {currentQ.type === 'short_answer' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '600px', margin: '0 auto', overflowY: 'auto' }}>
                                {currentQ.options.filter(opt => qResults[opt.id] > 0).map(opt => (
                                    <div key={opt.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', backgroundColor: '#F9FAFB', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 500, color: 'var(--text-main)' }}>"{opt.text}"</div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--primary)', backgroundColor: '#EEF2FF', padding: '0.25rem 1rem', borderRadius: 'var(--radius-FULL)' }}>
                                            {qResults[opt.id]}
                                        </div>
                                    </div>
                                ))}
                                {currentQ.options.filter(opt => qResults[opt.id] > 0).length === 0 && (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2rem' }}>Waiting for responses...</div>
                                )}
                            </div>
                        ) : (
                            <Bar data={chartData} options={chartOptions} />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
