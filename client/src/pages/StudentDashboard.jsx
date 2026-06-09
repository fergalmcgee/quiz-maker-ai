import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayCircle, CheckCircle, Key, ArrowRight, Trophy, Clock, ClipboardList, Lightbulb, BookOpenText } from 'lucide-react';
import toast from 'react-hot-toast';

export default function StudentDashboard({ user }) {
    const [sessions, setSessions] = useState([]);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [passwordMessage, setPasswordMessage] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [isJoining, setIsJoining] = useState(false);
    const [classFilter, setClassFilter] = useState('All');
    const [practiceScores, setPracticeScores] = useState({}); // { quiz_id: best_score }
    const [exitTickets, setExitTickets] = useState([]);
    const [quickChecks, setQuickChecks] = useState([]);
    const [longAnswerSessions, setLongAnswerSessions] = useState([]);
    const navigate = useNavigate();
    const previousActiveCount = useRef(0);

    useEffect(() => {
        fetchSessions();
        fetchPracticeScores();
        fetchExitTickets();
        fetchQuickChecks();
        fetchLongAnswerSessions();
        const interval = setInterval(() => {
            fetchSessions(true);
            fetchPracticeScores();
            fetchExitTickets();
            fetchQuickChecks();
            fetchLongAnswerSessions();
        }, 15000); // 15 seconds
        return () => clearInterval(interval);
    }, []);

    const fetchExitTickets = async () => {
        try {
            const res = await fetch(`/api/exit-tickets/student/${user.id}`, {
                headers: { 'x-user-id': user.id, 'x-user-role': user.role }
            });
            if (res.ok) {
                setExitTickets(await res.json());
            }
        } catch (e) {
            console.error('Error fetching exit tickets:', e);
        }
    };

    const fetchQuickChecks = async () => {
        try {
            const res = await fetch(`/api/quick-checks/student/${user.id}`, {
                headers: { 'x-user-id': user.id, 'x-user-role': user.role }
            });
            if (res.ok) {
                setQuickChecks(await res.json());
            }
        } catch (e) {
            console.error('Error fetching quick checks:', e);
        }
    };

    const fetchLongAnswerSessions = async () => {
        try {
            const res = await fetch(`/api/long-answer/sessions/student/${user.id}`);
            if (res.ok) {
                setLongAnswerSessions(await res.json());
            }
        } catch (e) {
            console.error('Error fetching long-answer sessions:', e);
        }
    };

    const fetchPracticeScores = async () => {
        try {
            const res = await fetch('/api/student/practice-scores', {
                headers: { 'x-user-id': user.id, 'x-user-role': user.role }
            });
            if (res.ok) {
                const data = await res.json();
                const scoreMap = {};
                data.forEach(s => {
                    scoreMap[s.quiz_id] = s.best_score;
                });
                setPracticeScores(scoreMap);
            }
        } catch (e) {
            console.error('Error fetching practice scores:', e);
        }
    };

    const fetchSessions = async (isAutoRefresh = false) => {
        try {
            const res = await fetch(`/api/sessions/student/${user.id}`, {
                headers: {
                    'x-user-id': user.id,
                    'x-user-role': user.role
                }
            });
            if (res.ok) {
                const data = await res.json();
                setSessions(data);

                if (isAutoRefresh) {
                    const activeCount = data.filter(s => s.status === 'active' && s.is_archived === 0).length;
                    if (activeCount > previousActiveCount.current) {
                        toast.success('New assigned session available!', { icon: '🔔' });
                    }
                    previousActiveCount.current = activeCount;
                } else {
                    previousActiveCount.current = data.filter(s => s.status === 'active' && s.is_archived === 0).length;
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    const groupSessionsByClass = (sessionList) => {
        const filtered = classFilter === 'All' 
            ? sessionList 
            : sessionList.filter(s => (s.class_name || 'No Class Assigned') === classFilter);

        return filtered.reduce((groups, session) => {
            const className = session.class_name || 'No Class Assigned';
            if (!groups[className]) groups[className] = [];
            groups[className].push(session);
            return groups;
        }, {});
    };

    const activeSessions = sessions.filter(s => s.status === 'active' && s.is_archived === 0 && s.is_submitted !== 1);
    const pastSessions = sessions.filter(s => (s.status === 'completed' || s.is_archived === 1 || s.is_submitted === 1) && (s.response_count > 0 || s.is_submitted === 1));
    const missedSessions = sessions.filter(s => (s.status === 'completed' || s.is_archived === 1) && s.response_count === 0 && s.is_submitted !== 1);

    const activeGroups = groupSessionsByClass(activeSessions);
    const pastGroups = groupSessionsByClass(pastSessions);
    const missedGroups = groupSessionsByClass(missedSessions);

    const availableClasses = [...new Set(sessions.map(s => s.class_name || 'No Class Assigned'))];
    const pendingExitTickets = exitTickets.filter(ticket => ticket.is_submitted !== 1);
    const submittedExitTickets = exitTickets.filter(ticket => ticket.is_submitted === 1);
    const pendingQuickChecks = quickChecks.filter(check => check.is_submitted !== 1);
    const submittedQuickChecks = quickChecks.filter(check => check.is_submitted === 1);
    const activeLongAnswers = longAnswerSessions.filter(session => session.status === 'active' && session.is_submitted !== 1);
    const completedLongAnswers = longAnswerSessions.filter(session => session.status !== 'active' || session.is_submitted === 1);
    const getRetakeLabel = (session) => session.retake_in_progress
        ? 'Continue Retake'
        : 'Retake Quiz';
    const getRetakeCountdown = (session) => {
        if (!session.retake_eligible_at || session.retake_available === 1 || session.retake_in_progress === 1) {
            return null;
        }

        const remainingMs = new Date(session.retake_eligible_at).getTime() - Date.now();
        if (remainingMs <= 0) return 'Retake available soon';

        const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
        const hours = Math.ceil((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

        if (days > 0) return `Retake available in ${days} day${days === 1 ? '' : 's'}`;
        return `Retake available in ${hours} hour${hours === 1 ? '' : 's'}`;
    };
    const getImprovementLabel = (session) => {
        if (session.official_score_improvement === null || session.official_score_improvement === undefined) return null;
        if (session.official_score_improvement > 0) return `+${session.official_score_improvement}`;
        return String(session.official_score_improvement);
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`/api/users/${user.id}/password`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                    'x-user-role': user.role
                },
                body: JSON.stringify({ newPassword })
            });
            if (res.ok) {
                setPasswordMessage('Password updated successfully!');
                setTimeout(() => {
                    setShowPasswordModal(false);
                    setNewPassword('');
                    setPasswordMessage('');
                }, 2000);
            } else {
                const data = await res.json();
                setPasswordMessage(data.error || 'Failed to update password.');
            }
        } catch (e) {
            setPasswordMessage('Error updating password.');
        }
    };

    const handleJoinSession = async (e) => {
        e.preventDefault();
        if (!joinCode.trim()) return;
        setIsJoining(true);
        try {
            const res = await fetch(`/api/sessions/join/${joinCode.trim()}`);
            const data = await res.json();
            if (res.ok && data.id) {
                navigate(`/student/live/${data.id}`);
            } else {
                toast.error(data.error || 'Invalid session code');
            }
        } catch (error) {
            console.error('Error joining session', error);
            toast.error('Network error while joining session');
        } finally {
            setIsJoining(false);
        }
    };

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2 style={{ marginTop: 0 }}>Student Dashboard</h2>
                    <p style={{ color: 'var(--text-muted)' }}>
                        Welcome, {user.username}{user.form_class ? ` from class ${user.form_class}` : ''}. Here are your assigned tasks:
                    </p>
                </div>
                <button
                    onClick={() => setShowPasswordModal(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', backgroundColor: 'white', cursor: 'pointer', fontWeight: 600, color: 'var(--text-main)' }}
                >
                    <Key size={16} /> Change Password
                </button>
            </div>

            <div style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
                <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>Join a Live Session by Code</h3>
                <form onSubmit={handleJoinSession} style={{ display: 'flex', gap: '1rem' }}>
                    <input
                        type="text"
                        placeholder="e.g. ABCD-1234"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        style={{ flex: 1, padding: '0.75rem 1rem', fontSize: '1.1rem', borderRadius: 'var(--radius-md)', border: '2px solid var(--border)', fontFamily: 'monospace', textTransform: 'uppercase' }}
                        maxLength={9}
                        required
                    />
                    <button
                        type="submit"
                        disabled={isJoining}
                        style={{ backgroundColor: 'var(--primary)', color: 'white', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', border: 'none', cursor: isJoining ? 'not-allowed' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        {isJoining ? 'Joining...' : 'Join'} <ArrowRight size={18} />
                    </button>
                </form>
            </div>

            {availableClasses.length > 0 && (
                <div style={{ marginTop: '2rem', display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                    {['All', ...availableClasses].map(clsName => (
                        <button
                            key={clsName}
                            onClick={() => setClassFilter(clsName)}
                            style={{
                                padding: '0.4rem 1rem',
                                borderRadius: '2rem',
                                border: `1px solid ${classFilter === clsName ? 'var(--primary)' : 'var(--border)'}`,
                                backgroundColor: classFilter === clsName ? 'var(--primary)' : 'white',
                                color: classFilter === clsName ? 'white' : 'var(--text-main)',
                                whiteSpace: 'nowrap',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                fontWeight: 600
                            }}
                        >
                            {clsName}
                        </button>
                    ))}
                </div>
            )}

            <div style={{ marginTop: '2rem' }}>
                <h3>Quick Checks</h3>
                {pendingQuickChecks.length === 0 && submittedQuickChecks.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)' }}>
                        No quick checks right now.
                    </p>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                        {pendingQuickChecks.map(check => (
                            <div key={check.id} style={{ padding: '1.35rem', backgroundColor: check.mode === 'traffic_light' ? '#FFFBEB' : '#EEF2FF', border: `1px solid ${check.mode === 'traffic_light' ? '#FDE68A' : '#C7D2FE'}`, borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: check.mode === 'traffic_light' ? '#92400E' : '#3730A3', fontWeight: 800, marginBottom: '0.5rem' }}>
                                    <Lightbulb size={20} /> {check.mode === 'traffic_light' ? 'Traffic Light' : 'Mini Whiteboard'}
                                </div>
                                <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1.15rem' }}>{check.title}</h4>
                                <p style={{ margin: '0 0 1rem 0', color: 'var(--text-main)', fontSize: '0.95rem', lineHeight: 1.4 }}>{check.question}</p>
                                <p style={{ margin: '0 0 1rem 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    {check.class_name} · Teacher: {check.teacher_name}
                                </p>
                                <button
                                    onClick={() => navigate(`/student/quick-check/${check.id}`)}
                                    style={{ backgroundColor: check.mode === 'traffic_light' ? '#D97706' : '#4F46E5', color: 'white', padding: '0.7rem 1.1rem', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <ArrowRight size={18} /> Respond
                                </button>
                            </div>
                        ))}
                        {submittedQuickChecks.map(check => (
                            <div key={check.id} style={{ padding: '1.35rem', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#166534', fontWeight: 800, marginBottom: '0.5rem' }}>
                                    <CheckCircle size={20} /> Quick Check Submitted
                                </div>
                                <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1.15rem' }}>{check.title}</h4>
                                <p style={{ margin: 0, color: '#166534', fontSize: '0.9rem' }}>
                                    Sent {check.submitted_at ? new Date(check.submitted_at).toLocaleString() : 'recently'}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ marginTop: '2rem' }}>
                <h3>Long Answer Tasks</h3>
                {activeLongAnswers.length === 0 && completedLongAnswers.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)' }}>
                        No long-answer tasks right now.
                    </p>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                        {activeLongAnswers.map(session => (
                            <div key={session.id} style={{ padding: '1.35rem', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#0F172A', fontWeight: 800, marginBottom: '0.5rem' }}>
                                    <BookOpenText size={20} /> Long Answer
                                </div>
                                <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1.15rem' }}>{session.name || session.quiz_title}</h4>
                                <p style={{ margin: '0 0 0.75rem 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    {session.class_name} · {session.question_count} question{session.question_count === 1 ? '' : 's'} · Teacher: {session.teacher_name}
                                </p>
                                <div style={{ marginBottom: '1rem', color: '#475569', fontSize: '0.85rem', fontWeight: 700 }}>
                                    {session.response_count || 0} / {session.question_count || 0} answered
                                </div>
                                <button
                                    onClick={() => navigate(`/student/long-answer/${session.id}`)}
                                    style={{ backgroundColor: '#0F172A', color: 'white', padding: '0.7rem 1.1rem', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <ArrowRight size={18} /> Open
                                </button>
                            </div>
                        ))}
                        {completedLongAnswers.map(session => (
                            <div key={session.id} style={{ padding: '1.35rem', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#166534', fontWeight: 800, marginBottom: '0.5rem' }}>
                                    <CheckCircle size={20} /> Long Answer Complete
                                </div>
                                <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1.15rem' }}>{session.name || session.quiz_title}</h4>
                                <p style={{ margin: '0 0 1rem 0', color: '#166534', fontSize: '0.9rem' }}>
                                    {session.is_submitted === 1 && session.release_feedback === 1
                                        ? `Score: ${session.score_total ?? session.ai_total ?? 0} / ${session.max_total || 0}`
                                        : session.is_submitted === 1
                                            ? 'Submitted. Your teacher will release marks after review.'
                                        : 'This task closed before your final submission.'}
                                </p>
                                <button
                                    onClick={() => navigate(`/student/long-answer/${session.id}`)}
                                    style={{ backgroundColor: 'white', color: '#166534', padding: '0.6rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid #86EFAC', cursor: 'pointer', fontWeight: 800 }}
                                >
                                    {session.is_submitted === 1 && session.release_feedback === 1
                                        ? 'View Feedback'
                                        : session.is_submitted === 1 ? 'View Submission' : 'View Answers'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ marginTop: '2rem' }}>
                <h3>Exit Tickets</h3>
                {pendingExitTickets.length === 0 && submittedExitTickets.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)' }}>
                        No exit tickets right now.
                    </p>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                        {pendingExitTickets.map(ticket => (
                            <div key={ticket.id} style={{ padding: '1.35rem', backgroundColor: '#EEF2FF', border: '1px solid #C7D2FE', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#3730A3', fontWeight: 800, marginBottom: '0.5rem' }}>
                                    <ClipboardList size={20} /> Exit Ticket
                                </div>
                                <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1.15rem' }}>{ticket.title}</h4>
                                <p style={{ margin: '0 0 1rem 0', color: '#4338CA', fontSize: '0.9rem' }}>
                                    {ticket.class_name} · {ticket.prompt_count} prompt{ticket.prompt_count === 1 ? '' : 's'} · Teacher: {ticket.teacher_name}
                                </p>
                                <button
                                    onClick={() => navigate(`/student/exit-ticket/${ticket.id}`)}
                                    style={{ backgroundColor: '#4F46E5', color: 'white', padding: '0.7rem 1.1rem', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <ArrowRight size={18} /> Answer Now
                                </button>
                            </div>
                        ))}
                        {submittedExitTickets.map(ticket => (
                            <div key={ticket.id} style={{ padding: '1.35rem', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 'var(--radius-md)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#166534', fontWeight: 800, marginBottom: '0.5rem' }}>
                                    <CheckCircle size={20} /> Submitted
                                </div>
                                <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1.15rem' }}>{ticket.title}</h4>
                                <p style={{ margin: 0, color: '#166534', fontSize: '0.9rem' }}>
                                    Sent {ticket.submitted_at ? new Date(ticket.submitted_at).toLocaleString() : 'recently'}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ marginTop: '2rem' }}>
                <h3>Live Sessions Happening Now</h3>
                {activeSessions.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)' }}>
                        No live sessions or assigned quizzes right now.
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '1rem' }}>
                        {Object.entries(activeGroups).map(([className, classSessions]) => (
                            <div key={className}>
                                <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', borderLeft: '3px solid var(--primary)', paddingLeft: '0.75rem' }}>
                                    {className}
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {classSessions.map(s => (
                                        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '1.25rem' }}>{s.name || `Live Session #${s.id}`}</h4>
                                                <p style={{ margin: '0.25rem 0', color: 'var(--text-main)', fontWeight: 500 }}>
                                                    Teacher: {s.teacher_name}
                                                </p>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Status: {s.status.charAt(0).toUpperCase() + s.status.slice(1)}</p>
                                                    {s.expires_at && s.status === 'active' && (
                                                        <p style={{ margin: 0, color: '#991B1B', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                            <Clock size={14} /> Closes: {new Date(s.expires_at).toLocaleString()}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => navigate(`/student/live/${s.id}`)}
                                                style={{ backgroundColor: 'var(--primary)', color: 'white', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                            >
                                                <PlayCircle size={18} /> Join Now
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ marginTop: '2rem' }}>
                <h3>Past Test Results</h3>
                {pastSessions.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)' }}>
                        You haven't completed any tracked quizzes yet.
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '1rem' }}>
                        {Object.entries(pastGroups).map(([className, classSessions]) => (
                            <div key={className}>
                                <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', borderLeft: '3px solid var(--secondary)', paddingLeft: '0.75rem' }}>
                                    {className}
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {classSessions.map(s => (
                                        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '1.25rem' }}>{s.name || `Session #${s.id}`}</h4>
                                                <p style={{ margin: '0.25rem 0', color: 'var(--text-main)', fontWeight: 500 }}>
                                                    Teacher: {s.teacher_name}
                                                </p>
                                                <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>Status: Completed / Archived</p>
                                                {s.official_latest_score !== null && s.official_latest_score !== undefined && (
                                                    <div style={{ marginTop: '0.6rem', display: 'flex', flexWrap: 'wrap', gap: '0.45rem', alignItems: 'center' }}>
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#EEF2FF', color: '#3730A3', padding: '0.25rem 0.65rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 700 }}>
                                                            Official: {s.official_latest_score}%
                                                        </div>
                                                        {s.official_attempt_count > 1 && (
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#ECFDF5', color: '#047857', padding: '0.25rem 0.65rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 700 }}>
                                                                {s.official_original_score}% → {s.official_latest_score}% ({getImprovementLabel(s)})
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {getRetakeCountdown(s) && (
                                                    <div style={{ marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#FFFBEB', color: '#92400E', padding: '0.25rem 0.65rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 700 }}>
                                                        <Clock size={14} /> {getRetakeCountdown(s)}
                                                    </div>
                                                )}
                                                {practiceScores[s.quiz_id] !== undefined && (
                                                    <div style={{ marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#F0FDF4', color: '#166534', padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 700 }}>
                                                        <Trophy size={14} /> Personal Best: {practiceScores[s.quiz_id]}%
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                {(s.retake_available === 1 || s.retake_in_progress === 1) && (
                                                    <button
                                                        onClick={() => navigate(`/student/live/${s.id}?retake=1`)}
                                                        style={{ backgroundColor: '#0F766E', color: 'white', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                                    >
                                                        <PlayCircle size={18} /> {getRetakeLabel(s)}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => navigate(`/student/live/${s.id}`)}
                                                    style={{ backgroundColor: 'transparent', color: 'var(--secondary)', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--secondary)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                                >
                                                    <CheckCircle size={18} /> View Results
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ marginTop: '2rem' }}>
                <h3>Missed Sessions</h3>
                {missedSessions.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-md)' }}>
                        You haven't missed any sessions! Great job!
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '1rem' }}>
                        {Object.entries(missedGroups).map(([className, classSessions]) => (
                            <div key={className}>
                                <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', borderLeft: '3px solid #EF4444', paddingLeft: '0.75rem' }}>
                                    {className}
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {classSessions.map(s => (
                                        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem', backgroundColor: '#FEF2F2', borderRadius: 'var(--radius-md)', border: '1px solid #FCA5A5' }}>
                                            <div>
                                                <h4 style={{ margin: 0, fontSize: '1.25rem', color: '#991B1B' }}>{s.name || `Session #${s.id}`}</h4>
                                                <p style={{ margin: '0.25rem 0', color: '#7F1D1D', fontWeight: 500 }}>
                                                    Teacher: {s.teacher_name}
                                                </p>
                                                <p style={{ margin: 0, color: '#DC2626', fontSize: '0.85rem', fontWeight: 600 }}>Missed Live Session</p>
                                                {practiceScores[s.quiz_id] !== undefined && (
                                                    <div style={{ marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#FEE2E2', color: '#991B1B', padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 700 }}>
                                                        <Trophy size={14} /> Personal Best: {practiceScores[s.quiz_id]}%
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => navigate(`/student/live/${s.id}`)}
                                                style={{ backgroundColor: '#EF4444', color: 'white', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                            >
                                                <PlayCircle size={18} /> Practice Now
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>


            <div style={{ marginTop: '2rem' }}>
                <button onClick={fetchSessions} style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', backgroundColor: 'transparent', cursor: 'pointer' }}>Refresh Sessions</button>
            </div>

            {showPasswordModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div className="fade-in" style={{ backgroundColor: 'white', padding: '2rem', borderRadius: 'var(--radius-md)', width: '100%', maxWidth: '400px', boxShadow: 'var(--shadow-lg)' }}>
                        <h3 style={{ marginTop: 0 }}>Change Password</h3>
                        <form onSubmit={handleChangePassword}>
                            <input
                                type="password"
                                placeholder="Enter New Password"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                required
                                style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: '1rem', fontSize: '1rem' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                <button type="button" onClick={() => setShowPasswordModal(false)} style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', backgroundColor: 'transparent', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                                <button type="submit" style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', border: 'none', backgroundColor: 'var(--primary)', color: 'white', cursor: 'pointer', fontWeight: 600 }}>Update Password</button>
                            </div>
                            {passwordMessage && <p style={{ marginTop: '1rem', color: passwordMessage.includes('successfully') ? '#10B981' : '#EF4444', fontSize: '0.9rem', textAlign: 'center', fontWeight: 500 }}>{passwordMessage}</p>}
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
