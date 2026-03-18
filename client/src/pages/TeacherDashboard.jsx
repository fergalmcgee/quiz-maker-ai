import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, Users, LayoutDashboard, Play, Globe, Download, Archive, CheckCircle, Search, UserPlus, UserMinus, ChevronLeft, Trash2, Clock, History } from 'lucide-react';
import toast from 'react-hot-toast';
import TeacherGrowthView from '../components/TeacherGrowthView';

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
    const [randomizeQuestions, setRandomizeQuestions] = useState(false);
    const [shuffleOptions, setShuffleOptions] = useState(false);
    const [isTeamMode, setIsTeamMode] = useState(false);

    const [showAllQuizzes, setShowAllQuizzes] = useState(false);
    const [showAllPastSessions, setShowAllPastSessions] = useState(false);

    // Visual Builder State
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [quizCategory, setQuizCategory] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [communityCategory, setCommunityCategory] = useState('All');
    const [questions, setQuestions] = useState([]);
    const [saving, setSaving] = useState(false);
    const [editingQuizId, setEditingQuizId] = useState(null);
    const [sessionClassFilter, setSessionClassFilter] = useState('All');

    // Bulk Import Modal
    const [showBulkImportModal, setShowBulkImportModal] = useState(false);
    const [bulkImportText, setBulkImportText] = useState('');

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

    const fetchQuizzes = async (category = null) => {
        try {
            let url = `/api/quizzes?authorId=${user.id}`;
            if (category && category !== 'All') {
                url += `&category=${encodeURIComponent(category)}`;
            }
            const res = await fetch(url, {
                headers: {
                    'x-user-id': user.id,
                    'x-user-role': user.role
                }
            });
            if (res.ok) {
                const data = await res.json();
                setQuizzes(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchCommunityQuizzes = async (category = null) => {
        try {
            let url = `/api/quizzes/community/${user.id}`;
            if (category && category !== 'All') {
                url += `?category=${encodeURIComponent(category)}`;
            }
            const res = await fetch(url, {
                headers: {
                    'x-user-id': user.id,
                    'x-user-role': user.role
                }
            });
            if (res.ok) {
                const data = await res.json();
                setCommunityQuizzes(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchSessions = async () => {
        try {
            const res = await fetch(`/api/sessions/teacher/${user.id}`, {
                headers: {
                    'x-user-id': user.id,
                    'x-user-role': user.role
                }
            });
            if (res.ok) {
                const data = await res.json();
                setSessions(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const fetchClasses = async () => {
        try {
            const res = await fetch(`/api/classes?teacherId=${user.id}`, {
                headers: {
                    'x-user-id': user.id,
                    'x-user-role': user.role
                }
            });
            if (res.ok) {
                const data = await res.json();
                setClasses(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleCreateClass = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch('/api/classes', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                    'x-user-role': user.role
                },
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
            const res = await fetch(`/api/classes/${classId}/students`, {
                headers: {
                    'x-user-id': user.id,
                    'x-user-role': user.role
                }
            });
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
                const res = await fetch(`/api/students/search?q=${encodeURIComponent(studentSearchQuery)}`, {
                    headers: { 
                        'x-user-id': user.id,
                        'x-user-role': user.role 
                    }
                });
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
            const res = await fetch(`/api/classes/${selectedClassRaw.id}/students`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                    'x-user-role': user.role
                },
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
            await fetch(`/api/classes/${selectedClassRaw.id}/students/${studentId}`, {
                method: 'DELETE',
                headers: {
                    'x-user-id': user.id,
                    'x-user-role': user.role
                }
            });
            fetchClassStudents(selectedClassRaw.id);
            fetchClasses(); // Update count
        } catch (e) {
            console.error(e);
        }
    };

    const handleEditClick = async (quiz) => {
        try {
            const res = await fetch(`/api/quizzes/${quiz.id}`, {
                headers: {
                    'x-user-id': user.id,
                    'x-user-role': user.role
                }
            });
            if (res.ok) {
                const data = await res.json();
                setTitle(quiz.title);
                setDescription(quiz.description || '');
                setQuizCategory(quiz.category || '');
                setQuestions(data.questions || []);
                setEditingQuizId(quiz.id);
                setActiveTab('import');
            } else {
                toast.error('Failed to load quiz metadata.');
            }
        } catch (e) {
            console.error(e);
            toast.error('Failed to load quiz metadata.');
        }
    };

    const handleSaveQuiz = async (e) => {
        e.preventDefault();
        if (!title.trim()) { toast.error("Please provide a title"); return; }
        if (questions.length === 0) { toast.error("Please add at least one question."); return; }

        const validQuestions = questions.filter(q => q.text.trim() || q.image_url);
        if (validQuestions.length === 0) { toast.error("Questions must have text or an image."); return; }

        setSaving(true);
        try {
            const endpoint = editingQuizId ? `/api/quizzes/${editingQuizId}/structure` : '/api/quizzes/builder';
            const method = editingQuizId ? 'PUT' : 'POST';

            const res = await fetch(endpoint, {
                method,
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                    'x-user-role': user.role
                },
                body: JSON.stringify({
                    title,
                    description,
                    category: quizCategory || 'General',
                    questions: validQuestions,
                    authorId: user.id
                })
            });

            if (res.ok) {
                setTitle('');
                setDescription('');
                setQuizCategory('');
                setQuestions([]);
                setEditingQuizId(null);
                fetchQuizzes(selectedCategory);
                fetchCommunityQuizzes();
                toast.success(`Quiz ${editingQuizId ? 'Updated' : 'Created'}!`);
                setActiveTab('quizzes');
            } else {
                const data = await res.json();
                toast.error(`Error: ${data.error}`);
            }
        } catch (e) {
            console.error(e);
            toast.error('Network error');
        } finally {
            setSaving(false);
        }
    };

    const cancelEdit = () => {
        setTitle('');
        setDescription('');
        setQuestions([]);
        setEditingQuizId(null);
        setActiveTab('quizzes');
    };

    const handleBulkImportProcess = () => {
        if (!bulkImportText.trim()) {
            toast.error("Please paste some text to import.");
            return;
        }

        const lines = bulkImportText.split('\n').filter(line => line.trim() !== '');
        const newQuestions = [...questions];

        let currentQuestion = null;

        lines.forEach(line => {
            const imgMatch = line.match(/^\[IMG:\s*(https?:\/\/[^\]]+)\]$/i);
            if (imgMatch) {
                if (currentQuestion && currentQuestion.options.length === 0) {
                    currentQuestion.image_url = imgMatch[1];
                }
                return;
            }

            const isNewQuestion = /^\d+[\.\)]\s+/.test(line) || /^[Qq](uestion)?\s*\d+[\.\:]\s+/.test(line);

            if (isNewQuestion) {
                if (currentQuestion && currentQuestion.options.length > 0) {
                    // determine type
                    currentQuestion.type = 'multiple_choice';
                    if (currentQuestion.options.length === 1 && currentQuestion.options[0].is_correct) {
                        currentQuestion.type = 'short_answer';
                    }
                }

                let qText = line.replace(/^\d+[\.\)]\s+/, '').replace(/^[Qq](uestion)?\s*\d+[\.\:]\s+/, '').trim();
                currentQuestion = {
                    id: Date.now() + Math.random(),
                    text: qText,
                    type: 'multiple_choice',
                    image_url: '',
                    options: [],
                    code_snippet: '',
                    code_language: ''
                };
                newQuestions.push(currentQuestion);
            } else if (currentQuestion) {
                let optLine = line;
                let isCorrect = 0;

                const shortAnswerMatch = optLine.match(/^Answer:\s*(.+)$/i);
                if (shortAnswerMatch) {
                    isCorrect = 1;
                    optLine = shortAnswerMatch[1].trim();
                    currentQuestion.type = 'short_answer';
                } else {
                    if (optLine.startsWith('*')) {
                        isCorrect = 1;
                        optLine = optLine.substring(1).trim();
                    } else if (optLine.toLowerCase().endsWith('(correct)')) {
                        isCorrect = 1;
                        optLine = optLine.replace(/\(correct\)$/i, '').trim();
                    }
                    optLine = optLine.replace(/^[a-zA-Z][\.\)]\s+/, '').replace(/^[\-\•]\s+/, '').trim();
                }

                if (optLine.length > 0) {
                    currentQuestion.options.push({ text: optLine, is_correct: isCorrect });
                }
            }
        });

        if (currentQuestion && currentQuestion.options.length > 0) {
            currentQuestion.type = 'multiple_choice';
            if (currentQuestion.options.length === 1 && currentQuestion.options[0].is_correct) {
                currentQuestion.type = 'short_answer';
            }
        }

        const validQuestions = newQuestions.filter(q => q.options.length > 0);
        if (validQuestions.length > 0) {
            setQuestions(validQuestions);
            setBulkImportText('');
            setShowBulkImportModal(false);
            toast.success(`Successfully imported ${validQuestions.length - questions.length} questions into the builder!`);
        } else {
            toast.error('No valid questions could be parsed from the text.');
        }
    };

    const addQuestion = () => {
        setQuestions([
            ...questions,
            { id: Date.now(), text: '', type: 'multiple_choice', image_url: '', options: [], code_snippet: '', code_language: '' }
        ]);
    };

    const updateQuestion = (id, field, value) => {
        setQuestions(questions.map(q => q.id === id ? { ...q, [field]: value } : q));
    };

    const removeQuestion = (id) => {
        setQuestions(questions.filter(q => q.id !== id));
    };

    const addOption = (questionId) => {
        setQuestions(questions.map(q => {
            if (q.id === questionId) {
                return {
                    ...q,
                    options: [...q.options, { text: '', is_correct: 0 }]
                };
            }
            return q;
        }));
    };

    const updateOption = (questionId, optionIndex, text) => {
        setQuestions(questions.map(q => {
            if (q.id === questionId) {
                const newOptions = [...q.options];
                newOptions[optionIndex].text = text;
                return { ...q, options: newOptions };
            }
            return q;
        }));
    };

    const toggleCorrectOption = (questionId, optionIndex) => {
        setQuestions(questions.map(q => {
            if (q.id === questionId) {
                const newOptions = q.options.map((opt, i) =>
                    i === optionIndex ? { ...opt, is_correct: opt.is_correct ? 0 : 1 } : opt
                );
                return { ...q, options: newOptions };
            }
            return q;
        }));
    };

    const removeOption = (questionId, optionIndex) => {
        setQuestions(questions.map(q => {
            if (q.id === questionId) {
                return {
                    ...q,
                    options: q.options.filter((_, i) => i !== optionIndex)
                };
            }
            return q;
        }));
    };

    const handleStartSession = (quiz) => {
        setStartSessionPrompt(quiz.id);
        const dateStr = new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
        setSessionName(`${quiz.title} - ${dateStr}`);
        setSessionMode('live'); // Default to live
        setSessionTimer(''); // Reset timer
        setRandomizeQuestions(false);
        setShuffleOptions(false); // Reset options shuffle
        setIsTeamMode(false);     // Reset team mode
    };

    const confirmStartSession = async (quizId) => {
        if (!sessionName.trim()) return;
        if (!targetClassId) {
            toast.error('Please select a target class for this session.');
            return;
        }
        try {
            const res = await fetch('/api/sessions', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                    'x-user-role': user.role
                },
                body: JSON.stringify({
                    quiz_id: quizId,
                    mode: sessionMode,
                    name: sessionName,
                    class_id: targetClassId,
                    time_limit: sessionTimer ? parseInt(sessionTimer) : null,
                    randomize_questions: randomizeQuestions,
                    shuffle_options: shuffleOptions,
                    is_team_mode: isTeamMode
                })
            });
            const data = await res.json();
            if (res.ok && data.sessionId) {
                fetchSessions();
                navigate(`/teacher/present/${data.sessionId}`);
            } else {
                toast.error(`Error starting session: ${data.error || 'Unknown error'}`);
            }
        } catch (e) {
            console.error(e);
            toast.error('Network error while starting session.');
        }
    };

    const toggleShare = async (quizId, currentStatus) => {
        try {
            const res = await fetch(`/api/quizzes/${quizId}/share`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                    'x-user-role': user.role
                },
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
            const res = await fetch(`/api/quizzes/${quizId}/copy`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                    'x-user-role': user.role
                },
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
            const res = await fetch(`/api/sessions/${sessionId}/archive`, { 
                method: 'PUT',
                headers: {
                    'x-user-id': user.id,
                    'x-user-role': user.role
                }
            });
            if (res.ok) fetchSessions();
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteQuiz = async (quizId) => {
        try {
            const res = await fetch(`/api/quizzes/${quizId}`, { 
                method: 'DELETE',
                headers: {
                    'x-user-id': user.id,
                    'x-user-role': user.role
                }
            });
            if (res.ok) {
                fetchQuizzes();
                fetchCommunityQuizzes();
                setConfirmDeleteId(null);
                toast.success('Quiz deleted.');
            } else {
                toast.error('Failed to delete quiz.');
            }
        } catch (e) {
            console.error(e);
            toast.error('Network error while deleting quiz.');
        }
    };

    const groupSessionsByClass = (sessionList) => {
        const filtered = sessionClassFilter === 'All' 
            ? sessionList 
            : sessionList.filter(s => (s.class_name || 'No Class Assigned') === sessionClassFilter);

        return filtered.reduce((groups, session) => {
            const className = session.class_name || 'No Class Assigned';
            if (!groups[className]) groups[className] = [];
            groups[className].push(session);
            return groups;
        }, {});
    };

    const activeSessions = sessions.filter(s => s.status === 'active' && s.is_archived === 0);
    const completedSessions = sessions.filter(s => s.status === 'completed' || s.is_archived === 1);

    const activeGroups = groupSessionsByClass(activeSessions);
    const pastGroups = groupSessionsByClass(completedSessions);

    const displayedQuizzes = showAllQuizzes ? quizzes : quizzes.slice(0, 5);
    const displayedPastSessions = showAllPastSessions ? completedSessions : completedSessions.slice(0, 5);

    return (
        <div style={{ display: 'flex', gap: '2rem' }}>
            {/* Sidebar */}
            <aside style={{ width: '250px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <li>
                        <button onClick={() => setActiveTab('quizzes')} className={activeTab === 'quizzes' ? 'active-tab' : ''} style={tabStyle(activeTab === 'quizzes')}>
                            <LayoutDashboard size={20} /> My Quizzes
                        </button>
                    </li>
                    <li>
                        <button onClick={() => { setActiveTab('import'); setEditingQuizId(null); setTitle(''); setDescription(''); setQuestions([]); }} className={activeTab === 'import' ? 'active-tab' : ''} style={tabStyle(activeTab === 'import')}>
                            <PlusCircle size={20} /> Create / Edit
                        </button>
                    </li>
                    <li>
                        <button onClick={() => setActiveTab('community')} className={activeTab === 'community' ? 'active-tab' : ''} style={tabStyle(activeTab === 'community')}>
                            <Globe size={20} /> Community Library
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
                    <li>
                        <button onClick={() => setActiveTab('growth')} className={activeTab === 'growth' ? 'active-tab' : ''} style={tabStyle(activeTab === 'growth')}>
                            <LayoutDashboard size={20} /> Class Growth
                        </button>
                    </li>
                </ul>
            </aside>

            {/* Main Content */}
            <div style={{ flex: 1, backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>

                {activeTab === 'quizzes' && (
                    <div className="fade-in">
                        <h2>My Quizzes</h2>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                            {['All', ...new Set(quizzes.map(q => q.category).filter(Boolean))].map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => { setSelectedCategory(cat); fetchQuizzes(cat); }}
                                    style={{
                                        padding: '0.4rem 1rem',
                                        borderRadius: '2rem',
                                        border: `1px solid ${selectedCategory === cat ? 'var(--primary)' : 'var(--border)'}`,
                                        backgroundColor: selectedCategory === cat ? 'var(--primary)' : 'white',
                                        color: selectedCategory === cat ? 'white' : 'var(--text-main)',
                                        whiteSpace: 'nowrap',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        fontWeight: 600
                                    }}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                        {quizzes.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>No quizzes found in this category.</p>
                        ) : (
                            <div>
                                <div style={{ display: 'grid', gap: '1rem', marginTop: '1.5rem' }}>
                                    {displayedQuizzes.map(q => (
                                        <div key={q.id} style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <h3 style={{ margin: 0 }}>{q.title}</h3>
                                                    {q.is_shared === 1 && <span style={{ padding: '0.15rem 0.4rem', backgroundColor: '#DBEAFE', color: '#1D4ED8', fontSize: '0.7rem', borderRadius: '1rem', fontWeight: 600 }}>Shared</span>}
                                                    <span style={{ padding: '0.15rem 0.4rem', backgroundColor: '#F3F4F6', color: '#4B5563', fontSize: '0.7rem', borderRadius: '1rem', fontWeight: 600 }}>{q.category || 'General'}</span>
                                                </div>
                                                <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 0 0' }}>{q.description}</p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                {confirmDeleteId === q.id ? (
                                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', backgroundColor: '#FEF2F2', padding: '0.25rem', borderRadius: 'var(--radius-md)', border: '1px solid #FECACA' }}>
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#DC2626', padding: '0 0.5rem' }}>Delete?</span>
                                                        <button onClick={() => handleDeleteQuiz(q.id)} style={{ backgroundColor: '#DC2626', color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}>Yes</button>
                                                        <button onClick={() => setConfirmDeleteId(null)} style={{ backgroundColor: 'transparent', color: '#6B7280', border: '1px solid #D1D5DB', padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem' }}>No</button>
                                                    </div>
                                                ) : (
                                                    <button onClick={() => setConfirmDeleteId(q.id)} style={{ backgroundColor: 'transparent', color: '#6B7280', border: '1px solid #D1D5DB', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Delete Quiz">
                                                        <Trash2 size={18} />
                                                    </button>
                                                )}
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
                                                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                                            <div
                                                                onClick={() => setSessionMode('live')}
                                                                style={{
                                                                    flex: 1,
                                                                    padding: '1rem',
                                                                    borderRadius: 'var(--radius-md)',
                                                                    border: `2px solid ${sessionMode === 'live' ? 'var(--primary)' : 'var(--border)'}`,
                                                                    backgroundColor: sessionMode === 'live' ? '#EEF2FF' : 'white',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s',
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    gap: '0.5rem',
                                                                    alignItems: 'center',
                                                                    textAlign: 'center'
                                                                }}
                                                            >
                                                                <Play size={24} color={sessionMode === 'live' ? 'var(--primary)' : 'var(--text-muted)'} />
                                                                <div>
                                                                    <div style={{ fontWeight: 700, fontSize: '1rem', color: sessionMode === 'live' ? 'var(--primary)' : 'var(--text-main)' }}>Live Session</div>
                                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Teacher-paced classroom experience</div>
                                                                </div>
                                                            </div>
                                                            <div
                                                                onClick={() => setSessionMode('async')}
                                                                style={{
                                                                    flex: 1,
                                                                    padding: '1rem',
                                                                    borderRadius: 'var(--radius-md)',
                                                                    border: `2px solid ${sessionMode === 'async' ? 'var(--primary)' : 'var(--border)'}`,
                                                                    backgroundColor: sessionMode === 'async' ? '#EEF2FF' : 'white',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s',
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    gap: '0.5rem',
                                                                    alignItems: 'center',
                                                                    textAlign: 'center'
                                                                }}
                                                            >
                                                                <Clock size={24} color={sessionMode === 'async' ? 'var(--primary)' : 'var(--text-muted)'} />
                                                                <div>
                                                                    <div style={{ fontWeight: 700, fontSize: '1rem', color: sessionMode === 'async' ? 'var(--primary)' : 'var(--text-main)' }}>Async Session</div>
                                                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Student-paced homework or review</div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={shuffleOptions}
                                                                    onChange={(e) => setShuffleOptions(e.target.checked)}
                                                                />
                                                                Shuffle Options
                                                            </label>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 600 }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isTeamMode}
                                                                    onChange={(e) => setIsTeamMode(e.target.checked)}
                                                                />
                                                                Enable Team Mode
                                                            </label>
                                                        </div>
                                                        {sessionMode === 'async' && (
                                                            <>
                                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
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
                                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={randomizeQuestions}
                                                                            onChange={(e) => setRandomizeQuestions(e.target.checked)}
                                                                        />
                                                                        Randomize Questions
                                                                    </label>
                                                                </div>
                                                            </>
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
                                {quizzes.length > 5 && (
                                    <button
                                        onClick={() => setShowAllQuizzes(!showAllQuizzes)}
                                        style={{ marginTop: '1rem', width: '100%', padding: '0.75rem', backgroundColor: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                                    >
                                        {showAllQuizzes ? 'Collapse List ▲' : `Show All Quizzes (${quizzes.length}) ▼`}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'community' && (
                    <div className="fade-in">
                        <h2>Discover Community Quizzes</h2>
                        <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 1rem 0' }}>Explore quizzes created by other teachers that you can import and use.</p>

                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                            {['All', ...new Set(communityQuizzes.map(q => q.category).filter(Boolean))].map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => { setCommunityCategory(cat); fetchCommunityQuizzes(cat); }}
                                    style={{
                                        padding: '0.4rem 1rem',
                                        borderRadius: '2rem',
                                        border: `1px solid ${communityCategory === cat ? 'var(--primary)' : 'var(--border)'}`,
                                        backgroundColor: communityCategory === cat ? 'var(--primary)' : 'white',
                                        color: communityCategory === cat ? 'white' : 'var(--text-main)',
                                        whiteSpace: 'nowrap',
                                        cursor: 'pointer',
                                        fontSize: '0.9rem',
                                        fontWeight: 600
                                    }}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>

                        {communityQuizzes.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)' }}>No community quizzes found in this category.</p>
                        ) : (
                            <div style={{ display: 'grid', gap: '1rem' }}>
                                {communityQuizzes.map(q => (
                                    <div key={q.id} style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <h3 style={{ margin: 0, color: 'var(--text-main)' }}>{q.title}</h3>
                                                <span style={{ padding: '0.15rem 0.4rem', backgroundColor: '#F3F4F6', color: '#4B5563', fontSize: '0.7rem', borderRadius: '1rem', fontWeight: 600 }}>{q.category || 'General'}</span>
                                            </div>
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2>{editingQuizId ? 'Edit Quiz Visual Builder' : 'Create Quiz Visual Builder'}</h2>
                            {editingQuizId && (
                                <button onClick={cancelEdit} style={{ backgroundColor: '#F3F4F6', color: '#374151', border: 'none', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>Cancel Edit</button>
                            )}
                        </div>
                        <form onSubmit={handleSaveQuiz} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Quiz Title</label>
                                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="E.g., Intro to Algebra" style={inputStyle} required />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Category / Folder</label>
                                    <input type="text" value={quizCategory} onChange={e => setQuizCategory(e.target.value)} placeholder="E.g., Algebra, Year 7" style={inputStyle} list="category-suggestions" />
                                    <datalist id="category-suggestions">
                                        {[...new Set(quizzes.map(q => q.category).filter(Boolean))].map(cat => <option key={cat} value={cat} />)}
                                    </datalist>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Description</label>
                                    <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this quiz about?" style={inputStyle} />
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', marginTop: '1rem' }}>
                                <h3 style={{ margin: 0 }}>Questions ({questions.length})</h3>
                                <button type="button" onClick={() => setShowBulkImportModal(true)} style={{ padding: '0.5rem 1rem', backgroundColor: '#DBEAFE', color: '#1D4ED8', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer' }}>
                                    Bulk Import Text
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                {questions.map((q, index) => (
                                    <div key={q.id} style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', backgroundColor: 'white', position: 'relative' }}>
                                        <button type="button" onClick={() => removeQuestion(q.id)} style={{ position: 'absolute', top: '1rem', right: '1rem', backgroundColor: 'transparent', color: '#EF4444', border: 'none', cursor: 'pointer' }}>
                                            <Trash2 size={20} />
                                        </button>
                                        <h4 style={{ margin: '0 0 1rem 0' }}>Question {index + 1}</h4>
                                        <div style={{ display: 'grid', gap: '1rem' }}>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Question Text</label>
                                                <input type="text" value={q.text} onChange={e => updateQuestion(q.id, 'text', e.target.value)} placeholder="Type question here..." style={inputStyle} />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Image URL (Optional)</label>
                                                <input type="text" value={q.image_url} onChange={e => updateQuestion(q.id, 'image_url', e.target.value)} placeholder="https://example.com/image.jpg" style={inputStyle} />
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                                <div>
                                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Code Snippet (Optional)</label>
                                                    <textarea value={q.code_snippet} onChange={e => updateQuestion(q.id, 'code_snippet', e.target.value)} placeholder="def hello_world():&#10;    print('Hello')" style={{ ...inputStyle, minHeight: '100px', fontFamily: 'monospace' }} onKeyDown={e => {
                                                        if (e.key === 'Tab') {
                                                            e.preventDefault();
                                                            const start = e.target.selectionStart;
                                                            const end = e.target.selectionEnd;
                                                            const value = e.target.value;
                                                            updateQuestion(q.id, 'code_snippet', value.substring(0, start) + "    " + value.substring(end));
                                                        }
                                                    }} />
                                                </div>
                                                <div>
                                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Code Language</label>
                                                    <select value={q.code_language} onChange={e => updateQuestion(q.id, 'code_language', e.target.value)} style={inputStyle}>
                                                        <option value="">None / Auto</option>
                                                        <option value="python">Python</option>
                                                        <option value="javascript">JavaScript</option>
                                                        <option value="plaintext">CAIE Pseudocode</option>
                                                        <option value="html">HTML/CSS</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Answer Explanation (Optional)</label>
                                                <textarea value={q.explanation || ''} onChange={e => updateQuestion(q.id, 'explanation', e.target.value)} placeholder="Explain why the correct answer is correct. This is shown to students after the quiz." style={{ ...inputStyle, minHeight: '60px' }} />
                                            </div>

                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', marginTop: '1rem' }}>
                                                    <label style={{ fontWeight: 500, margin: 0 }}>Options</label>
                                                    <button type="button" onClick={() => addOption(q.id)} style={{ padding: '0.25rem 0.5rem', backgroundColor: '#F3F4F6', color: '#374151', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: '0.8rem' }}>+ Add Option</button>
                                                </div>
                                                {q.options.map((opt, optIndex) => (
                                                    <div key={optIndex} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleCorrectOption(q.id, optIndex)}
                                                            style={{
                                                                width: '24px', height: '24px', borderRadius: '50%', border: `2px solid ${opt.is_correct ? '#10B981' : '#D1D5DB'}`,
                                                                backgroundColor: opt.is_correct ? '#10B981' : 'transparent', cursor: 'pointer', flexShrink: 0
                                                            }}
                                                            title="Toggle Correct Answer"
                                                        />
                                                        <input type="text" value={opt.text} onChange={e => updateOption(q.id, optIndex, e.target.value)} placeholder={`Option ${optIndex + 1}`} style={inputStyle} />
                                                        <button type="button" onClick={() => removeOption(q.id, optIndex)} style={{ backgroundColor: 'transparent', color: '#EF4444', border: 'none', cursor: 'pointer', padding: '0.5rem' }}>
                                                            X
                                                        </button>
                                                    </div>
                                                ))}
                                                {q.options.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>No options added. Question will be invalid if left empty.</p>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <button type="button" onClick={addQuestion} style={{ padding: '1rem', backgroundColor: '#F8FAFC', border: '2px dashed #CBD5E1', borderRadius: 'var(--radius-md)', color: '#475569', fontWeight: 600, cursor: 'pointer', marginTop: '1rem', textAlign: 'center' }}>
                                + Add New Question
                            </button>

                            <button type="submit" disabled={saving} style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '1rem', borderRadius: 'var(--radius-md)', fontWeight: 'bold', fontSize: '1rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, marginTop: '1rem' }}>
                                {saving ? 'Saving...' : (editingQuizId ? 'Update Quiz' : 'Create Quiz')}
                            </button>
                        </form>
                    </div>
                )}

                {activeTab === 'sessions' && (
                    <div className="fade-in">
                        <h2>Live Sessions Management</h2>
                        <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 1.5rem 0' }}>Monitor active sessions and review past results.</p>

                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                            {['All', 'No Class Assigned', ...classes.map(c => c.name)].map(clsName => (
                                <button
                                    key={clsName}
                                    onClick={() => setSessionClassFilter(clsName)}
                                    style={{
                                        padding: '0.4rem 1rem',
                                        borderRadius: '2rem',
                                        border: `1px solid ${sessionClassFilter === clsName ? 'var(--primary)' : 'var(--border)'}`,
                                        backgroundColor: sessionClassFilter === clsName ? 'var(--primary)' : 'white',
                                        color: sessionClassFilter === clsName ? 'white' : 'var(--text-main)',
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

                        <div style={{ marginBottom: '2.5rem' }}>
                            <h3 style={{ borderBottom: '2px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Active Sessions</h3>
                            {activeSessions.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>No active live sessions.</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '1rem' }}>
                                    {Object.entries(activeGroups).map(([className, classSessions]) => (
                                        <div key={className}>
                                            <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', borderLeft: '3px solid var(--primary)', paddingLeft: '0.75rem' }}>
                                                {className}
                                            </h4>
                                            <div style={{ display: 'grid', gap: '1rem' }}>
                                                {classSessions.map(s => (
                                                    <div key={s.id} style={{ padding: '1.5rem', border: '1px solid var(--primary)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#EFF6FF' }}>
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                                                <h3 style={{ margin: 0, color: 'var(--primary)' }}>{s.name || s.quiz_title}</h3>
                                                                <span style={{
                                                                    padding: '0.25rem 0.5rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase',
                                                                    backgroundColor: '#DBEAFE', color: '#1E40AF'
                                                                }}>
                                                                    Live Now
                                                                </span>
                                                            </div>
                                                            <p style={{ color: 'var(--text-main)', margin: '0.25rem 0', fontSize: '1rem', fontWeight: 600 }}>
                                                                Join Code: <span style={{ fontFamily: 'monospace', fontSize: '1.2rem', padding: '0.2rem 0.4rem', backgroundColor: '#E5E7EB', borderRadius: '4px' }}>{s.join_code}</span>
                                                            </p>
                                                            <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>Started: {new Date(s.created_at).toLocaleString()}</p>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                            <button onClick={() => navigate(`/teacher/present/${s.id}`)} style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                                <LayoutDashboard size={18} /> Presentation View
                                                            </button>
                                                            <button onClick={() => archiveSession(s.id)} style={{ backgroundColor: 'transparent', color: '#6B7280', border: '1px solid #D1D5DB', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, display: 'flex', gap: '0.5rem', alignItems: 'center' }} title="End Session and Move to Archives">
                                                                <Archive size={18} />
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

                        <div>
                            <h3 style={{ borderBottom: '2px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Completed / Archived Sessions</h3>
                            {completedSessions.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>No past sessions found.</p>
                            ) : (
                                <div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '1rem' }}>
                                        {Object.entries(pastGroups).map(([className, classSessions]) => (
                                            <div key={className}>
                                                <h4 style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', borderLeft: '3px solid var(--secondary)', paddingLeft: '0.75rem' }}>
                                                    {className}
                                                </h4>
                                                <div style={{ display: 'grid', gap: '1rem' }}>
                                                    {(showAllPastSessions ? classSessions : classSessions.slice(0, 5)).map(s => (
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
                                            </div>
                                        ))}
                                    </div>
                                    {completedSessions.length > 5 && (
                                        <button
                                            onClick={() => setShowAllPastSessions(!showAllPastSessions)}
                                            style={{ marginTop: '1.5rem', width: '100%', padding: '0.75rem', backgroundColor: '#F8FAFC', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                                        >
                                            {showAllPastSessions ? 'Collapse List ▲' : `Show All Past Sessions (${completedSessions.length}) ▼`}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'classes' && (
                    <div className="fade-in">
                        <h2>Class Management</h2>
                        <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 1.5rem 0' }}>Create classes, add students, and organize your cohorts.</p>

                        {!selectedClassRaw ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '2rem' }}>
                                <div>
                                    <div style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', backgroundColor: '#F8FAFC' }}>
                                        <h3 style={{ marginTop: 0, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><PlusCircle size={18} /> Create New Class</h3>
                                        <form onSubmit={handleCreateClass} style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column' }}>
                                            <input type="text" placeholder="Class Name (e.g., Year 10 Math)" value={newClassName} onChange={e => setNewClassName(e.target.value)} style={inputStyle} required />
                                            <button type="submit" style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '0.75rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600 }}>Create Class</button>
                                        </form>
                                    </div>
                                </div>

                                <div>
                                    <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Your Classes</h3>
                                    {classes.length === 0 ? (
                                        <p style={{ color: 'var(--text-muted)' }}>You haven't created any classes yet.</p>
                                    ) : (
                                        <div style={{ display: 'grid', gap: '1rem' }}>
                                            {classes.map(cls => (
                                                <div key={cls.id} style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', transition: 'border-color 0.2s' }} onClick={() => handleSelectClass(cls)} onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--primary)'} onMouseOut={(e) => e.currentTarget.style.borderColor = 'var(--border)'}>
                                                    <div>
                                                        <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.1rem' }}>{cls.name}</h3>
                                                        <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.9rem' }}>{cls.student_count || 0} Students Enrolled</p>
                                                    </div>
                                                    <ChevronLeft size={20} style={{ transform: 'rotate(180deg)', color: 'var(--text-muted)' }} />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="fade-in">
                                <button onClick={() => setSelectedClassRaw(null)} style={{ background: 'transparent', border: 'none', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', padding: 0, marginBottom: '1.5rem', fontWeight: 600 }}>
                                    <ChevronLeft size={16} /> Back to Classes
                                </button>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                    <div>
                                        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>{selectedClassRaw.name}</h2>
                                        <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0' }}>Managed Roster</p>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            setSessionClassFilter(selectedClassRaw.name);
                                            setActiveTab('sessions');
                                        }}
                                        style={{ 
                                            backgroundColor: 'transparent', 
                                            color: 'var(--secondary)', 
                                            border: '1px solid var(--secondary)', 
                                            padding: '0.5rem 1rem', 
                                            borderRadius: 'var(--radius-md)', 
                                            cursor: 'pointer', 
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem'
                                        }}
                                    >
                                        <History size={18} /> View Session History
                                    </button>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                    <div>
                                        <h3 style={{ marginTop: 0, marginBottom: '1rem', borderBottom: '2px solid var(--border)', paddingBottom: '0.5rem' }}>Enrolled Students ({classStudents.length})</h3>
                                        {classStudents.length === 0 ? (
                                            <p style={{ color: 'var(--text-muted)' }}>No students enrolled in this class yet.</p>
                                        ) : (
                                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {classStudents.map(student => (
                                                    <li key={student.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#DBEAFE', color: '#1D4ED8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                                                                {student.username.substring(0, 2).toUpperCase()}
                                                            </div>
                                                            <span style={{ fontWeight: 500 }}>{student.username}</span>
                                                        </div>
                                                        <button onClick={() => handleRemoveStudentFromClass(student.id)} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '0.25rem' }} title="Remove Student">
                                                            <UserMinus size={18} />
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>

                                    <div>
                                        <h3 style={{ marginTop: 0, marginBottom: '1rem', borderBottom: '2px solid var(--border)', paddingBottom: '0.5rem' }}>Add Students</h3>
                                        <div style={{ position: 'relative', marginBottom: '1rem' }}>
                                            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                            <input
                                                type="text"
                                                placeholder="Search students by username..."
                                                value={studentSearchQuery}
                                                onChange={e => setStudentSearchQuery(e.target.value)}
                                                style={{ ...inputStyle, paddingLeft: '2.5rem' }}
                                            />
                                        </div>

                                        {studentSearchQuery.length >= 2 && (
                                            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                                                {studentSearchResults.length === 0 ? (
                                                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>No unregistered students found matching query.</div>
                                                ) : (
                                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                                        {studentSearchResults.map(student => (
                                                            <li key={student.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', backgroundColor: 'white' }}>
                                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                    <span style={{ fontWeight: 600 }}>{student.username}</span>
                                                                    {student.form_class && (
                                                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Class: {student.form_class}</span>
                                                                    )}
                                                                </div>
                                                                <button onClick={() => handleAddStudentToClass(student.id)} style={{ backgroundColor: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', padding: '0.25rem 0.5rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
                                                                    <UserPlus size={14} /> Add
                                                                </button>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </div>
                                        )}
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '1rem' }}>
                                            Type at least 2 characters to search for students that exist in the system but are not yet enrolled in this class.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'growth' && (
                    <div className="fade-in">
                        <TeacherGrowthView user={user} classes={classes} />
                    </div>
                )}

            </div >

            {/* Bulk Import Modal */}
            {showBulkImportModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="fade-in" style={{ backgroundColor: 'white', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '90%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h2 style={{ marginTop: 0 }}>Bulk Import Text</h2>
                        <p style={{ color: 'var(--text-muted)' }}>Paste raw text. Separate questions with numbers (e.g. 1. or Q1:). Mark correct answers with * or (correct). Add images using [IMG: url].</p>
                        <textarea
                            value={bulkImportText}
                            onChange={(e) => setBulkImportText(e.target.value)}
                            placeholder="1. What is 2+2?
* A) 4
B) 5"
                            style={{ ...inputStyle, minHeight: '300px', fontFamily: 'monospace', width: '100%', marginBottom: '1rem' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                            <button onClick={() => setShowBulkImportModal(false)} style={{ padding: '0.75rem 1.5rem', border: 'none', backgroundColor: '#F3F4F6', cursor: 'pointer', borderRadius: 'var(--radius-md)' }}>Cancel</button>
                            <button onClick={handleBulkImportProcess} style={{ padding: '0.75rem 1.5rem', border: 'none', backgroundColor: 'var(--secondary)', color: 'white', cursor: 'pointer', borderRadius: 'var(--radius-md)', fontWeight: 'bold' }}>Import to Builder</button>
                        </div>
                    </div>
                </div>
            )}
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
