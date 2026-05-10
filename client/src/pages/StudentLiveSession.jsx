import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Flag, CheckCircle2, AlertCircle, Lock, PlayCircle, Trophy } from 'lucide-react';
import PracticeLeaderboard from '../components/PracticeLeaderboard';
import toast from 'react-hot-toast';

function getStudentDraftStorageKey(userId, sessionId) {
    return `quizmaker:student-draft:${userId}:${sessionId}`;
}

function readStudentDraft(userId, sessionId) {
    try {
        const raw = localStorage.getItem(getStudentDraftStorageKey(userId, sessionId));
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export default function StudentLiveSession({ user }) {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const isRetakeMode = new URLSearchParams(location.search).get('retake') === '1';
    const autosaveTimeoutRef = useRef(null);
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
    const [isMissed, setIsMissed] = useState(false);
    const [retakeAttempt, setRetakeAttempt] = useState(null);
    const [resultAttempt, setResultAttempt] = useState(null);
    const [scoreSummary, setScoreSummary] = useState(null);

    // --- Practice Mode State ---
    const [isPracticing, setIsPracticing] = useState(false);
    const [practiceIdx, setPracticeIdx] = useState(0);
    const [practiceAnswers, setPracticeAnswers] = useState({});
    const [practiceFeedback, setPracticeFeedback] = useState(null);
    const [practiceFinished, setPracticeFinished] = useState(false);
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
    const draftSessionKey = isRetakeMode ? `${sessionId}:retake` : sessionId;
    const draftStorageKey = getStudentDraftStorageKey(user.id, draftSessionKey);

    const showAutosavePulse = () => {
        setShowAutosave(true);
        if (autosaveTimeoutRef.current) {
            clearTimeout(autosaveTimeoutRef.current);
        }
        autosaveTimeoutRef.current = setTimeout(() => setShowAutosave(false), 1500);
    };

    useEffect(() => {
        const draft = readStudentDraft(user.id, draftSessionKey);
        if (!draft) return;

        if (draft.localAnswers && typeof draft.localAnswers === 'object') {
            setLocalAnswers(draft.localAnswers);
        }
        if (Array.isArray(draft.flaggedQuestions)) {
            setFlaggedQuestions(new Set(draft.flaggedQuestions));
        }
        if (Array.isArray(draft.answeredQuestionIds)) {
            setAnsweredQuestionIds(new Set(draft.answeredQuestionIds.map(Number)));
        }
        if (Number.isInteger(draft.currentIdx) && draft.currentIdx >= 0) {
            setCurrentIdx(draft.currentIdx);
        }
    }, [draftSessionKey, user.id]);

    useEffect(() => {
        if (sessionStatus === 'completed') {
            localStorage.removeItem(draftStorageKey);
            return;
        }

        const draft = {
            currentIdx,
            localAnswers,
            flaggedQuestions: Array.from(flaggedQuestions),
            answeredQuestionIds: Array.from(answeredQuestionIds),
            updatedAt: Date.now()
        };

        localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    }, [answeredQuestionIds, currentIdx, draftStorageKey, flaggedQuestions, localAnswers, sessionStatus]);

    useEffect(() => {
        return () => {
            if (autosaveTimeoutRef.current) {
                clearTimeout(autosaveTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const loadData = async () => {
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
                setSessionStatus(sessData.status);

                if (isRetakeMode) {
                    const retakeRes = await fetch(`/api/sessions/${sessData.id}/retakes/start`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-user-id': user.id,
                            'x-user-role': user.role
                        },
                        body: JSON.stringify({})
                    });
                    const retakeData = await retakeRes.json();
                    if (!retakeRes.ok) {
                        toast.error(retakeData.error || 'Retake is not available yet.');
                        navigate('/student');
                        return;
                    }

                    setRetakeAttempt(retakeData.attempt);
                    if (Array.isArray(retakeData.savedResponses) && retakeData.savedResponses.length > 0) {
                        const savedAnswerMap = {};
                        retakeData.savedResponses.forEach(response => {
                            savedAnswerMap[response.question_id] = response.option_id;
                        });
                        setLocalAnswers(prev => ({ ...savedAnswerMap, ...prev }));
                        setAnsweredQuestionIds(prev => new Set([
                            ...Array.from(prev),
                            ...retakeData.savedResponses.map(response => Number(response.question_id))
                        ]));
                    }
                    setSession({ ...sessData, mode: 'async', name: `${sessData.name || 'Quiz'} Retake` });
                    setSessionStatus('active');

                    const quizRes = await fetch(`/api/quizzes/${sessData.quiz_id}?studentView=true`, {
                        headers: {
                            'x-user-id': user.id,
                            'x-user-role': user.role
                        }
                    });
                    const quizData = await quizRes.json();

                    if (sessData.randomize_questions === 1) {
                        for (let i = quizData.questions.length - 1; i > 0; i--) {
                            const j = Math.floor(Math.random() * (i + 1));
                            [quizData.questions[i], quizData.questions[j]] = [quizData.questions[j], quizData.questions[i]];
                        }
                    }

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
                    const savedDraft = readStudentDraft(user.id, draftSessionKey);
                    if (Number.isInteger(savedDraft?.currentIdx)) {
                        setCurrentIdx(Math.min(savedDraft.currentIdx, Math.max(quizData.questions.length - 1, 0)));
                    }

                    const imageUrls = quizData.questions
                        .map(q => q.image_url)
                        .filter(url => url && url.length > 0);

                    if (imageUrls.length > 0) {
                        setIsImagesLoading(true);
                        await Promise.all(imageUrls.map(url => new Promise((resolve) => {
                            const img = new Image();
                            img.onload = () => resolve();
                            img.onerror = () => resolve();
                            img.src = url;
                        })));
                        setIsImagesLoading(false);
                    }

                    if (sessData.time_limit) {
                        setTimeLimit(sessData.time_limit);
                        const startedTime = new Date(retakeData.attempt.started_at).getTime();
                        const serverNowTime = new Date(retakeData.serverNow).getTime();
                        const secondsPassed = Math.floor((serverNowTime - startedTime) / 1000);
                        const totalSecondsAllowed = sessData.time_limit * 60;
                        setTimeRemaining(Math.max(0, totalSecondsAllowed - secondsPassed));
                    }
                    return;
                }

                if (sessData.status === 'completed' || sessData.is_archived === 1) {
                    setSessionStatus('completed');
                    fetchResults(sessData.id);
                } else {
                    // Check if already submitted
                    const subRes = await fetch(`/api/sessions/${sessData.id}/submission/${user.id}`, {
                        headers: {
                            'x-user-id': user.id,
                            'x-user-role': user.role
                        }
                    });
                    const subData = await subRes.json();
                    if (subData.isSubmitted) {
                        setIsSubmitted(true);
                        if (sessData.mode === 'async') {
                            setSessionStatus('completed');
                            fetchResults(sessData.id);
                        }
                    } else {
                        const quizRes = await fetch(`/api/quizzes/${sessData.quiz_id}?studentView=true`, {
                            headers: {
                                'x-user-id': user.id,
                                'x-user-role': user.role
                            }
                        });
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
                        const savedDraft = readStudentDraft(user.id, draftSessionKey);
                        if (sessData.mode === 'async' && Number.isInteger(savedDraft?.currentIdx)) {
                            setCurrentIdx(Math.min(savedDraft.currentIdx, Math.max(quizData.questions.length - 1, 0)));
                        }

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
                                headers: {
                                    'Content-Type': 'application/json',
                                    'x-user-id': user.id,
                                    'x-user-role': user.role
                                },
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

        if (isRetakeMode) {
            return () => clearInterval(timerInterval);
        }

        const newSocket = io({ transports: ['websocket'] });
        setSocket(newSocket);

        newSocket.on('connect', () => {
            newSocket.emit('join_session', { sessionId });
        });

        newSocket.on('session_state', (state) => {
            setSessionStatus(state.status || 'active');
            if (state.mode !== 'async') {
                setCurrentIdx(state.currentQuestionIndex || 0);
            }
            setIsLocked(state.locked || false);
            if (state.timerStart && state.timerDuration && state.timerQuestionIndex === state.currentQuestionIndex) {
                setQuestionTimerState({ endTime: state.timerStart + (state.timerDuration * 1000) });
            } else {
                setQuestionTimerState(null);
                setQuestionTimerRemaining(null);
            }
            if (state.assignedTeam) {
                setMyTeam(state.assignedTeam);
            }
            if (state.teamScores) {
                setTeamScores(state.teamScores);
            }
            if (state.individualScores && state.individualScores[String(user.id)] !== undefined) {
                setMyScore(state.individualScores[String(user.id)]);
            }
            if (state.streaks && state.streaks[String(user.id)] !== undefined) {
                setMyStreak(state.streaks[String(user.id)]);
            }
            if (state.myAnsweredQuestions) {
                setAnsweredQuestionIds(prev => new Set([
                    ...Array.from(prev),
                    ...state.myAnsweredQuestions.map(Number)
                ]));
            }
            if (state.status === 'completed') {
                setSessionStatus('completed');
                fetchResults(sessionId);
            }
        });

        newSocket.on('assigned_team', ({ team }) => {
            setMyTeam(team);
        });

        newSocket.on('team_scores_update', ({ teamScores }) => {
            setTeamScores(teamScores);
        });

        newSocket.on('student_score_update', ({ studentId, individualScores, streaks }) => {
            if (String(studentId) === String(user.id)) {
                if (individualScores && individualScores[String(user.id)] !== undefined) setMyScore(individualScores[String(user.id)]);
                if (streaks && streaks[String(user.id)] !== undefined) setMyStreak(streaks[String(user.id)]);
            }
        });

        newSocket.on('badge_earned', ({ studentId, badge, streak }) => {
            if (String(studentId) === String(user.id)) {
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

        newSocket.on('session_error', ({ message }) => {
            toast.error(message);
            navigate('/student/dashboard');
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
    }, [draftSessionKey, isRetakeMode, navigate, sessionId, user.id, user.role]);

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

    const fetchResults = async (sid, attempt = 1) => {
        try {
            // Add a small delay on the first attempt if coming from a socket event
            if (attempt === 1) await new Promise(resolve => setTimeout(resolve, 500));

            const res = await fetch(`/api/sessions/${sid}/results/${user.id}`, {
                headers: {
                    'x-user-id': user.id,
                    'x-user-role': user.role
                }
            });

            if (res.status === 403 && attempt < 3) {
                console.warn(`Results fetch 403 (attempt ${attempt}). Retrying in 1s...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return fetchResults(sid, attempt + 1);
            }

            if (!res.ok) throw new Error(`Fetch failed with status ${res.status}`);

            const data = await res.json();
            if (data.results) {
                setReviewResults(data.results);
                setTotalPoints(data.totalPoints || 0);
                setFinalBadges(data.badges || []);
                setIsMissed(data.isMissed || false);
                setResultAttempt(data.attempt || null);
                setScoreSummary(data.scoreSummary || null);
                localStorage.removeItem(draftStorageKey);
            } else {
                throw new Error("No results found in response");
            }
        } catch (e) {
            console.error('Failed to fetch results', e);
            if (attempt < 3) {
                 await new Promise(resolve => setTimeout(resolve, 1000));
                 return fetchResults(sid, attempt + 1);
            }
            // Do NOT set empty array here, it causes NaN score. Keep showing "Loading..." or a real error.
            toast.error("Results are taking a moment to process. Please wait or refresh the page.");
        }
    };

    const handleVote = async (optionId, questionId) => {
        if (isRetakeMode) {
            if (!retakeAttempt || isLocked || answeredQuestionIds.has(questionId)) return;
            try {
                const res = await fetch(`/api/sessions/${sessionId}/retakes/${retakeAttempt.id}/responses`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': user.id,
                        'x-user-role': user.role
                    },
                    body: JSON.stringify({ questionId, optionId })
                });
                if (!res.ok) throw new Error('Failed to save retake answer');
                setAnsweredQuestionIds(prev => new Set([...prev, questionId]));
                setLocalAnswers(prev => ({ ...prev, [questionId]: optionId }));
                showAutosavePulse();
            } catch (error) {
                console.error(error);
                toast.error('Could not save your answer. Please try again.');
            }
            return;
        }

        if (!socket || isLocked || answeredQuestionIds.has(questionId)) return;
        socket.emit('submit_answer', { sessionId, questionId, optionId });
        setAnsweredQuestionIds(prev => new Set([...prev, questionId]));
        setLocalAnswers(prev => ({ ...prev, [questionId]: optionId }));
        showAutosavePulse();
    };

    const submitRetakeTextAnswer = async (questionId, text) => {
        if (!retakeAttempt || isLocked || answeredQuestionIds.has(questionId)) return;
        try {
            const res = await fetch(`/api/sessions/${sessionId}/retakes/${retakeAttempt.id}/responses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                    'x-user-role': user.role
                },
                body: JSON.stringify({ questionId, text })
            });
            if (!res.ok) throw new Error('Failed to save retake answer');
            setAnsweredQuestionIds(prev => new Set([...prev, questionId]));
            showAutosavePulse();
        } catch (error) {
            console.error(error);
            toast.error('Could not save your answer. Please try again.');
        }
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
        showAutosavePulse();
    };

    const handleNextAsync = () => {
        if (currentIdx < quiz.questions.length - 1) {
            setCurrentIdx(currentIdx + 1);
            showAutosavePulse();
        }
    };

    const handlePrevAsync = () => {
        if (currentIdx > 0) {
            setCurrentIdx(currentIdx - 1);
            showAutosavePulse();
        }
    };

    const confirmSubmitAsync = async () => {
        try {
            if (isRetakeMode) {
                if (!retakeAttempt) return;
                const res = await fetch(`/api/sessions/${sessionId}/retakes/${retakeAttempt.id}/submit`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': user.id,
                        'x-user-role': user.role
                    },
                    body: JSON.stringify({})
                });
                if (!res.ok) throw new Error('Failed to submit retake');
                setIsSubmitted(true);
                setShowSubmitConfirm(false);
                setSessionStatus('completed');
                fetchResults(sessionId);
                return;
            }

            await fetch(`/api/sessions/${sessionId}/submit`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
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

    // --- Practice Mode Logic ---
    const handlePracticeAnswer = (optionId) => {
        if (practiceFeedback) return; // Prevent multiple clicks

        const currentQ = reviewResults[practiceIdx];
        const isCorrect = currentQ.correctAnswerId === optionId;

        setPracticeAnswers(prev => ({
            ...prev,
            [practiceIdx]: { optionId, isCorrect }
        }));

        setPracticeFeedback({
            isCorrect,
            selectedId: optionId,
            explanation: currentQ.explanation || (isCorrect ? "Correct!" : `Incorrect. The correct answer was: ${currentQ.correctAnswerText}`)
        });
    };

    const handlePracticeNext = () => {
        if (practiceIdx < reviewResults.length - 1) {
            setPracticeIdx(prev => prev + 1);
            setPracticeFeedback(null);
        } else {
            const finalCorrectCount = Object.values(practiceAnswers).filter(a => a.isCorrect).length;
            
            if (finalCorrectCount === reviewResults.length) {
                 toast('Perfect Practice Score! Great job!', {
                     icon: '🎉',
                     style: { borderRadius: '10px', background: '#333', color: '#fff', fontSize: '1.1rem', fontWeight: 'bold' }
                 });
            }

            // Record practice score to server
            if (session?.quiz_id) {
                const percent = Math.round((finalCorrectCount / reviewResults.length) * 100) || 0;
                fetch(`/api/quizzes/${session.quiz_id}/practice`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-user-id': user.id,
                        'x-user-role': user.role
                    },
                    body: JSON.stringify({
                        scorePercentage: percent,
                        points: finalCorrectCount * 100
                    })
                }).then(() => {
                    setPracticeFinished(true);
                    setPracticeFeedback(null);
                }).catch(err => {
                    console.error('Error saving practice score', err);
                    setPracticeFinished(true);
                    setPracticeFeedback(null);
                });
            } else {
                setPracticeFinished(true);
                setPracticeFeedback(null);
            }
        }
    };

    const exitPracticeMode = () => {
        setIsPracticing(false);
        setPracticeIdx(0);
        setPracticeAnswers({});
        setPracticeFeedback(null);
        setPracticeFinished(false);
    };

    if (sessionStatus === 'completed') {
        if (!reviewResults) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading your results...</div>;

        if (isPracticing) {
            if (practiceFinished) {
                const finalCorrectCount = Object.values(practiceAnswers).filter(a => a.isCorrect).length;
                const totalPracticeQuestions = reviewResults.length;
                const percent = Math.round((finalCorrectCount / totalPracticeQuestions) * 100) || 0;
                return (
                    <div className="fade-in" style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem', textAlign: 'center' }}>
                        <div style={{ backgroundColor: 'var(--surface)', padding: '3rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }}>
                            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>{percent === 100 ? '🏆' : '👏'}</div>
                            <h2 style={{ marginBottom: '1rem', color: 'var(--text-main)' }}>Practice Complete!</h2>
                            <div style={{ fontSize: '4rem', fontWeight: 800, color: percent >= 80 ? '#10B981' : percent >= 50 ? '#EAB308' : '#EF4444', marginBottom: '1rem' }}>
                                {percent}%
                            </div>
                            <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', marginBottom: '2.5rem' }}>
                                You got {finalCorrectCount} out of {totalPracticeQuestions} correct.
                            </p>
                            
                            <div style={{ marginBottom: '2.5rem', textAlign: 'left' }}>
                                <PracticeLeaderboard 
                                    quizId={session.quiz_id} 
                                    user={user} 
                                    classId={session.class_id}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                                <button onClick={() => { setPracticeIdx(0); setPracticeAnswers({}); setPracticeFeedback(null); setPracticeFinished(false); }} style={{ padding: '0.75rem 1.5rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>
                                    Try Again
                                </button>
                                <button onClick={exitPracticeMode} style={{ padding: '0.75rem 1.5rem', backgroundColor: '#E5E7EB', color: 'var(--text-main)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>
                                    Back to Results
                                </button>
                            </div>
                        </div>
                    </div>
                );
            }

            const currentQ = reviewResults[practiceIdx];
            const hasAnswered = !!practiceFeedback;
            
            return (
                <div className="fade-in" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ backgroundColor: '#FEF08A', color: '#854D0E', padding: '0.2rem 0.75rem', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: '0.85rem' }}>PRACTICE MODE</div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Instant Feedback</h2>
                        </div>
                        <button onClick={exitPracticeMode} style={{ padding: '0.5rem 1rem', backgroundColor: '#FEE2E2', color: '#B91C1C', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem' }}>
                            Exit Practice
                        </button>
                    </div>

                    <div style={{ backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-md)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600 }}>
                            <span>Question {practiceIdx + 1} of {reviewResults.length}</span>
                        </div>
                        
                        <h2 style={{ fontSize: '1.5rem', margin: '0 0 1.5rem 0', lineHeight: 1.4 }}>{currentQ.questionText}</h2>
                        
                        {currentQ.imageUrl && (
                            <img src={currentQ.imageUrl} alt="Question view" style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', display: 'block', margin: '0 auto 1.5rem auto' }} />
                        )}

                        {currentQ.codeSnippet && (
                            <div style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
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
                                    <code className={currentQ.codeLanguage ? `language-${currentQ.codeLanguage}` : ''}>
                                        {currentQ.codeSnippet}
                                    </code>
                                </pre>
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                            {currentQ.options.map((opt, i) => {
                                const isSelected = hasAnswered && practiceFeedback.selectedId === opt.id;
                                const isCorrect = hasAnswered && opt.id === currentQ.correctAnswerId;
                                
                                let bgColor = 'var(--surface)';
                                let borderColor = 'var(--border)';
                                let textColor = 'var(--text-main)';

                                if (hasAnswered) {
                                    if (isCorrect) {
                                        bgColor = '#ECFDF5'; borderColor = '#10B981'; textColor = '#065F46';
                                    } else if (isSelected && !isCorrect) {
                                        bgColor = '#FEF2F2'; borderColor = '#EF4444'; textColor = '#991B1B';
                                    }
                                } else {
                                    // Hover effect classes can't be easily done inline without state, 
                                    // but we can rely on standard button cursor
                                }

                                return (
                                    <button
                                        key={opt.id}
                                        onClick={() => handlePracticeAnswer(opt.id)}
                                        disabled={hasAnswered}
                                        style={{
                                            padding: '1.25rem',
                                            backgroundColor: bgColor,
                                            border: `2px solid ${borderColor}`,
                                            color: textColor,
                                            borderRadius: 'var(--radius-md)',
                                            fontSize: '1.1rem',
                                            fontWeight: 500,
                                            textAlign: 'left',
                                            cursor: hasAnswered ? 'default' : 'pointer',
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }}
                                    >
                                        <span>{['A', 'B', 'C', 'D', 'E', 'F', 'G'][i]}. {opt.text}</span>
                                        {hasAnswered && isCorrect && <span style={{fontSize: '1.2rem'}}>✅</span>}
                                        {hasAnswered && isSelected && !isCorrect && <span style={{fontSize: '1.2rem'}}>❌</span>}
                                    </button>
                                );
                            })}
                        </div>

                        {practiceFeedback && (
                            <div className="slide-up" style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: practiceFeedback.isCorrect ? '#ECFDF5' : '#FEF2F2', borderLeft: `6px solid ${practiceFeedback.isCorrect ? '#10B981' : '#EF4444'}`, borderRadius: 'var(--radius-md)' }}>
                                <h3 style={{ margin: '0 0 0.5rem 0', color: practiceFeedback.isCorrect ? '#065F46' : '#991B1B' }}>
                                    {practiceFeedback.isCorrect ? 'Correct! 🎉' : 'Incorrect'}
                                </h3>
                                <p style={{ margin: 0, color: practiceFeedback.isCorrect ? '#065F46' : '#991B1B', lineHeight: 1.5 }}>
                                    {practiceFeedback.explanation}
                                </p>
                                <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                                    <button onClick={handlePracticeNext} style={{ padding: '0.75rem 2rem', backgroundColor: practiceFeedback.isCorrect ? '#10B981' : '#EF4444', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600, fontSize: '1.05rem' }}>
                                        {practiceIdx < reviewResults.length - 1 ? 'Next Question →' : 'Finish Practice'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        const totalQuestions = reviewResults?.length || 0;
        const correctAnswers = reviewResults ? reviewResults.filter(r => r.isCorrect).length : 0;
        const scorePercentage = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

        if (isMissed && !isPracticing) {
            return (
                <div className="fade-in" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    <div style={{ textAlign: 'center', backgroundColor: '#FEF2F2', padding: '3rem 2rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', border: '1px solid #FCA5A5' }}>
                        <AlertCircle size={64} color="#EF4444" style={{ marginBottom: '1rem' }} />
                        <h1 style={{ color: '#991B1B', marginBottom: '1rem' }}>You Missed This Session</h1>
                        <p style={{ color: '#7F1D1D', fontSize: '1.1rem', maxWidth: '600px', margin: '0 auto 2.5rem auto', lineHeight: 1.6 }}>
                            You did not participate in this live quiz, so you do not have an official score. However, you can still practice the questions for your own learning!
                        </p>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                            <button onClick={() => setIsPracticing(true)} style={{ padding: '1rem 2rem', backgroundColor: '#EF4444', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '1.1rem', cursor: 'pointer', fontWeight: 700, boxShadow: 'var(--shadow-md)', transition: 'transform 0.2s', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <PlayCircle size={20} /> Practice Now
                            </button>
                            <button onClick={() => navigate('/student')} style={{ padding: '1rem 2rem', backgroundColor: 'white', color: '#991B1B', border: '1px solid #FCA5A5', borderRadius: 'var(--radius-md)', fontSize: '1.1rem', cursor: 'pointer', fontWeight: 600, transition: 'background-color 0.2s' }}>
                                Return to Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="fade-in" style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div style={{ textAlign: 'center', backgroundColor: 'var(--surface)', padding: '2.5rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🎉</div>
                    <h1 style={{ marginBottom: '0.5rem' }}>Quiz Complete!</h1>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Great job, {user.username}!</p>
                    {resultAttempt?.isRetake && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', padding: '0.5rem 0.9rem', borderRadius: 'var(--radius-full)', backgroundColor: '#EEF2FF', color: '#3730A3', fontWeight: 700, fontSize: '0.9rem' }}>
                            Official Retake Score · Attempt {resultAttempt.attemptNumber}
                        </div>
                    )}
                    {scoreSummary?.attempts?.length > 1 && (
                        <div style={{ margin: '0 auto 2rem auto', maxWidth: '560px', textAlign: 'left', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)' }}>Official Score History</h3>
                                <span style={{ color: scoreSummary.improvement >= 0 ? '#047857' : '#B91C1C', fontWeight: 800 }}>
                                    {scoreSummary.improvement >= 0 ? '+' : ''}{scoreSummary.improvement}
                                </span>
                            </div>
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                                {scoreSummary.attempts.map(attempt => (
                                    <div key={attempt.attemptNumber} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)', backgroundColor: attempt.attemptNumber === scoreSummary.latest.attemptNumber ? '#ECFDF5' : 'white', border: `1px solid ${attempt.attemptNumber === scoreSummary.latest.attemptNumber ? '#A7F3D0' : '#E5E7EB'}` }}>
                                        <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{attempt.label}</span>
                                        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{attempt.correct} / {attempt.totalQuestions} · {attempt.percentage}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

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

                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                        <button onClick={() => setIsPracticing(true)} style={{ padding: '1rem 2rem', backgroundColor: '#FDE047', color: '#854D0E', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '1.1rem', cursor: 'pointer', fontWeight: 700, boxShadow: 'var(--shadow-md)', transition: 'transform 0.2s' }}>
                            Practice This Quiz
                        </button>
                        <button onClick={() => navigate('/student')} style={{ padding: '1rem 2rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', fontSize: '1.1rem', cursor: 'pointer', fontWeight: 700, boxShadow: 'var(--shadow-md)', transition: 'transform 0.2s' }}>
                            Return to Dashboard
                        </button>
                    </div>
                </div>

                <div>
                    <h2 style={{ marginBottom: '1.5rem' }}>Review Your Answers</h2>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {reviewResults.map((r, index) => (
                            <div key={r.questionId} style={{ backgroundColor: 'var(--surface)', padding: '1.5rem', borderRadius: 'var(--radius-md)', borderLeft: `6px solid ${r.isCorrect ? '#10B981' : '#EF4444'}` }}>
                                <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>{index + 1}. {r.questionText}</h3>
                                {r.imageUrl && (
                                    <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
                                        <img src={r.imageUrl} alt="Question Context" style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: 'var(--radius-sm)' }} />
                                    </div>
                                )}
                                {r.codeSnippet && (
                                    <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
                                        <pre style={{
                                            backgroundColor: '#1E293B', color: '#F8FAFC', padding: '1rem', borderRadius: 'var(--radius-md)', overflowX: 'auto', fontFamily: 'monospace', fontSize: '0.9rem', lineHeight: '1.4'
                                        }}>
                                            <code className={r.codeLanguage ? `language-${r.codeLanguage}` : ''}>
                                                {r.codeSnippet}
                                            </code>
                                        </pre>
                                    </div>
                                )}
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
                                disabled={isLocked || hasAnswered}
                                onChange={(e) => {
                                    if (isLocked || hasAnswered) return;
                                    const textVal = e.target.value;
                                    setLocalAnswers(prev => ({ ...prev, [currentQ.id]: textVal }));
                                    showAutosavePulse();
                                }}
                                style={{ width: '100%', maxWidth: '400px', padding: '1rem', fontSize: '1.25rem', borderRadius: 'var(--radius-md)', border: '2px solid var(--border)', backgroundColor: (isLocked || hasAnswered) ? '#F3F4F6' : 'white', cursor: (isLocked || hasAnswered) ? 'not-allowed' : 'text' }}
                            />
                            <button
                                onClick={() => {
                                    if (isLocked || hasAnswered) return;
                                    if (isRetakeMode) {
                                        submitRetakeTextAnswer(currentQ.id, localAnswers[currentQ.id]);
                                    } else {
                                        socket.emit('submit_answer_text', { sessionId, questionId: currentQ.id, text: localAnswers[currentQ.id] });
                                        setAnsweredQuestionIds(prev => new Set([...prev, currentQ.id]));
                                        showAutosavePulse();
                                    }
                                }}
                                disabled={isLocked || hasAnswered}
                                style={{ backgroundColor: (isLocked || hasAnswered) ? '#9CA3AF' : 'var(--primary)', color: 'white', padding: '1rem 2rem', borderRadius: 'var(--radius-md)', fontSize: '1.25rem', border: 'none', cursor: (isLocked || hasAnswered) ? 'not-allowed' : 'pointer', fontWeight: 600 }}
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
                                        disabled={isLocked || hasAnswered}
                                        style={{
                                            backgroundColor: (isLocked || hasAnswered) ? '#9CA3AF' : (isSelected ? '#1E3A8A' : bgColor),
                                            color: 'white',
                                            border: isSelected ? '4px solid white' : 'none',
                                            padding: '2rem',
                                            borderRadius: 'var(--radius-md)',
                                            fontSize: '1.25rem',
                                            fontWeight: 600,
                                            cursor: (isLocked || hasAnswered) ? 'not-allowed' : 'pointer',
                                            boxShadow: isSelected ? '0 0 0 4px rgba(59, 130, 246, 0.5)' : 'none',
                                            transform: isSelected ? 'scale(0.98)' : 'scale(1)',
                                            transition: 'transform 0.1s ease, background-color 0.2s',
                                            wordBreak: 'break-word',
                                            whiteSpace: 'pre-wrap',
                                            opacity: (isLocked || hasAnswered) && !isSelected ? 0.7 : 1
                                        }}
                                        onMouseDown={e => { if (!isSelected && !isLocked && !hasAnswered) e.currentTarget.style.transform = 'scale(0.95)' }}
                                        onMouseUp={e => { if (!isSelected && !isLocked && !hasAnswered) e.currentTarget.style.transform = 'scale(1)' }}
                                        onMouseLeave={e => { if (!isSelected && !isLocked && !hasAnswered) e.currentTarget.style.transform = 'scale(1)' }}
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
