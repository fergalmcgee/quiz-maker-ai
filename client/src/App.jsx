import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import TeacherDashboard from './pages/TeacherDashboard';
import TeacherPresenter from './pages/TeacherPresenter';
import StudentDashboard from './pages/StudentDashboard';
import StudentLiveSession from './pages/StudentLiveSession';
import AdminDashboard from './pages/AdminDashboard';
import TeacherSessionReview from './pages/TeacherSessionReview';
import TeacherExitTickets from './pages/TeacherExitTickets';
import StudentExitTicket from './pages/StudentExitTicket';
import TeacherQuickChecks from './pages/TeacherQuickChecks';
import TeacherQuickCheckDisplay from './pages/TeacherQuickCheckDisplay';
import StudentQuickCheck from './pages/StudentQuickCheck';
import { installApiSessionHandler } from './apiFetch';

function App() {
    const [user, setUser] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem('quiz_user') || 'null');
        } catch {
            return null;
        }
    });
    const [sessionChecked, setSessionChecked] = useState(() => !localStorage.getItem('quiz_user'));

    useEffect(() => {
        return installApiSessionHandler(() => {
            setUser(null);
            toast.error('Your session expired. Please sign in again.', { duration: 6000 });
        });
    }, []);

    useEffect(() => {
        let isMounted = true;

        const checkSavedSession = async (markChecked = false) => {
            const savedUser = localStorage.getItem('quiz_user');
            if (!savedUser) {
                if (markChecked) setSessionChecked(true);
                return;
            }

            try {
                const res = await fetch('/api/me', { cache: 'no-store' });
                if (!isMounted) return;

                if (res.ok) {
                    const data = await res.json();
                    setUser(data.user);
                } else if (res.status === 401) {
                    setUser(null);
                }
            } catch (error) {
                console.error('Session check failed', error);
            } finally {
                if (isMounted && markChecked) setSessionChecked(true);
            }
        };

        const checkWhenActive = () => {
            if (document.visibilityState === 'visible') {
                checkSavedSession();
            }
        };

        checkSavedSession(true);
        window.addEventListener('focus', checkWhenActive);
        document.addEventListener('visibilitychange', checkWhenActive);

        return () => {
            isMounted = false;
            window.removeEventListener('focus', checkWhenActive);
            document.removeEventListener('visibilitychange', checkWhenActive);
        };
    }, []);

    useEffect(() => {
        if (user) {
            localStorage.setItem('quiz_user', JSON.stringify(user));
        } else {
            localStorage.removeItem('quiz_user');
        }
    }, [user]);

    const handleLogout = async () => {
        try {
            await fetch('/api/logout', { method: 'POST' });
        } catch (error) {
            console.error('Logout failed', error);
        } finally {
            setUser(null);
        }
    };

    if (!sessionChecked) {
        return (
            <div className="app-container">
                <header className="navbar fade-in">
                    <h1 className="logo">U-challenge</h1>
                </header>
                <main className="content fade-in">
                    <div style={{ maxWidth: '400px', margin: '4rem auto', textAlign: 'center', color: 'var(--text-muted)' }}>
                        Checking your session...
                    </div>
                </main>
            </div>
        );
    }

    return (
        <BrowserRouter>
            <Toaster position="top-right" />
            <div className="app-container">
                <header className="navbar fade-in">
                    <h1 className="logo">U-challenge</h1>
                    {user && (
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600 }}>{user.username} ({user.role})</span>
                            <button
                                onClick={handleLogout}
                                style={{
                                    background: 'transparent', border: '1px solid var(--border)',
                                    padding: '8px 16px', borderRadius: 'var(--radius-md)', cursor: 'pointer'
                                }}
                            >
                                Logout
                            </button>
                        </div>
                    )}
                </header>

                <main className="content fade-in">
                    <Routes>
                        <Route
                            path="/login"
                            element={!user ? <Login onLogin={setUser} /> : <Navigate to={user.role === 'admin' ? '/admin' : user.role === 'teacher' ? '/teacher' : '/student'} />}
                        />
                        {/* Admin Routes */}
                        <Route
                            path="/admin"
                            element={user && user.role === 'admin' ? <AdminDashboard user={user} /> : <Navigate to="/login" />}
                        />

                        {/* Teacher Routes */}
                        <Route
                            path="/teacher"
                            element={user && user.role === 'teacher' ? <TeacherDashboard user={user} /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/teacher/present/:sessionId"
                            element={user && user.role === 'teacher' ? <TeacherPresenter user={user} /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/teacher/review/:sessionId"
                            element={user && user.role === 'teacher' ? <TeacherSessionReview user={user} /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/teacher/exit-tickets"
                            element={user && user.role === 'teacher' ? <TeacherExitTickets user={user} /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/teacher/quick-checks"
                            element={user && user.role === 'teacher' ? <TeacherQuickChecks user={user} /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/teacher/quick-checks/:checkId/display"
                            element={user && user.role === 'teacher' ? <TeacherQuickCheckDisplay user={user} /> : <Navigate to="/login" />}
                        />

                        {/* Student Routes */}
                        <Route
                            path="/student"
                            element={user && user.role === 'student' ? <StudentDashboard user={user} /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/student/live/:sessionId"
                            element={user && user.role === 'student' ? <StudentLiveSession user={user} /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/student/exit-ticket/:ticketId"
                            element={user && user.role === 'student' ? <StudentExitTicket user={user} /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/student/quick-check/:checkId"
                            element={user && user.role === 'student' ? <StudentQuickCheck user={user} /> : <Navigate to="/login" />}
                        />

                        <Route path="*" element={<Navigate to="/login" />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    );
}

export default App;
