import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, Globe, Play, Users, Settings, Trash2, Edit, PlayCircle, Clock, CheckCircle2, AlertCircle, Share2, Search, Filter, ChevronRight, ChevronLeft, Calendar, BarChart3, Key, Download, Archive, CheckCircle, UserPlus, UserMinus, History, Copy, KeyRound, TrendingUp, X, Database, ClipboardList, Lightbulb, BookOpenText } from 'lucide-react';
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
    const [expiresAt, setExpiresAt] = useState('');
    const [shuffleOptions, setShuffleOptions] = useState(false);
    const [isTeamMode, setIsTeamMode] = useState(false);

    const [showAllQuizzes, setShowAllQuizzes] = useState(false);
    const [showAllPastSessions, setShowAllPastSessions] = useState(false);

    // Visual Builder State
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [quizSubject, setQuizSubject] = useState('');
    const [quizLevel, setQuizLevel] = useState('');
    const [quizTopic, setQuizTopic] = useState('');
    const [quizCategory, setQuizCategory] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [kahootQuiz, setKahootQuiz] = useState(null); // For Kahoot Export Modal
    const [communityCategory, setCommunityCategory] = useState('All');
    
    // Practice Stats
    const [showPracticeStats, setShowPracticeStats] = useState(null); // quizId
    const [practiceStats, setPracticeStats] = useState([]);
    const [loadingStats, setLoadingStats] = useState(false);
    const [expandedCode, setExpandedCode] = useState({});
    const [previewQuiz, setPreviewQuiz] = useState(null);

    // Community Navigation State
    const [selectedSubject, setSelectedSubject] = useState(null);
    const [selectedLevel, setSelectedLevel] = useState(null);
    const [selectedTopic, setSelectedTopic] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [saving, setSaving] = useState(false);
    const [editingQuizId, setEditingQuizId] = useState(null);
    const [sessionClassFilter, setSessionClassFilter] = useState('All');

    // Bulk Import Modal
    const [showBulkImportModal, setShowBulkImportModal] = useState(false);
    const [bulkImportText, setBulkImportText] = useState('');
    
    // Bank Tab State
    const [bankSearchTerm, setBankSearchTerm] = useState('');
    const [bankSubject, setBankSubject] = useState('');
    const [bankLevel, setBankLevel] = useState('');
    const [bankTopic, setBankTopic] = useState('');
    const [bankResults, setBankResults] = useState([]);
    const [bankLoading, setBankLoading] = useState(false);
    const [showBankImport, setShowBankImport] = useState(false);
    const [bankImportText, setBankImportText] = useState('');
    const [hasSearchedBank, setHasSearchedBank] = useState(false);
    const [bankDisplayLimit, setBankDisplayLimit] = useState(20);

    // Class Management State

    const [classes, setClasses] = useState([]);
    const [newClassName, setNewClassName] = useState('');
    const [selectedClassRaw, setSelectedClassRaw] = useState(null);
    const [classStudents, setClassStudents] = useState([]);

    // Class Class Search
    const [studentSearchQuery, setStudentSearchQuery] = useState('');
    const [studentSearchResults, setStudentSearchResults] = useState([]);

    // Password Management
    const [newPasswordValue, setNewPasswordValue] = useState('');
    const [confirmPasswordValue, setConfirmPasswordValue] = useState('');
    
    // Student Password Reset Modal
    const [resetStudent, setResetStudent] = useState(null); // { id, username }
    const [studentNewPassword, setStudentNewPassword] = useState('');

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

    useEffect(() => {
        if (showPracticeStats) {
            fetchPracticeStats(showPracticeStats);
        }
    }, [showPracticeStats]);

    useEffect(() => {
        setBankDisplayLimit(20);
        const timeout = setTimeout(() => {
            // Require keyword to be present to search automatically, preventing enormous default lists
            if (bankSearchTerm.trim().length > 0) {
                handleBankSearch();
            } else {
                setBankResults([]);
                setHasSearchedBank(false);
            }
        }, 300);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bankSearchTerm, bankSubject, bankLevel, bankTopic]);

    const fetchPracticeStats = async (quizId) => {
        setLoadingStats(true);
        try {
            const res = await fetch(`/api/quizzes/${quizId}/practice-stats`, {
                headers: { 'x-user-id': user.id, 'x-user-role': user.role }
            });
            if (res.ok) {
                const data = await res.json();
                setPracticeStats(data);
            }
        } catch (error) {
            console.error('Error fetching practice stats:', error);
        } finally {
            setLoadingStats(false);
        }
    };

    const handleResetPractice = async (quizId) => {
        if (!window.confirm('Are you sure you want to reset the practice leaderboard for this quiz? All current student practice scores will be permanently deleted.')) {
            return;
        }

        try {
            const res = await fetch(`/api/quizzes/${quizId}/practice`, {
                method: 'DELETE',
                headers: { 'x-user-id': user.id, 'x-user-role': user.role }
            });
            if (res.ok) {
                toast.success('Practice leaderboard has been reset');
                fetchPracticeStats(quizId);
            } else {
                const errorData = await res.json();
                toast.error(`Error: ${errorData.error}`);
            }
        } catch (error) {
            console.error('Error resetting practice stats:', error);
            toast.error('Failed to reset leaderboard');
        }
    };

    const getQuizGroupingLabel = (quiz) => quiz.topic || quiz.category || 'General';

    const fetchQuizzes = async () => {
        try {
            const res = await fetch(`/api/quizzes?authorId=${user.id}`, {
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

    const handleBankSearch = async (e) => {
        if (e) e.preventDefault();
        setHasSearchedBank(true);
        setBankLoading(true);
        try {
            const query = new URLSearchParams();
            if (bankSearchTerm) query.append('q', bankSearchTerm);
            if (bankSubject) query.append('subject', bankSubject);
            if (bankLevel) query.append('level', bankLevel);
            if (bankTopic) query.append('topic', bankTopic);

            const res = await fetch(`/api/bank/questions?${query.toString()}`, {
                headers: {
                    'x-user-id': user.id,
                    'x-user-role': user.role
                }
            });
            if (res.ok) {
                const data = await res.json();
                setBankResults(Array.isArray(data) ? data : []);
            } else {
                toast.error('Failed to load bank questions');
            }
        } catch (e) {
            console.error(e);
            toast.error('Network error');
        } finally {
            setBankLoading(false);
        }
    };

    const handleBankImportProcess = async () => {
        if (!bankImportText.trim()) {
            toast.error("Please paste some text to import.");
            return;
        }
        
        try {
            const res = await fetch('/api/bank/import', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                    'x-user-role': user.role
                },
                body: JSON.stringify({
                    bulkText: bankImportText,
                    subject: bankSubject,
                    level: bankLevel,
                    topic: bankTopic
                })
            });

            if (res.ok) {
                const data = await res.json();
                toast.success(`Imported ${data.questionsImported} questions to the bank!`);
                setBankImportText('');
                setShowBankImport(false);
                if (hasSearchedBank) {
                    handleBankSearch();
                }
            } else {
                const data = await res.json();
                toast.error(`Error: ${data.error}`);
            }
        } catch (e) {
            console.error(e);
            toast.error("Network error");
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
                setQuizSubject(quiz.subject || '');
                setQuizLevel(quiz.level || '');
                setQuizTopic(quiz.topic || '');
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
                    subject: quizSubject || 'General',
                    level: quizLevel || 'General',
                    topic: quizTopic || 'General',
                    category: quizCategory || quizTopic || 'General',
                    questions: validQuestions,
                    authorId: user.id
                })
            });

            if (res.ok) {
                setTitle('');
                setDescription('');
                setQuizSubject('');
                setQuizLevel('');
                setQuizTopic('');
                setQuizCategory('');
                setQuestions([]);
                setEditingQuizId(null);
                fetchQuizzes();
                fetchCommunityQuizzes();
                toast.success(`Quiz ${editingQuizId ? 'Updated' : 'Created'}!`);
                setActiveTab('quizzes');
            } else if (res.status === 401) {
                toast.error('Session expired! Please open a new tab, log in again, and come back here to save your work.', { duration: 8000 });
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
        setQuizSubject('');
        setQuizLevel('');
        setQuizTopic('');
        setQuizCategory('');
        setQuestions([]);
        setEditingQuizId(null);
        setActiveTab('quizzes');
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (newPasswordValue !== confirmPasswordValue) {
            return toast.error("Passwords do not match!");
        }
        if (newPasswordValue.length < 4) {
            return toast.error("Password must be at least 4 characters.");
        }
        try {
            const res = await fetch(`/api/users/${user.id}/password`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                    'x-user-role': user.role
                },
                body: JSON.stringify({ newPassword: newPasswordValue })
            });
            if (res.ok) {
                toast.success("Password updated successfully!");
                setNewPasswordValue('');
                setConfirmPasswordValue('');
            } else {
                const data = await res.json();
                toast.error(data.error || "Failed to update password");
            }
        } catch (err) {
            console.error(err);
            toast.error("Network error");
        }
    };

    const handleResetStudentPassword = async (e) => {
        e.preventDefault();
        if (!studentNewPassword || studentNewPassword.length < 4) {
            return toast.error("Password must be at least 4 characters.");
        }
        try {
            const res = await fetch(`/api/teachers/students/${resetStudent.id}/password`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                    'x-user-role': user.role
                },
                body: JSON.stringify({ newPassword: studentNewPassword })
            });
            if (res.ok) {
                toast.success(`Password for ${resetStudent.username} has been reset.`);
                setResetStudent(null);
                setStudentNewPassword('');
            } else {
                const data = await res.json();
                toast.error(data.error || "Failed to reset student password");
            }
        } catch (err) {
            console.error(err);
            toast.error("Network error");
        }
    };

    const handleCopyPrompt = () => {
        const promptText = `I am building a quiz. Please act as an expert educator and generate 5 specialized multiple-choice questions about [YOUR TOPIC HERE]. You MUST rigidly follow this strict text format for every question. Do not use markdown backticks, just raw text.

Format rules:
1. Each question starts with a number (e.g., 1. What is...)
2. Options are letters (A) B) C) D))
3. The correct option MUST be prefixed with an asterisk (* A) Option)
4. (Optional) Explanations must be at the very bottom of the question, prefixed with [EXP:
5. (Optional) Code blocks must be wrapped in [CODE: language] and [/CODE]

Example Output:
1. What does the following code output?
[CODE: python]
def greet(name):
    print(f"Hello {name}")
greet("World")
[/CODE]
A) Hello
* B) Hello World
C) Error
[EXP: The function prints Hello World]`;

        // Modern Clipboard API (Requires Secure Context / HTTPS)
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(promptText)
                .then(() => toast.success("AI Prompt copied to clipboard!"))
                .catch(err => {
                    console.error("Clipboard API failed:", err);
                    fallbackCopy(promptText);
                });
        } else {
            // Fallback for non-secure contexts (HTTP)
            fallbackCopy(promptText);
        }
    };

    const fallbackCopy = (text) => {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            // Prevent scrolling to bottom
            textArea.style.top = "0";
            textArea.style.left = "0";
            textArea.style.position = "fixed";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            if (successful) {
                toast.success("AI Prompt copied! (Used compatibility mode)");
            } else {
                toast.error("Failed to copy. Please manually copy the text.");
            }
        } catch (err) {
            console.error("Fallback copy failed:", err);
            toast.error("Manual copy required for this browser.");
        }
    };

    const handleBulkImportProcess = () => {
        if (!bulkImportText.trim()) {
            toast.error("Please paste some text to import.");
            return;
        }

        const lines = bulkImportText.replace(/\r\n/g, '\n').split('\n');
        const newQuestions = [...questions];

        let currentQuestion = null;
        let isParsingCode = false;

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const line = rawLine.trim();

            if (!isParsingCode && line === '') continue;

            if (isParsingCode) {
                if (/^\[\/CODE\]$/i.test(line)) {
                    isParsingCode = false;
                } else if (currentQuestion) {
                    currentQuestion.code_snippet += (currentQuestion.code_snippet ? '\n' : '') + rawLine;
                }
                continue;
            }

            const codeMatch = line.match(/^\[CODE:\s*(.*)\]$/i);
            if (codeMatch) {
                isParsingCode = true;
                if (currentQuestion) {
                    currentQuestion.code_language = codeMatch[1].trim();
                    currentQuestion.code_snippet = '';
                }
                continue;
            }

            const expMatch = line.match(/^\[EXP:\s*(.*)\]$/i) || line.match(/^Explanation:\s*(.*)$/i);
            if (expMatch && currentQuestion) {
                currentQuestion.explanation = expMatch[1].trim();
                continue;
            }

            const imgMatch = line.match(/^\[IMG:\s*(https?:\/\/[^\]]+)\]$/i);
            if (imgMatch) {
                if (currentQuestion && currentQuestion.options.length === 0) {
                    currentQuestion.image_url = imgMatch[1];
                }
                continue;
            }

            const isNewQuestion = /^\d+[\.\)]\s*/.test(line) || /^[Qq](uestion)?\s*\d+[\.\:]\s*/.test(line);

            if (isNewQuestion) {
                if (currentQuestion && currentQuestion.options.length > 0) {
                    // determine type
                    currentQuestion.type = 'multiple_choice';
                    if (currentQuestion.options.length === 1 && currentQuestion.options[0].is_correct) {
                        currentQuestion.type = 'short_answer';
                    }
                }

                let qText = line.replace(/^\d+[\.\)]\s*/, '').replace(/^[Qq](uestion)?\s*\d+[\.\:]\s*/, '').trim();
                currentQuestion = {
                    id: Date.now() + Math.random(),
                    text: qText,
                    type: 'multiple_choice',
                    image_url: '',
                    options: [],
                    code_snippet: '',
                    code_language: '',
                    explanation: ''
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
        }

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
            { id: Date.now(), text: '', type: 'multiple_choice', image_url: '', options: [{ text: '', is_correct: 0 }, { text: '', is_correct: 0 }], code_snippet: '', code_language: '' }
        ]);
    };

    const handleAddQuestionFromBank = (bankQuestion) => {
        const clonedQuestion = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            text: bankQuestion.text,
            type: bankQuestion.type || 'multiple_choice',
            image_url: bankQuestion.image_url || '',
            code_snippet: bankQuestion.code_snippet || '',
            code_language: bankQuestion.code_language || '',
            explanation: bankQuestion.explanation || '',
            options: (bankQuestion.options || []).map(opt => ({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                text: opt.text,
                is_correct: opt.is_correct ? 1 : 0
            }))
        };
        setQuestions(prev => [...prev, clonedQuestion]);
        toast.success('Question added to builder!');
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
        setExpiresAt('');         // Reset expiry
    };

    const confirmStartSession = async (quizId) => {
        if (!sessionName.trim()) return;

        if (!targetClassId) {
            toast.error('Please select a target class for this session.');
            return;
        }
        
        const payload = {
            quiz_id: quizId,
            mode: sessionMode,
            name: sessionName,
            class_id: targetClassId || null,
            time_limit: sessionTimer ? parseInt(sessionTimer) : null,
            randomize_questions: randomizeQuestions,
            shuffle_options: shuffleOptions,
            is_team_mode: isTeamMode,
            expires_at: expiresAt || null
        };

        try {
            const res = await fetch('/api/sessions', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                    'x-user-role': user.role
                },
                body: JSON.stringify(payload)
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

    const handleExportQuiz = async (quiz) => {
        try {
            const res = await fetch(`/api/quizzes/${quiz.id}/export`, {
                headers: {
                    'x-user-id': user.id,
                    'x-user-role': user.role
                }
            });
            if (res.ok) {
                const data = await res.json();
                const blob = new Blob([data.bulkText], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `quiz_export_${quiz.id}.txt`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success('Quiz exported to text file!');
            } else {
                toast.error('Failed to export quiz.');
            }
        } catch (e) {
            console.error(e);
            toast.error('Network error during export.');
        }
    };

    const handleKahootExport = (quiz) => {
        // Prepare CSV data for Kahoot spreadsheet template
        // Columns: Question, Answer 1, Answer 2, Answer 3, Answer 4, Time limit (sec), Correct answer(s)
        const header = ["Question", "Answer 1", "Answer 2", "Answer 3", "Answer 4", "Time limit (sec)", "Correct answer(s)"];
        const rows = quiz.questions.map(q => {
            const options = q.options || [];
            const correctIndices = options
                .map((opt, idx) => (opt.is_correct ? idx + 1 : null))
                .filter(idx => idx !== null)
                .join(",");
            
            return [
                `"${(q.text || "").replace(/"/g, '""')}"`,
                `"${(options[0]?.text || "").replace(/"/g, '""')}"`,
                `"${(options[1]?.text || "").replace(/"/g, '""')}"`,
                `"${(options[2]?.text || "").replace(/"/g, '""')}"`,
                `"${(options[3]?.text || "").replace(/"/g, '""')}"`,
                20, // Default Kahoot time limit
                `"${correctIndices}"`
            ];
        });

        const csvContent = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `${quiz.title.replace(/\s+/g, '_')}_Kahoot_Import.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success("Kahoot CSV ready! Copy these rows into the Kahoot Excel template.");
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

    const filteredQuizzes = selectedCategory === 'All'
        ? quizzes
        : quizzes.filter(q => getQuizGroupingLabel(q) === selectedCategory);
    const displayedQuizzes = showAllQuizzes ? filteredQuizzes : filteredQuizzes.slice(0, 5);
    const displayedPastSessions = showAllPastSessions ? completedSessions : completedSessions.slice(0, 5);

    const handlePreviewQuiz = async (quiz) => {
        const loadToast = toast.loading('Loading preview...');
        try {
            const res = await fetch(`/api/quizzes/${quiz.id}`, {
                headers: { 'x-user-id': user.id, 'x-user-role': user.role }
            });
            if (res.ok) {
                const data = await res.json();
                setPreviewQuiz(data);
                toast.dismiss(loadToast);
            } else {
                toast.dismiss(loadToast);
                toast.error('Failed to load quiz details.');
            }
        } catch (e) {
            console.error(e);
            toast.dismiss(loadToast);
            toast.error('Network error during load.');
        }
    };

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
                        <button onClick={() => setActiveTab('questionBank')} className={activeTab === 'questionBank' ? 'active-tab' : ''} style={tabStyle(activeTab === 'questionBank')}>
                            <Database size={20} /> Question Bank
                        </button>
                    </li>
                    <li>
                        <button onClick={() => setActiveTab('sessions')} className={activeTab === 'sessions' ? 'active-tab' : ''} style={tabStyle(activeTab === 'sessions')}>
                            <Play size={20} /> Manage Sessions
                        </button>
                    </li>
                    <li>
                        <button onClick={() => navigate('/teacher/exit-tickets')} style={tabStyle(false)}>
                            <ClipboardList size={20} /> Exit Tickets
                        </button>
                    </li>
                    <li>
                        <button onClick={() => navigate('/teacher/quick-checks')} style={tabStyle(false)}>
                            <Lightbulb size={20} /> Quick Checks
                        </button>
                    </li>
                    <li>
                        <button onClick={() => navigate('/teacher/long-answer')} style={tabStyle(false)}>
                            <BookOpenText size={20} /> Long Answer
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
                    <li>
                        <button onClick={() => setActiveTab('settings')} className={activeTab === 'settings' ? 'active-tab' : ''} style={tabStyle(activeTab === 'settings')}>
                            <Settings size={20} /> Settings
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
                            {['All', ...new Set(quizzes.map(getQuizGroupingLabel).filter(Boolean))].map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
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
                        {filteredQuizzes.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>No quizzes found in this category.</p>
                        ) : (
                            <div>
                                <div style={{ display: 'grid', gap: '1rem', marginTop: '1.5rem' }}>
                                    {displayedQuizzes.map(q => (
                                        <div key={q.id} style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '1.25rem', backgroundColor: 'white' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)' }}>{q.title}</h3>
                                                    {q.is_shared === 1 && <span style={{ padding: '0.15rem 0.5rem', backgroundColor: '#DBEAFE', color: '#1D4ED8', fontSize: '0.75rem', borderRadius: '1rem', fontWeight: 600 }}>Shared</span>}
                                                    {q.level && q.level !== 'General' && <span style={{ padding: '0.15rem 0.5rem', backgroundColor: '#E0E7FF', color: '#4338CA', fontSize: '0.75rem', borderRadius: '1rem', fontWeight: 600 }}>Level: {q.level}</span>}
                                                    <span style={{ padding: '0.15rem 0.5rem', backgroundColor: '#F3F4F6', color: '#4B5563', fontSize: '0.75rem', borderRadius: '1rem', fontWeight: 600 }}>{getQuizGroupingLabel(q)}</span>
                                                </div>
                                                <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 0 0', fontSize: '0.95rem' }}>{q.description}</p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', paddingTop: '1rem', borderTop: '1px solid #E5E7EB' }}>
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
                                                <button onClick={() => handlePreviewQuiz(q)} style={{ backgroundColor: 'white', color: '#0EA5E9', border: '1px solid #0EA5E9', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>
                                                    Preview
                                                </button>
                                                <button onClick={() => {
                                                    // Ensure we have full quiz data with questions for Kahoot export
                                                    if (!q.questions) {
                                                        const loadToast = toast.loading('Preparing Kahoot Export...');
                                                        fetch(`/api/quizzes/${q.id}`, {
                                                            headers: { 'x-user-id': user.id, 'x-user-role': user.role }
                                                        })
                                                        .then(r => r.json())
                                                        .then(fullQuiz => {
                                                            toast.dismiss(loadToast);
                                                            setKahootQuiz(fullQuiz);
                                                        })
                                                        .catch(err => {
                                                            toast.dismiss(loadToast);
                                                            toast.error('Failed to prepare export.');
                                                            console.error(err);
                                                        });
                                                    } else {
                                                        setKahootQuiz(q);
                                                    }
                                                }} style={{ backgroundColor: '#46178F', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>K!</span> Kahoot
                                                </button>
                                                <button onClick={() => toggleShare(q.id, q.is_shared === 1)} style={{ backgroundColor: 'transparent', color: q.is_shared === 1 ? '#D97706' : 'var(--primary)', border: `1px solid ${q.is_shared === 1 ? '#D97706' : 'var(--primary)'}`, padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>
                                                    {q.is_shared === 1 ? 'Unshare' : 'Share to Community'}
                                                </button>
                                                <button 
                                                    onClick={() => setShowPracticeStats(q.id)} 
                                                    style={{ 
                                                        backgroundColor: 'transparent', 
                                                        color: '#059669', 
                                                        border: '1px solid #059669', 
                                                        padding: '0.5rem 1rem', 
                                                        borderRadius: 'var(--radius-md)', 
                                                        cursor: 'pointer', 
                                                        fontWeight: 600,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.4rem'
                                                    }}
                                                >
                                                    <TrendingUp size={16} /> Practice Stats
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
                                                                    <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Auto-close at:</label>
                                                                    <input
                                                                        type="datetime-local"
                                                                        value={expiresAt}
                                                                        onChange={e => setExpiresAt(e.target.value)}
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
                                        {showAllQuizzes ? 'Collapse List ▲' : `Show All Quizzes (${filteredQuizzes.length}) ▼`}
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

                        {!selectedSubject && (
                            <div style={{ marginBottom: '2rem' }}>
                                <h3 style={{ borderBottom: '2px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Recently Added</h3>
                                <div style={{ display: 'grid', gap: '1rem' }}>
                                    {communityQuizzes.slice(0, 5).map(q => (
                                        <div key={`recent-${q.id}`} style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <h3 style={{ margin: 0, color: 'var(--text-main)' }}>{q.title}</h3>
                                                    {q.level && q.level !== 'General' && <span style={{ padding: '0.15rem 0.4rem', backgroundColor: '#E0E7FF', color: '#4338CA', fontSize: '0.7rem', borderRadius: '1rem', fontWeight: 600 }}>Level: {q.level}</span>}
                                                    <span style={{ padding: '0.15rem 0.4rem', backgroundColor: '#F3F4F6', color: '#4B5563', fontSize: '0.7rem', borderRadius: '1rem', fontWeight: 600 }}>{q.subject || 'General'}</span>
                                                </div>
                                                <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0.5rem 0', fontSize: '0.9rem' }}>Created by: <strong>{q.author_name || 'System'}</strong></p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button onClick={() => handlePreviewQuiz(q)} style={{ backgroundColor: 'white', color: '#0EA5E9', border: '1px solid #0EA5E9', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>
                                                    Preview
                                                </button>
                                                <button onClick={() => copyCommunityQuiz(q.id)} style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
                                                    <Download size={18} /> Import
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div style={{ backgroundColor: '#F8FAFC', padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                <button onClick={() => { setSelectedSubject(null); setSelectedLevel(null); setSelectedTopic(null); }} style={{ background: 'none', border: 'none', color: selectedSubject ? 'var(--primary)' : 'var(--text-main)', cursor: 'pointer', fontWeight: 600, padding: 0 }}>Subjects</button>
                                {selectedSubject && (
                                    <>
                                        <span style={{ color: 'var(--text-muted)' }}>/</span>
                                        <button onClick={() => { setSelectedLevel(null); setSelectedTopic(null); }} style={{ background: 'none', border: 'none', color: selectedLevel ? 'var(--primary)' : 'var(--text-main)', cursor: 'pointer', fontWeight: 600, padding: 0 }}>{selectedSubject}</button>
                                    </>
                                )}
                                {selectedLevel && (
                                    <>
                                        <span style={{ color: 'var(--text-muted)' }}>/</span>
                                        <button onClick={() => { setSelectedTopic(null); }} style={{ background: 'none', border: 'none', color: selectedTopic ? 'var(--primary)' : 'var(--text-main)', cursor: 'pointer', fontWeight: 600, padding: 0 }}>{selectedLevel}</button>
                                    </>
                                )}
                                {selectedTopic && (
                                    <>
                                        <span style={{ color: 'var(--text-muted)' }}>/</span>
                                        <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{selectedTopic}</span>
                                    </>
                                )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                                {!selectedSubject && [...new Set(communityQuizzes.map(q => q.subject || 'General'))].map(subject => (
                                    <div key={subject} onClick={() => setSelectedSubject(subject)} style={{ padding: '1.5rem', backgroundColor: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                        <span style={{ fontSize: '2rem' }}>📁</span>
                                        <strong style={{ textAlign: 'center' }}>{subject}</strong>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{communityQuizzes.filter(q => (q.subject || 'General') === subject).length} Quizzes</span>
                                    </div>
                                ))}

                                {selectedSubject && !selectedLevel && [...new Set(communityQuizzes.filter(q => (q.subject || 'General') === selectedSubject).map(q => q.level || 'General'))].map(level => (
                                    <div key={level} onClick={() => setSelectedLevel(level)} style={{ padding: '1.5rem', backgroundColor: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                        <span style={{ fontSize: '2rem' }}>📂</span>
                                        <strong style={{ textAlign: 'center' }}>{level}</strong>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{communityQuizzes.filter(q => (q.subject || 'General') === selectedSubject && (q.level || 'General') === level).length} Quizzes</span>
                                    </div>
                                ))}

                                {selectedSubject && selectedLevel && !selectedTopic && [...new Set(communityQuizzes.filter(q => (q.subject || 'General') === selectedSubject && (q.level || 'General') === selectedLevel).map(q => q.topic || 'General'))].map(topic => (
                                    <div key={topic} onClick={() => setSelectedTopic(topic)} style={{ padding: '1.5rem', backgroundColor: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                        <span style={{ fontSize: '2rem' }}>📄</span>
                                        <strong style={{ textAlign: 'center' }}>{topic}</strong>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{communityQuizzes.filter(q => (q.subject || 'General') === selectedSubject && (q.level || 'General') === selectedLevel && (q.topic || 'General') === topic).length} Quizzes</span>
                                    </div>
                                ))}
                            </div>

                            {selectedTopic && (
                                <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
                                    {communityQuizzes.filter(q => (q.subject || 'General') === selectedSubject && (q.level || 'General') === selectedLevel && (q.topic || 'General') === selectedTopic).map(q => (
                                        <div key={q.id} style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white' }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                                                    <h3 style={{ margin: 0, color: 'var(--text-main)' }}>{q.title}</h3>
                                                    {q.level && q.level !== 'General' && <span style={{ padding: '0.15rem 0.4rem', backgroundColor: '#E0E7FF', color: '#4338CA', fontSize: '0.7rem', borderRadius: '1rem', fontWeight: 600 }}>Level: {q.level}</span>}
                                                </div>
                                                <p style={{ color: 'var(--text-muted)', margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Created by: <strong>{q.author_name || 'System'}</strong></p>
                                                <p style={{ color: 'var(--text-main)', margin: 0 }}>{q.description}</p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button onClick={() => handlePreviewQuiz(q)} style={{ backgroundColor: 'white', color: '#0EA5E9', border: '1px solid #0EA5E9', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>
                                                    Preview
                                                </button>
                                                <button onClick={() => copyCommunityQuiz(q.id)} style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600 }}>
                                                    <Download size={18} /> Import
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'questionBank' && (
                    <div className="fade-in">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <div>
                                <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <Database size={28} color="#4F46E5" /> Question Bank
                                </h1>
                                <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 0 0' }}>Search and manage community-wide reusable questions.</p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                {questions.length > 0 && (
                                    <button onClick={() => setActiveTab('import')} style={{ backgroundColor: '#4F46E5', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-lg)', fontWeight: 800, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.4), 0 2px 4px -1px rgba(79, 70, 229, 0.2)' }}>
                                        <div style={{ backgroundColor: 'white', color: '#4F46E5', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>{questions.length}</div>
                                        Return to Builder
                                    </button>
                                )}
                                <button onClick={() => setShowBankImport(true)} style={{ backgroundColor: '#10B981', color: 'white', border: 'none', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                    <PlusCircle size={18} /> Add to Bank
                                </button>
                            </div>
                        </div>

                        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: 'var(--radius-lg)', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', marginBottom: '2rem' }}>
                            <form onSubmit={handleBankSearch} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                <div style={{ flex: '1 1 200px' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#4C1D95' }}>Search Text</label>
                                    <div style={{ position: 'relative' }}>
                                        <Search size={16} color="#64748B" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                        <input type="text" value={bankSearchTerm} onChange={e => setBankSearchTerm(e.target.value)} placeholder="Keywords..." style={{ ...inputStyle, paddingLeft: '2.2rem' }} />
                                    </div>
                                </div>
                                <div style={{ flex: '1 1 150px' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#4C1D95' }}>Level</label>
                                    <input type="text" value={bankLevel} onChange={e => setBankLevel(e.target.value)} placeholder="e.g. A Level" style={inputStyle} />
                                </div>
                                <div style={{ flex: '1 1 150px' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#4C1D95' }}>Subject</label>
                                    <input type="text" value={bankSubject} onChange={e => setBankSubject(e.target.value)} placeholder="e.g. Physics" style={inputStyle} />
                                </div>
                                <div style={{ flex: '1 1 150px' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#4C1D95' }}>Topic</label>
                                    <input type="text" value={bankTopic} onChange={e => setBankTopic(e.target.value)} placeholder="e.g. Kinematics" style={inputStyle} />
                                </div>
                                <button type="submit" disabled={bankLoading} style={{ backgroundColor: '#4F46E5', color: 'white', border: 'none', padding: '0.8rem 1.5rem', borderRadius: 'var(--radius-md)', fontWeight: 'bold', cursor: bankLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Filter size={18} /> {bankLoading ? 'Searching...' : 'Search'}
                                </button>
                            </form>
                        </div>

                        <div>
                            {!hasSearchedBank && !bankLoading && (
                                <div style={{ textAlign: 'center', padding: '4rem 2rem', backgroundColor: '#F8FAFC', borderRadius: 'var(--radius-lg)', border: '2px dashed #E2E8F0' }}>
                                    <Database size={48} color="#94A3B8" style={{ marginBottom: '1rem', display: 'inline-block' }} />
                                    <h3 style={{ color: '#475569', margin: '0 0 0.5rem 0' }}>Enter filters to search the bank</h3>
                                    <p style={{ color: '#64748B', margin: 0 }}>You can search by subject, level, topic, or keyword.</p>
                                </div>
                            )}

                            {hasSearchedBank && bankResults.length === 0 && !bankLoading && (
                                <div style={{ textAlign: 'center', padding: '4rem 2rem', backgroundColor: '#FEF2F2', borderRadius: 'var(--radius-lg)', border: '2px dashed #FECACA' }}>
                                    <h3 style={{ color: '#991B1B', margin: '0 0 0.5rem 0' }}>No Questions Found</h3>
                                    <p style={{ color: '#B91C1C', margin: 0 }}>Try broadening your search filters.</p>
                                </div>
                            )}

                            {hasSearchedBank && bankResults.length > 0 && (
                                <>
                                    <div style={{ display: 'grid', gap: '1.5rem' }}>
                                        {bankResults.slice(0, bankDisplayLimit).map((q) => (
                                        <div key={q.id} style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                                                <span style={{ backgroundColor: '#EEF2FF', color: '#4338CA', padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase' }}>{q.level || 'General'}</span>
                                                <span style={{ backgroundColor: '#F0FDF4', color: '#15803D', padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase' }}>{q.subject || 'General'}</span>
                                                <span style={{ backgroundColor: '#FEF2F2', color: '#B91C1C', padding: '0.2rem 0.6rem', borderRadius: '1rem', fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase' }}>{q.topic || 'General'}</span>
                                                <div style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#64748B' }}>From Quiz: <strong style={{ color: '#475569' }}>{q.quiz_title}</strong></div>
                                            </div>
                                            
                                            <p style={{ fontSize: '1.05rem', color: '#1E293B', fontWeight: 500, lineHeight: 1.6, marginBottom: '1rem', whiteSpace: 'pre-wrap' }}>{q.text}</p>
                                            
                                            {q.image_url && (
                                                <div style={{ marginBottom: '1rem', padding: '0.5rem', border: '1px dashed #CBD5E1', borderRadius: 'var(--radius-md)', display: 'inline-block' }}>
                                                    <img src={q.image_url} alt="Question media" style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain' }} />
                                                </div>
                                            )}
                                            
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                                                {q.options?.map((opt, i) => (
                                                    <div key={i} style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: opt.is_correct ? '#DEF7EC' : '#F8FAFC', border: `1px solid ${opt.is_correct ? '#31C48D' : '#E2E8F0'}`, color: opt.is_correct ? '#03543F' : '#475569', fontSize: '0.9rem', fontWeight: opt.is_correct ? 'bold' : 'normal' }}>
                                                        {opt.is_correct && <CheckCircle size={16} color="#057A55" />}
                                                        <span>{opt.text}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                                                <button onClick={() => handleAddQuestionFromBank(q)} style={{ backgroundColor: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE', padding: '0.6rem 1.2rem', borderRadius: 'var(--radius-md)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                    <PlusCircle size={18} /> Add to Builder
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    </div>
                                    {bankResults.length > bankDisplayLimit && (
                                        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                                            <button onClick={() => setBankDisplayLimit(prev => prev + 20)} style={{ backgroundColor: '#F8FAFC', color: '#4F46E5', border: '1px solid #C7D2FE', padding: '0.75rem 2rem', borderRadius: 'var(--radius-full)', fontWeight: 700, cursor: 'pointer', fontSize: '1rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                                                Load More ({bankResults.length - bankDisplayLimit} remaining)
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
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
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Quiz Title</label>
                                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="E.g., Intro to Algebra" style={inputStyle} required />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Description</label>
                                    <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this quiz about?" style={inputStyle} />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Subject</label>
                                    <input type="text" value={quizSubject} onChange={e => setQuizSubject(e.target.value)} placeholder="E.g., Science" style={inputStyle} list="subject-suggestions" />
                                    <datalist id="subject-suggestions">
                                        {[...new Set(quizzes.map(q => q.subject).filter(Boolean))].map(s => <option key={s} value={s} />)}
                                    </datalist>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Level</label>
                                    <input type="text" value={quizLevel} onChange={e => setQuizLevel(e.target.value)} placeholder="E.g., Grade 9" style={inputStyle} list="level-suggestions" />
                                    <datalist id="level-suggestions">
                                        {[...new Set(quizzes.map(q => q.level).filter(Boolean))].map(l => <option key={l} value={l} />)}
                                    </datalist>
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Topic</label>
                                    <input type="text" value={quizTopic} onChange={e => setQuizTopic(e.target.value)} placeholder="E.g., Biology" style={inputStyle} list="topic-suggestions" />
                                    <datalist id="topic-suggestions">
                                        {[...new Set(quizzes.map(q => q.topic).filter(Boolean))].map(t => <option key={t} value={t} />)}
                                    </datalist>
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', marginTop: '1rem' }}>
                                <h3 style={{ margin: 0 }}>Questions ({questions.length})</h3>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <button type="button" onClick={() => { setActiveTab('questionBank'); toast('Search the bank and add questions to your builder!', { icon: '🔍' }); }} style={{ padding: '0.5rem 1rem', backgroundColor: '#EEF2FF', color: '#4F46E5', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer' }}>
                                        Import from Bank
                                    </button>
                                    <button type="button" onClick={() => setShowBulkImportModal(true)} style={{ padding: '0.5rem 1rem', backgroundColor: '#DBEAFE', color: '#1D4ED8', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer' }}>
                                        Bulk Import Text
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                {questions.map((q, index) => (
                                    <div key={q.id} style={{ padding: '1.5rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', backgroundColor: 'white', position: 'relative' }}>
                                        <button type="button" onClick={() => removeQuestion(q.id)} style={{ position: 'absolute', top: '1rem', right: '1rem', backgroundColor: 'transparent', color: '#EF4444', border: 'none', cursor: 'pointer' }}>
                                            <Trash2 size={20} />
                                        </button>
                                        <h4 style={{ margin: '0 0 1rem 0' }}>Question {index + 1}</h4>
                                        <div style={{ display: 'grid', gap: '1rem' }}>
                                            <div style={{ backgroundColor: '#F3F4F6', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid #E5E7EB', borderLeft: '4px solid #6B7280' }}>
                                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600, color: '#374151' }}>Question Text</label>
                                                <input type="text" value={q.text} onChange={e => updateQuestion(q.id, 'text', e.target.value)} placeholder="Type question here..." style={{ ...inputStyle, backgroundColor: 'white' }} />
                                            </div>

                                            <div style={{ backgroundColor: '#F5F3FF', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid #EDE9FE', borderLeft: '4px solid #8B5CF6' }}>
                                                <h5 style={{ margin: '0 0 1rem 0', color: '#5B21B6', fontSize: '0.9rem' }}>Media & Add-ons (Optional)</h5>
                                                
                                                <div style={{ marginBottom: '1rem' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#4C1D95' }}>
                                                        <span>Image URL or Upload</span>
                                                    </label>
                                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                                                        <input 
                                                            type="text" 
                                                            value={q.image_url || ''} 
                                                            onChange={e => updateQuestion(q.id, 'image_url', e.target.value)} 
                                                            placeholder="https://example.com/image.jpg" 
                                                            style={{ ...inputStyle, flex: 1, backgroundColor: 'white' }} 
                                                        />
                                                        <label style={{ cursor: 'pointer', backgroundColor: 'white', border: '1px solid #C4B5FD', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', fontWeight: 600, fontSize: '0.85rem', color: '#5B21B6', display: 'inline-block', whiteSpace: 'nowrap' }}>
                                                            Upload Image
                                                            <input 
                                                                type="file" 
                                                                accept="image/*" 
                                                                onChange={async (e) => {
                                                                    const file = e.target.files[0];
                                                                    if (!file) return;
                                                                    const formData = new FormData();
                                                                    formData.append('image', file);
                                                                    try {
                                                                        const res = await fetch('/api/upload', {
                                                                            method: 'POST',
                                                                            headers: {
                                                                                'x-user-id': user.id,
                                                                                'x-user-role': user.role
                                                                            },
                                                                            body: formData
                                                                        });
                                                                        const data = await res.json();
                                                                        if (res.ok) {
                                                                            updateQuestion(q.id, 'image_url', data.url);
                                                                        } else {
                                                                            alert(data.error || 'Upload failed');
                                                                        }
                                                                    } catch (err) {
                                                                        console.error(err);
                                                                        alert('Upload failed');
                                                                    }
                                                                    e.target.value = '';
                                                                }} 
                                                                style={{ display: 'none' }} 
                                                            />
                                                        </label>
                                                    </div>
                                                    {q.image_url && (
                                                        <div style={{ marginTop: '0.75rem', padding: '0.5rem', border: '1px dashed #C4B5FD', borderRadius: 'var(--radius-md)', display: 'inline-block', backgroundColor: 'white' }}>
                                                            <img src={q.image_url} alt="Question preview" style={{ maxWidth: '100%', maxHeight: '180px', objectFit: 'contain', display: 'block' }} />
                                                        </div>
                                                    )}
                                                </div>

                                                {(expandedCode[q.id] ?? (q.code_snippet || q.code_language ? true : false)) ? (
                                                    <div>
                                                        <button 
                                                            type="button" 
                                                            onClick={() => setExpandedCode(prev => ({...prev, [q.id]: false}))}
                                                            style={{ backgroundColor: 'transparent', border: '1px dashed #C4B5FD', color: '#5B21B6', padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', display: 'inline-block', marginBottom: '1rem' }}>
                                                            - Hide Code Snippet
                                                        </button>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                            <div>
                                                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#4C1D95' }}>Code Snippet</label>
                                                                <textarea value={q.code_snippet} onChange={e => updateQuestion(q.id, 'code_snippet', e.target.value)} placeholder="def hello_world():&#10;    print('Hello')" style={{ ...inputStyle, minHeight: '100px', fontFamily: 'monospace', backgroundColor: 'white' }} onKeyDown={e => {
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
                                                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#4C1D95' }}>Code Language</label>
                                                                <select value={q.code_language} onChange={e => updateQuestion(q.id, 'code_language', e.target.value)} style={{...inputStyle, backgroundColor: 'white'}}>
                                                                    <option value="">None / Auto</option>
                                                                    <option value="python">Python</option>
                                                                    <option value="javascript">JavaScript</option>
                                                                    <option value="plaintext">CAIE Pseudocode</option>
                                                                    <option value="html">HTML/CSS</option>
                                                                </select>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button 
                                                        type="button" 
                                                        onClick={() => setExpandedCode(prev => ({...prev, [q.id]: true}))}
                                                        style={{ backgroundColor: 'white', border: '1px dashed #C4B5FD', color: '#5B21B6', padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center' }}>
                                                        + Add Code Snippet
                                                    </button>
                                                )}
                                            </div>
                                            <div style={{ marginTop: '1.5rem', backgroundColor: '#F0FDF4', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid #BBF7D0', borderLeft: '4px solid #10B981' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                    <label style={{ display: 'block', margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#065F46' }}>
                                                        Options (Answers) <span style={{ fontWeight: 'normal', color: '#047857' }}>(Mark the correct answer using the check circles)</span>
                                                    </label>
                                                    <button type="button" onClick={() => addOption(q.id)} style={{ padding: '0.25rem 0.5rem', backgroundColor: 'white', color: '#374151', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>+ Add Option</button>
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

                                            <div style={{ marginTop: '1.5rem', backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid #E2E8F0', borderLeft: '4px solid #3B82F6' }}>
                                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600, color: '#1E293B' }}>
                                                    Answer Explanation <span style={{ fontWeight: 'normal', color: '#64748B' }}>(Optional — Shown to students after the quiz)</span>
                                                </label>
                                                <textarea value={q.explanation || ''} onChange={e => updateQuestion(q.id, 'explanation', e.target.value)} placeholder="Explain why the correct answer is correct..." style={{ ...inputStyle, minHeight: '60px', backgroundColor: 'white' }} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div style={{ marginTop: '1rem' }}>
                                <button type="button" onClick={addQuestion} style={{ width: '100%', padding: '1rem', backgroundColor: '#F8FAFC', border: '2px dashed #CBD5E1', borderRadius: 'var(--radius-md)', color: '#475569', fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}>
                                    + Add New Question
                                </button>
                            </div>

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
                                                            {s.expires_at && (
                                                                <p style={{ color: '#991B1B', margin: '0.25rem 0 0 0', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                                    <Clock size={14} /> Auto-closes: {new Date(s.expires_at).toLocaleString()}
                                                                </p>
                                                            )}
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
                                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                            <button onClick={() => setResetStudent(student)} style={{ background: 'transparent', border: 'none', color: '#F59E0B', cursor: 'pointer', padding: '0.25rem' }} title="Reset Password">
                                                                <KeyRound size={18} />
                                                            </button>
                                                            <button onClick={() => handleRemoveStudentFromClass(student.id)} style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '0.25rem' }} title="Remove Student">
                                                                <UserMinus size={18} />
                                                            </button>
                                                        </div>
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

                {activeTab === 'settings' && (
                    <div className="fade-in" style={{ backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', maxWidth: '500px' }}>
                        <h2 style={{ marginTop: 0, marginBottom: '1.5rem', borderBottom: '2px solid var(--border)', paddingBottom: '0.5rem' }}>Account Settings</h2>
                        
                        <div style={{ marginBottom: '2rem' }}>
                            <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><KeyRound size={18} /> Change Password</h3>
                            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>New Password</label>
                                    <input 
                                        type="password" 
                                        value={newPasswordValue} 
                                        onChange={e => setNewPasswordValue(e.target.value)} 
                                        placeholder="Enter new password" 
                                        style={inputStyle} 
                                        required 
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>Confirm New Password</label>
                                    <input 
                                        type="password" 
                                        value={confirmPasswordValue} 
                                        onChange={e => setConfirmPasswordValue(e.target.value)} 
                                        placeholder="Confirm new password" 
                                        style={inputStyle} 
                                        required 
                                    />
                                </div>
                                <button type="submit" style={{ backgroundColor: 'var(--primary)', color: 'white', border: 'none', padding: '0.75rem', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer', marginTop: '0.5rem' }}>Update Password</button>
                            </form>
                        </div>
                </div>
            )}

            {/* Modals - Moved to a dedicated fragment at the very end to avoid 'fixed' positioning issues with parent transforms */}
            <div data-id="modals-container">
            {/* Student Password Reset Modal */}
            {resetStudent !== null && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
                    <div className="fade-in" style={{ backgroundColor: 'white', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '90%', maxWidth: '400px', transform: 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '2px solid var(--border)', paddingBottom: '0.75rem' }}>
                            <div style={{ backgroundColor: '#FEF3C7', color: '#D97706', padding: '0.5rem', borderRadius: '50%' }}>
                                <KeyRound size={24} />
                            </div>
                            <h2 style={{ margin: 0 }}>Reset Password</h2>
                        </div>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
                            Enter a new password for student <strong>{resetStudent.username}</strong>.
                        </p>
                        
                        <form onSubmit={handleResetStudentPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <input
                                type="text"
                                value={studentNewPassword}
                                onChange={(e) => setStudentNewPassword(e.target.value)}
                                placeholder="e.g. 1234"
                                style={inputStyle}
                                autoFocus
                            />
                            
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" onClick={() => { setResetStudent(null); setStudentNewPassword(''); }} style={{ padding: '0.75rem 1.5rem', border: 'none', backgroundColor: '#F3F4F6', cursor: 'pointer', borderRadius: 'var(--radius-md)', fontWeight: 600 }}>Cancel</button>
                                <button type="submit" disabled={!studentNewPassword} style={{ padding: '0.75rem 1.5rem', border: 'none', backgroundColor: 'var(--primary)', color: 'white', cursor: studentNewPassword ? 'pointer' : 'not-allowed', borderRadius: 'var(--radius-md)', fontWeight: 600, opacity: studentNewPassword ? 1 : 0.7 }}>Reset Password</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Bulk Import Modal */}

            {showBankImport === true && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
                    <div className="fade-in" style={{ backgroundColor: 'white', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '90%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Database size={24} color="#4F46E5" /> Add Questions to Bank</h2>
                        </div>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                            Paste your questions below. They will be added to the global Question Bank using the tags below.
                        </p>

                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#4C1D95' }}>Level</label>
                                <input type="text" value={bankLevel} onChange={e => setBankLevel(e.target.value)} placeholder="e.g. A Level" style={inputStyle} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#4C1D95' }}>Subject</label>
                                <input type="text" value={bankSubject} onChange={e => setBankSubject(e.target.value)} placeholder="e.g. Physics" style={inputStyle} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#4C1D95' }}>Topic</label>
                                <input type="text" value={bankTopic} onChange={e => setBankTopic(e.target.value)} placeholder="e.g. Kinematics" style={inputStyle} />
                            </div>
                        </div>

                        <textarea
                            value={bankImportText}
                            onChange={(e) => setBankImportText(e.target.value)}
                            placeholder="1. What is the capital of France?&#10;A. London&#10;*B. Paris&#10;C. Berlin"
                            style={{ width: '100%', height: '300px', padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontFamily: 'monospace', fontSize: '0.9rem', resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                            <button onClick={() => setShowBankImport(false)} style={{ padding: '0.75rem 1.5rem', backgroundColor: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                            <button onClick={handleBankImportProcess} style={{ padding: '0.75rem 1.5rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 'bold' }}>Import to Bank</button>
                        </div>
                    </div>
                </div>
            )}

            {showBulkImportModal === true && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
                    <div className="fade-in" style={{ backgroundColor: 'white', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '90%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h2 style={{ margin: 0 }}>Bulk Import Text</h2>
                            <button onClick={handleCopyPrompt} style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#E0E7FF', color: '#4338CA', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer' }}>
                                <Copy size={16} /> Copy Prompt for AI
                            </button>
                        </div>
                        
                        <div style={{ backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid #E2E8F0', fontSize: '0.9rem' }}>
                            <strong>Formatting Rules:</strong>
                            <ul style={{ margin: '0.5rem 0 0 1.5rem', padding: 0, color: 'var(--text-muted)' }}>
                                <li>Separate questions with numbers (e.g. <code>1. </code> or <code>1.</code> without a space).</li>
                                <li>Mark correct answers with an asterisk (e.g. <code>* A) </code>).</li>
                                <li><strong>Code Blocks:</strong> Wrap code in <code>[CODE: language]</code> and <code>[/CODE]</code>.</li>
                                <li><strong>Explanations:</strong> Add <code>[EXP: explanation here]</code> at the end of a question.</li>
                            </ul>
                        </div>

                        <textarea
                            value={bulkImportText}
                            onChange={(e) => setBulkImportText(e.target.value)}
                            placeholder="1. What does the following code output?
[CODE: python]
print('Hello World')
[/CODE]
A) Hello
* B) Hello World
[EXP: The code explicitly prints exactly 'Hello World']"
                            style={{ ...inputStyle, minHeight: '300px', fontFamily: 'monospace', width: '100%', marginBottom: '1rem' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                            <button onClick={() => setShowBulkImportModal(false)} style={{ padding: '0.75rem 1.5rem', border: 'none', backgroundColor: '#F3F4F6', cursor: 'pointer', borderRadius: 'var(--radius-md)', fontWeight: 600 }}>Cancel</button>
                            <button onClick={handleBulkImportProcess} style={{ padding: '0.75rem 1.5rem', border: 'none', backgroundColor: 'var(--primary)', color: 'white', cursor: 'pointer', borderRadius: 'var(--radius-md)', fontWeight: 600 }}>Parse & Import to Builder</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Kahoot Export Modal */}
            {kahootQuiz !== null && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000, padding: '1rem' }}>
                    <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: 'var(--radius-lg)', maxWidth: '500px', width: '100%', boxShadow: 'var(--shadow-xl)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            <div style={{ backgroundColor: '#46178F', color: 'white', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', fontWeight: 800, fontSize: '1.5rem' }}>K!</div>
                            <h2 style={{ margin: 0 }}>Export to Kahoot!</h2>
                        </div>

                        <p style={{ color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                            Kahoot! requires their specific Excel template for imports. Since we can't load it "automatically," we've prepared a data file for you.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: '#F8FAFC', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginBottom: '1.5rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>Follow these steps:</div>
                            <ol style={{ paddingLeft: '1.25rem', margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <li>Download the <b>Kahoot! Import CSV</b> below.</li>
                                <li>Open it and copy the rows (excluding the header).</li>
                                <li>Paste them into the official <b>Kahoot! Spreadsheet Template</b>.</li>
                                <li>Upload that template to your Kahoot! account.</li>
                            </ol>
                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button 
                                onClick={() => setKahootQuiz(null)} 
                                style={{ padding: '0.75rem 1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', backgroundColor: 'white', cursor: 'pointer', fontWeight: 600 }}
                            >
                                Close
                            </button>
                            <button 
                                onClick={() => {
                                    handleKahootExport(kahootQuiz);
                                    setKahootQuiz(null);
                                }} 
                                style={{ padding: '0.75rem 1.25rem', borderRadius: 'var(--radius-md)', border: 'none', backgroundColor: '#46178F', color: 'white', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            >
                                <Download size={18} /> Download CSV
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Practice Stats Modal */}
            {showPracticeStats !== null && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000, padding: '1rem' }}>
                    <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: 'var(--radius-lg)', maxWidth: '800px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{ backgroundColor: '#D1FAE5', color: '#065F46', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
                                    <BarChart3 size={24} />
                                </div>
                                <h2 style={{ margin: 0 }}>Practice Engagement</h2>
                            </div>
                            <button onClick={() => setShowPracticeStats(null)} style={{ backgroundColor: 'transparent', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}>&times;</button>
                        </div>

                        {loadingStats ? (
                            <p style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Loading engagement data...</p>
                        ) : practiceStats.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: '#F8FAFC', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                                <TrendingUp size={48} color="#CBD5E1" style={{ marginBottom: '1rem' }} />
                                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>No student has practiced this quiz yet.</p>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Share the quiz or assign it for homework to see results here!</p>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                                        <th style={{ padding: '1rem' }}>Student Name</th>
                                        <th style={{ padding: '1rem' }}>Best Score</th>
                                        <th style={{ padding: '1rem' }}>Attempts</th>
                                        <th style={{ padding: '1rem' }}>Last Practiced</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {practiceStats.map((stat, i) => (
                                        <tr key={stat.user_id} style={{ borderBottom: '1px solid var(--border)', backgroundColor: i % 2 === 0 ? 'white' : '#F8FAFC' }}>
                                            <td style={{ padding: '1rem', fontWeight: 600 }}>{stat.username}</td>
                                            <td style={{ padding: '1rem' }}>
                                                <span style={{ 
                                                    padding: '0.25rem 0.75rem', 
                                                    borderRadius: '1rem', 
                                                    backgroundColor: stat.best_score >= 80 ? '#D1FAE5' : stat.best_score >= 50 ? '#FEF3C7' : '#FEE2E2',
                                                    color: stat.best_score >= 80 ? '#065F46' : stat.best_score >= 50 ? '#92400E' : '#991B1B',
                                                    fontWeight: 700
                                                }}>
                                                    {stat.best_score}%
                                                </span>
                                            </td>
                                            <td style={{ padding: '1rem' }}>{stat.attempt_count}</td>
                                            <td style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                                {new Date(stat.last_practiced).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        
                        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <button 
                                onClick={() => handleResetPractice(showPracticeStats)} 
                                style={{ 
                                    padding: '0.75rem 1.5rem', 
                                    backgroundColor: 'transparent', 
                                    color: '#EF4444', 
                                    border: '1px solid #EF4444', 
                                    borderRadius: 'var(--radius-md)', 
                                    fontWeight: 600, 
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}
                            >
                                <TrendingUp size={16} /> Reset Leaderboard
                            </button>
                            <button onClick={() => setShowPracticeStats(null)} style={{ padding: '0.75rem 1.5rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600, cursor: 'pointer' }}>
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Quiz Preview Modal */}
            {previewQuiz !== null && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000, padding: '2rem' }}>
                    <div style={{ backgroundColor: 'white', width: '100%', maxWidth: '800px', height: '100%', maxHeight: '90vh', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
                        {/* Header */}
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
                            <div>
                                <h2 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.5rem' }}>{previewQuiz.title}</h2>
                                <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)' }}>{previewQuiz.questions?.length || 0} Questions</p>
                            </div>
                            <button onClick={() => setPreviewQuiz(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                <X size={24} />
                            </button>
                        </div>
                        
                        {/* Body - Scrollable */}
                        <div style={{ padding: '2rem', flex: 1, overflowY: 'auto', backgroundColor: '#F1F5F9' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                {previewQuiz.questions?.map((q, idx) => (
                                    <div key={q.id} style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                            <div style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8', fontWeight: 'bold', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', flexShrink: 0 }}>
                                                {idx + 1}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <h3 style={{ margin: '0 0 1rem 0', color: 'var(--text-main)', fontSize: '1.1rem', lineHeight: '1.5' }}>{q.text}</h3>
                                                
                                                {q.image_url && (
                                                    <div style={{ marginBottom: '1rem' }}>
                                                        <img src={q.image_url} alt="Question media" style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: 'var(--radius-sm)' }} />
                                                    </div>
                                                )}
                                                
                                                {q.code_snippet && (
                                                    <div style={{ backgroundColor: '#1E293B', color: '#E2E8F0', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowX: 'auto', fontSize: '0.9rem' }}>
                                                        {q.code_snippet}
                                                    </div>
                                                )}
                                                
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    {q.options?.map(opt => (
                                                        <div key={opt.id} style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: `2px solid ${opt.is_correct ? '#10B981' : 'var(--border)'}`, backgroundColor: opt.is_correct ? '#F0FDF4' : 'transparent', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: `2px solid ${opt.is_correct ? '#10B981' : 'var(--text-muted)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: opt.is_correct ? '#10B981' : 'transparent' }}>
                                                                {opt.is_correct && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'white' }} />}
                                                            </div>
                                                            <span style={{ fontWeight: opt.is_correct ? 600 : 400, color: opt.is_correct ? '#065F46' : 'var(--text-main)' }}>{opt.text}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                
                                                {q.explanation && (
                                                    <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#EFF6FF', borderRadius: 'var(--radius-md)', borderLeft: '4px solid #3B82F6' }}>
                                                        <strong style={{ color: '#1E3A8A', display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>Explanation:</strong>
                                                        <span style={{ color: '#1E40AF', fontSize: '0.95rem' }}>{q.explanation}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            </div>
        </div >
        </div>
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
