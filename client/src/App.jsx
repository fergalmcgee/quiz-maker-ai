import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import TeacherDashboard from './pages/TeacherDashboard';
import TeacherPresenter from './pages/TeacherPresenter';
import StudentDashboard from './pages/StudentDashboard';
import StudentLiveSession from './pages/StudentLiveSession';
import AdminDashboard from './pages/AdminDashboard';
import TeacherSessionReview from './pages/TeacherSessionReview';

function App() {
    const [user, setUser] = useState(null);

    return (
        <BrowserRouter>
            <div className="app-container">
                <header className="navbar fade-in">
                    <h1 className="logo">U-challenge</h1>
                    {user && (
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600 }}>{user.username} ({user.role})</span>
                            <button
                                onClick={() => setUser(null)}
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
                            element={user && user.role === 'teacher' ? <TeacherPresenter /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/teacher/review/:sessionId"
                            element={user && user.role === 'teacher' ? <TeacherSessionReview user={user} /> : <Navigate to="/login" />}
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

                        <Route path="*" element={<Navigate to="/login" />} />
                    </Routes>
                </main>
            </div>
        </BrowserRouter>
    );
}

export default App;
