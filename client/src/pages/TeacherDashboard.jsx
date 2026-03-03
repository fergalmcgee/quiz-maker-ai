import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, Users, LayoutDashboard, Play, Globe, Download, Archive, CheckCircle, Search, UserPlus, UserMinus, ChevronLeft } from 'lucide-react';

export default function TeacherDashboard({ user }) {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('quizzes');
    const [quizzes, setQuizzes] = useState([]);
    const [communityQuizzes, setCommunityQuizzes] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const [startSessionPrompt, setStartSessionPrompt] = useState(null);
    const [sessionName, setSessionName] = useState('');
    const [sessionMode, setSessionMode] = useState('live');
    const [sessionTimer, setSessionTimer] = useState('');

    // Bulk Import Form State
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [bulkText, setBulkText] = useState('');
    const [importing, setImporting] = useState(false);
    const [editingQuizId, setEditingQuizId] = useState(null);

    // Class Management State
    const [classes, setClasses] = useState([]);
    const [newClassName, setNewClassName] = useState('');
    const [selectedClassRaw, setSelectedClassRaw] = useState(null);
    const [classStudents, setClassStudents] = useState([]);

    // Class Student Search
    const [studentSearchQuery, setStudentSearchQuery] = useState('');
    const [studentSearchResults, setStudentSearchResults] = useState([]);

    // For session starting
    const [targetClassId, setTargetClassId] = useState('');

    useEffect(() => {
        if (user) {
            fetchQuizzes();
            fetchCommunityQuizzes();
            fetchSessions();
            fetchClasses();
        }
    }, [user]);

    const fetchQuizzes = async () => {
        try {
            const res = await fetch(`http://localhost:3001/api/quizzes?authorId=${user.id}`);
            const data = await res.json();
            setQuizzes(data);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchCommunityQuizzes = async () => {
        try {
            const res = await fetch(`http://localhost:3001/api/quizzes/community/${user.id}`);
            const data = await res.json();
            setCommunityQuizzes(data);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchSessions = async () => {
        try {
            const res = await fetch(`http://localhost:3001/api/sessions/teacher/${user.id}`);
            const data = await res.json();
            setSessions(data);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchClasses = async () => {
        try {
            const res = await fetch(`http://localhost:3001/api/classes?teacherId=${user.id}`);
            const data = await res.json();
            setClasses(data);
        } catch (e) {
            console.error(e);
        }
    };

    const handleCreateClass = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('http://localhost:3001/api/classes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newClassName, teacherId: user.id })
            });
            if (res.ok) {
                setNewClassName('');
                fetchClasses();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchClassStudents = async (classId) => {
        try {
            const res = await fetch(`http://localhost:3001/api/classes/${classId}/students`);
            const data = await res.json();
            setClassStudents(data);
        } catch (e) {
            console.error(e);
        }
    };

    const handleSelectClass = (cls) => {
        setSelectedClassRaw(cls);
        fetchClassStudents(cls.id);
        setStudentSearchQuery('');
        setStudentSearchResults([]);
    };

    // Auto-search for students when query changes
    useEffect(() => {
        const fetchSearchResults = async () => {
            if (studentSearchQuery.length < 2) {
                setStudentSearchResults([]);
                return;
            }
            try {
                const res = await fetch(`http://localhost:3001/api/students/search?q=${encodeURIComponent(studentSearchQuery)}`);
                const data = await res.json();
                setStudentSearchResults(data);
            } catch (e) {
                console.error(e);
            }
        };

        const debounceId = setTimeout(() => {
            fetchSearchResults();
        }, 300);

        return () => clearTimeout(debounceId);
    }, [studentSearchQuery]);

    const handleAddStudentToClass = async (studentId) => {
        if (!selectedClassRaw) return;
        try {
            const res = await fetch(`http://localhost:3001/api/classes/${selectedClassRaw.id}/students`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId })
            });
            const data = await res.json();
            if (data.message === 'Student already in class') {
                // optionally alert or toast
            } else {
                fetchClassStudents(selectedClassRaw.id);
                fetchClasses(); // Update count
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleRemoveStudentFromClass = async (studentId) => {
        if (!selectedClassRaw) return;
        try {
            await fetch(`http://localhost:3001/api/classes/${selectedClassRaw.id}/students/${studentId}`, {
                method: 'DELETE'
            });
            fetchClassStudents(selectedClassRaw.id);
            fetchClasses(); // Update count
        } catch (e) {
            console.error(e);
        }
    };

    const handleEditClick = async (quiz) => {
        try {
            const res = await fetch(`http://localhost:3001/api/quizzes/${quiz.id}/export`);
            if (res.ok) {
                const data = await res.json();
                setTitle(quiz.title);
                setDescription(quiz.description || '');
                setBulkText(data.bulkText);
                setEditingQuizId(quiz.id);
                setActiveTab('import');
            } else {
                alert('Failed to load quiz for editing.');
            }
        } catch (e) {
            console.error(e);
            alert('Failed to load quiz for editing.');
        }
    };

    const handleImport = async (e) => {
        e.preventDefault();
        setImporting(true);
        try {
            const endpoint = editingQuizId ? `http://localhost:3001/api/quizzes/${editingQuizId}` : 'http://localhost:3001/api/quizzes/import';
            const method = editingQuizId ? 'PUT' : 'POST';

            const res = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description, bulkText, authorId: user.id })
            });
            if (res.ok) {
                const data = await res.json();
                setTitle('');
                setDescription('');
                setBulkText('');
                setEditingQuizId(null);
                fetchQuizzes();
                fetchCommunityQuizzes();
                alert(`Success: ${editingQuizId ? 'Updated' : 'Imported'} ${data.questionsImported} questions!`);
                setActiveTab('quizzes');
            } else {
                const errData = await res.json();
                alert(`Error: ${errData.error || (editingQuizId ? 'Failed to update quiz' : 'Failed to import quiz')}`);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setImporting(false);
        }
    };

    const cancelEdit = () => {
        setTitle('');
        setDescription('');
        setBulkText('');
        setEditingQuizId(null);
        setActiveTab('quizzes');
    };

    const handleStartSession = (quiz) => {
        setStartSessionPrompt(quiz.id);
        const dateStr = new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
        setSessionName(`${quiz.title} - ${dateStr}`);
        setSessionMode('live'); // Default to live
        setSessionTimer(''); // Reset timer
    };

    const confirmStartSession = async (quizId) => {
        if (!sessionName.trim()) return;
        if (!targetClassId) {
            alert('Please select a target class for this session.');
            return;
        }
        try {
            const res = await fetch('http://localhost:3001/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    quiz_id: quizId,
                    mode: sessionMode,
                    name: sessionName,
                    class_id: targetClassId,
                    time_limit: sessionTimer ? parseInt(sessionTimer) : null
                })
            });
            const data = await res.json();
            if (data.sessionId) {
                fetchSessions();
                navigate(`/teacher/present/${data.sessionId}`);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const toggleShare = async (quizId, currentStatus) => {
        try {
            const res = await fetch(`http://localhost:3001/api/quizzes/${quizId}/share`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isShared: !currentStatus })
            });
            if (res.ok) {
                fetchQuizzes();
                fetchCommunityQuizzes();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const copyCommunityQuiz = async (quizId) => {
        try {
            const res = await fetch(`http://localhost:3001/api/quizzes/${quizId}/copy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newAuthorId: user.id })
            });
            if (res.ok) {
                fetchQuizzes();
                setActiveTab('quizzes');
            }
        } catch (e) {
            console.error(e);
        }
    };

    const archiveSession = async (sessionId) => {
        try {
            const res = await fetch(`http://localhost:3001/api/sessions/${sessionId}/archive`, { method: 'PUT' });
            if (res.ok) {
                fetchSessions();
                setConfirmDeleteId(null);
            } else {
                const data = await res.json();
                alert(`Error archiving session: ${data.error}`);
            }
        } catch (e) {
            console.error(e);
            alert(`Network error: ${e.message}`);
        }
    };

    const activeSessions = sessions.filter(s => s.status === 'active' && s.is_archived === 0);
    const completedSessions = sessions.filter(s => s.status === 'completed' || s.is_archived === 1);

    return (
        <div style={{ display: 'flex', gap: '2rem' }}>
            {/* Sidebar */}
            <aside style={{ width: '250px', backgroundColor: 'var(--surface)', padding: '1.5rem', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', alignSelf: 'flex-start' }}>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <li>
                        <button onClick={() => setActiveTab('quizzes')} className={activeTab === 'quizzes' ? 'active-tab' : ''} style={tabStyle(activeTab === 'quizzes')}>
                            <LayoutDashboard size={20} /> My Quizzes
                        </button>
                    </li>
                    <li>
                        <button onClick={() => setActiveTab('community')} className={activeTab === 'community' ? 'active-tab' : ''} style={tabStyle(activeTab === 'community')}>
                            <Globe size={20} /> Discover Quizzes
                        </button>
                    </li>
                    <li>
                        <button onClick={() => { setActiveTab('import'); setEditingQuizId(null); setTitle(''); setDescription(''); setBulkText(''); }} className={activeTab === 'import' ? 'active-tab' : ''} style={tabStyle(activeTab === 'import')}>
                            <PlusCircle size={20} /> Create / Edit
                        </button>
                    </li>
                    <li>
                        <button onClick={() => setActiveTab('sessions')} className={activeTab === 'sessions' ? 'active-tab' : ''} style={tabStyle(activeTab === 'sessions')}>
                            <Play size={20} /> Manage Sessions
                        </button>
                    </li>
                    <li>
                        <button onClick={() => setActiveTab('classes')} className={activeTab === 'classes' ? 'active-tab' : ''} style={tabStyle(activeTab === 'classes')}>
                            <Users size={20} /> Manage Classes
                        </button>
                    </li>
                </ul>
            </aside>

            {/* Main Content */}
            <div style={{ flex: 1, backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>

                {activeTab === 'quizzes' && (
                    <div className="fade-in">
                        <h2>My Quizzes</h2>
                        {quizzes.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>No quizzes found. Create one.</p>
                        ) : (
                            <div style={{ display: 'grid', gap: '1rem', marginTop: '1.5rem' }}>
                                {quizzes.map(q => (
                                    <div key={q.id} style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <h3 style={{ margin: 0 }}>{q.title}</h3>
                                                {q.is_shared === 1 && <span style={{ padding: '0.15rem 0.4rem', backgroundColor: '#DBEAFE', color: '#1D4ED8', fontSize: '0.7rem', borderRadius: '1rem', fontWeight: 600 }}>Shared</span>}
                                            </div>
                                            <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 0 0' }}>{q.description}</p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            <button onClick={() => handleEditClick(q)} style={{ backgroundColor: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>
                                                Edit
                                            </button>
                                            <button onClick={() => toggleShare(q.id, q.is_shared === 1)} style={{ backgroundColor: 'transparent', color: q.is_shared === 1 ? '#D97706' : 'var(--primary)', border: `1px solid ${q.is_shared === 1 ? '#D97706' : 'var(--primary)'}`, padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>
                                                {q.is_shared === 1 ? 'Unshare' : 'Share to Community'}
                                            </button>
                                            {startSessionPrompt === q.id ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                        <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Session Name:</label>
                                                        <input type="text" value={sessionName} onChange={e => setSessionName(e.target.value)} style={{ padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', flex: 1 }} autoFocus />
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                        <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Target Class:</label>
                                                        <select value={targetClassId} onChange={e => setTargetClassId(e.target.value)} style={{ padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', flex: 1 }} required>
                                                            <option value="" disabled>Select a class...</option>
                                                            {classes.map(c => (
                                                                <option key={c.id} value={c.id}>{c.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                                        <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Mode:</label>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                                                            <input type="radio" value="live" checked={sessionMode === 'live'} onChange={(e) => setSessionMode(e.target.value)} />
                                                            Live (Teacher-Paced)
                                                        </label>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                                                            <input type="radio" value="async" checked={sessionMode === 'async'} onChange={(e) => setSessionMode(e.target.value)} />
                                                            Async (Student-Paced)
                                                        </label>
                                                    </div>

                                                    {sessionMode === 'async' && (
                                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                            <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Time Limit (mins):</label>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                placeholder="Optional"
                                                                value={sessionTimer}
                                                                onChange={e => setSessionTimer(e.target.value)}
                                                                style={{ padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', flex: 1 }}
                                                            />
                                                        </div>
                                                    )}

                                                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                                                        <button onClick={() => setStartSessionPrompt(null)} style={{ backgroundColor: '#F3F4F6', color: '#374151', border: 'none', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                                                        <button onClick={() => confirmStartSession(q.id)} style={{ backgroundColor: 'var(--secondary)', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>Start</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button onClick={() => handleStartSession(q)} style={{ backgroundColor: 'var(--secondary)', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
                                                    <Play size={18} /> Start Live Session
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'community' && (
                    <div className="fade-in">
                        <h2>Discover Community Quizzes</h2>
                        <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 1.5rem 0' }}>Explore quizzes created by other teachers that you can import and use.</p>

                        {communityQuizzes.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)' }}>No community quizzes available yet.</p>
                        ) : (
                            <div style={{ display: 'grid', gap: '1rem' }}>
                                {communityQuizzes.map(q => (
                                    <div key={q.id} style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white' }}>
                                        <div>
                                            <h3 style={{ margin: 0, color: 'var(--text-main)' }}>{q.title}</h3>
                                            <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0.5rem 0', fontSize: '0.9rem' }}>Created by: <strong>{q.author_name || 'System'}</strong></p>
                                            <p style={{ color: 'var(--text-main)', margin: 0 }}>{q.description}</p>
                                        </div>
                                        <button onClick={() => copyCommunityQuiz(q.id)} style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
                                            <Download size={18} /> Import to My Quizzes
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'import' && (
                    <div className="fade-in">
                        <h2>{editingQuizId ? 'Edit Quiz' : 'Create New Quiz'}</h2>
                        <div style={{ backgroundColor: '#DBEAFE', color: '#1E3A8A', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                            <strong>Formatting Rules:</strong>
                            <ul style={{ margin: '0.5rem 0 0 1.5rem', padding: 0 }}>
                                <li>1 Question per block.</li>
                                <li>Options listed below it (A, B, C, etc. or -, *).</li>
                                <li>Mark the correct answer with an asterisk (<strong>*</strong>) or <strong>(correct)</strong> at the end.</li>
                                <li><strong>Images:</strong> Add <code>[IMG: https://link-to-image.jpg]</code> above or below the question text.</li>
                                <li><strong>True/False:</strong> Just provide "True" and "False" as the only two options.</li>
                                <li><strong>Short Answer:</strong> Omit options entirely and write <code>Answer: correct text</code> below the question.</li>
                            </ul>
                        </div>
                        <form onSubmit={handleImport} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <input type="text" placeholder="Quiz Title" value={title} onChange={(e) => setTitle(e.target.value)} required style={inputStyle} />
                            <input type="text" placeholder="Description (Optional)" value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} />
                            <textarea
                                placeholder={`Example Format:

1. What is the capital of France?
A) London
*B) Paris
C) Berlin

2) Which planet is known as the Red Planet?
[IMG: https://example.com/mars.jpg]
Jupiter
Venus
Mars (correct)

3. True or False: The Earth is flat.
True
*False

4. What year did the Titanic sink?
Answer: 1912`}
                                value={bulkText} onChange={(e) => setBulkText(e.target.value)} required
                                style={{ ...inputStyle, minHeight: '350px', resize: 'vertical', fontFamily: 'monospace' }}
                            />
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button type="submit" disabled={importing} style={{ flex: 1, backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>
                                    {importing ? (editingQuizId ? 'Saving...' : 'Importing...') : (editingQuizId ? 'Save Changes' : 'Create Quiz')}
                                </button>
                                {editingQuizId && (
                                    <button type="button" onClick={cancelEdit} style={{ flex: 1, backgroundColor: '#F3F4F6', color: '#1F2937', border: '1px solid var(--border)', padding: '1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>
                                        Cancel Edit
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                )}

                {
                    activeTab === 'sessions' && (
                        <div className="fade-in">
                            <h2>Manage Live Sessions</h2>
                            <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 1.5rem 0' }}>Resume active sessions or review past session results.</p>

                            <div style={{ marginBottom: '2rem' }}>
                                <h3>Active Sessions</h3>
                                {activeSessions.length === 0 ? (
                                    <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>No active sessions found.</p>
                                ) : (
                                    <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
                                        {activeSessions.map(s => (
                                            <div key={s.id} style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white' }}>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                                        <h3 style={{ margin: 0 }}>{s.name || s.quiz_title}</h3>
                                                        <span style={{
                                                            padding: '0.25rem 0.5rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase',
                                                            backgroundColor: '#D1FAE5', color: '#059669'
                                                        }}>
                                                            Active
                                                        </span>
                                                    </div>
                                                    <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Created: {new Date(s.created_at).toLocaleString()}</p>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    {confirmDeleteId === s.id ? (
                                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.85rem', color: '#DC2626', fontWeight: 600 }}>End Session?</span>
                                                            <button onClick={() => archiveSession(s.id)} style={{ backgroundColor: '#DC2626', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>
                                                                Yes, Archive
                                                            </button>
                                                            <button onClick={() => setConfirmDeleteId(null)} style={{ backgroundColor: '#F3F4F6', color: '#374151', border: 'none', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => navigate(`/teacher/present/${s.id}`)} style={{ backgroundColor: 'var(--secondary)', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>
                                                                Resume
                                                            </button>
                                                            <button onClick={() => setConfirmDeleteId(s.id)} style={{ backgroundColor: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                                                                <Archive size={16} /> Archive
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <h3>Completed / Archived Sessions</h3>
                                {completedSessions.length === 0 ? (
                                    <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>No past sessions found.</p>
                                ) : (
                                    <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
                                        {completedSessions.map(s => (
                                            <div key={s.id} style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--surface)' }}>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                                        <h3 style={{ margin: 0, color: 'var(--text-main)' }}>{s.name || s.quiz_title}</h3>
                                                        <span style={{
                                                            padding: '0.25rem 0.5rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase',
                                                            backgroundColor: '#F3F4F6', color: '#4B5563'
                                                        }}>
                                                            Archived
                                                        </span>
                                                    </div>
                                                    <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Created: {new Date(s.created_at).toLocaleString()}</p>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button onClick={() => navigate(`/teacher/review/${s.id}`)} style={{ backgroundColor: 'transparent', color: 'var(--secondary)', border: '1px solid var(--secondary)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                        <CheckCircle size={16} /> View Results
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                }

                {
                    activeTab === 'classes' && (
                        <div className="fade-in">
                            <h2>Manage Classes</h2>
                            <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 1.5rem 0' }}>Create classes and manage student rosters.</p>

                            <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
                                {/* Left Column: Class List */}
                                <div style={{ flex: '1', backgroundColor: '#F8FAFC', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                    <h3 style={{ marginTop: 0 }}>My Classes</h3>
                                    <form onSubmit={handleCreateClass} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                        <input type="text" placeholder="New Class Name" value={newClassName} onChange={e => setNewClassName(e.target.value)} required style={{ ...inputStyle, padding: '0.5rem' }} />
                                        <button type="submit" style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>Create</button>
                                    </form>

                                    {classes.length === 0 ? (
                                        <p style={{ color: 'var(--text-muted)' }}>No classes yet.</p>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {classes.map(c => (
                                                <button
                                                    key={c.id}
                                                    onClick={() => handleSelectClass(c)}
                                                    style={{
                                                        padding: '1rem', textAlign: 'left', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', cursor: 'pointer',
                                                        backgroundColor: selectedClassRaw?.id === c.id ? 'white' : 'transparent',
                                                        borderColor: selectedClassRaw?.id === c.id ? 'var(--primary)' : 'var(--border)',
                                                        boxShadow: selectedClassRaw?.id === c.id ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{c.name}</div>
                                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{c.student_count} Students</div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Right Column: Class Details / Roster */}
                                <div style={{ flex: '2', backgroundColor: 'white', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', minHeight: '400px' }}>
                                    {!selectedClassRaw ? (
                                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                            Select a class to manage its roster.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                                <div>
                                                    <h3 style={{ margin: 0 }}>{selectedClassRaw.name}</h3>
                                                    <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)' }}>{classStudents.length} Students Enrolled</p>
                                                </div>
                                            </div>

                                            {/* Add Student Search Box */}
                                            <div style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: '#F0F9FF', borderRadius: 'var(--radius-md)', border: '1px solid #BAE6FD', position: 'relative' }}>
                                                <h4 style={{ margin: '0 0 1rem 0', color: '#0369A1' }}>Add Students to Class</h4>
                                                <div style={{ position: 'relative' }}>
                                                    <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
                                                    <input
                                                        type="text"
                                                        placeholder="Search school directory by name or form class..."
                                                        value={studentSearchQuery}
                                                        onChange={e => setStudentSearchQuery(e.target.value)}
                                                        style={{ ...inputStyle, paddingLeft: '2.5rem', borderColor: '#BAE6FD' }}
                                                    />
                                                </div>

                                                {/* Search Results Dropdown */}
                                                {studentSearchResults.length > 0 && (
                                                    <div style={{ position: 'absolute', top: '100%', left: '1.5rem', right: '1.5rem', backgroundColor: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: '250px', overflowY: 'auto', marginTop: '0.5rem' }}>
                                                        {studentSearchResults.map(s => {
                                                            const isAlreadyEnrolled = classStudents.some(cs => cs.id === s.id);
                                                            return (
                                                                <div key={s.id} style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                                                                    <div>
                                                                        <div style={{ fontWeight: 600 }}>{s.username}</div>
                                                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Form: {s.form_class || 'N/A'}</div>
                                                                    </div>
                                                                    <button
                                                                        onClick={() => handleAddStudentToClass(s.id)}
                                                                        disabled={isAlreadyEnrolled}
                                                                        style={{
                                                                            display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: 'none', cursor: isAlreadyEnrolled ? 'default' : 'pointer', fontWeight: 600, fontSize: '0.85rem',
                                                                            backgroundColor: isAlreadyEnrolled ? '#F3F4F6' : '#E0E7FF',
                                                                            color: isAlreadyEnrolled ? '#9CA3AF' : '#4338CA'
                                                                        }}
                                                                    >
                                                                        {isAlreadyEnrolled ? <CheckCircle size={16} /> : <PlusCircle size={16} />}
                                                                        {isAlreadyEnrolled ? 'Added' : 'Add'}
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Current Roster */}
                                            <h4 style={{ color: 'var(--text-main)', marginBottom: '1rem' }}>Class Roster</h4>
                                            {classStudents.length === 0 ? (
                                                <p style={{ color: 'var(--text-muted)' }}>No students in this class.</p>
                                            ) : (
                                                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                                                    {classStudents.map((s, idx) => (
                                                        <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderBottom: idx < classStudents.length - 1 ? '1px solid var(--border)' : 'none', backgroundColor: idx % 2 === 0 ? 'white' : '#F9FAFB' }}>
                                                            <div>
                                                                <span style={{ fontWeight: 500 }}>{s.username}</span>
                                                                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>({s.form_class || 'N/A'})</span>
                                                            </div>
                                                            <button
                                                                onClick={() => handleRemoveStudentFromClass(s.id)}
                                                                style={{ backgroundColor: 'transparent', color: '#DC2626', border: '1px solid #DC2626', padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', cursor: 'pointer' }}
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                }

            </div >
        </div >
    );
}

const tabStyle = (isActive) => ({
    width: '100%',
    padding: '1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    backgroundColor: isActive ? 'var(--primary)' : 'transparent',
    color: isActive ? 'white' : 'var(--text-main)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    cursor: 'pointer',
    textAlign: 'left',
    fontWeight: isActive ? 600 : 400,
    transition: 'all 0.2s',
});

const inputStyle = {
    width: '100%',
    padding: '0.75rem',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    fontSize: '1rem'
};
