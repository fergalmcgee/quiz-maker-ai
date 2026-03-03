import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, CheckCircle, XCircle } from 'lucide-react';

export default function TeacherSessionReview({ user }) {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const [results, setResults] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchResults = async () => {
            try {
                const res = await fetch(`http://localhost:3001/api/sessions/${sessionId}/teacher-results`);
                if (res.ok) {
                    const data = await res.json();
                    setResults(data);
                } else {
                    console.error("Failed to fetch results");
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchResults();
    }, [sessionId]);

    if (loading) return <div className="fade-in" style={{ padding: '2rem' }}>Loading results...</div>;
    if (!results) return <div className="fade-in" style={{ padding: '2rem' }}>Results not found.</div>;

    const { session, questions, participants } = results;

    return (
        <div className="fade-in" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
            <button
                onClick={() => navigate('/teacher')}
                style={{
                    background: 'transparent', border: 'none', color: 'var(--text-muted)',
                    display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer',
                    marginBottom: '2rem', padding: 0, fontWeight: 600
                }}
            >
                <ArrowLeft size={20} /> Back to Dashboard
            </button>

            <div style={{ backgroundColor: 'var(--surface)', padding: '2rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', marginBottom: '2rem' }}>
                <h1 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-main)' }}>{session.name || session.quizTitle}</h1>
                <div style={{ display: 'flex', gap: '1rem', color: 'var(--text-muted)' }}>
                    <span>Mode: <strong style={{ textTransform: 'capitalize' }}>{session.mode}</strong></span>
                    <span>•</span>
                    <span>Status: <strong style={{ textTransform: 'capitalize' }}>{session.status}</strong></span>
                    {session.is_archived === 1 && (
                        <>
                            <span>•</span>
                            <span style={{ color: '#D97706', fontWeight: 600 }}>Archived</span>
                        </>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem', padding: '1rem', backgroundColor: 'var(--background)', borderRadius: 'var(--radius-md)' }}>
                    <Users size={20} color="var(--primary)" />
                    <strong>{participants.length} Student{participants.length !== 1 ? 's' : ''} Participated</strong>
                </div>
            </div>

            {participants.length > 0 && (
                <div style={{ marginBottom: '3rem' }}>
                    <h2 style={{ marginBottom: '1.5rem' }}>Individual Student Results</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                        {participants.map(p => (
                            <div key={p.id} style={{
                                backgroundColor: 'var(--surface)',
                                padding: '1.5rem',
                                borderRadius: 'var(--radius-md)',
                                boxShadow: 'var(--shadow-sm)',
                                borderTop: `4px solid ${p.percentage >= 70 ? '#10B981' : p.percentage >= 40 ? '#F59E0B' : '#EF4444'}`
                            }}>
                                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.2rem', color: 'var(--text-main)' }}>{p.username}</h3>
                                <div style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0.5rem 0', color: p.percentage >= 70 ? '#10B981' : p.percentage >= 40 ? '#F59E0B' : '#EF4444' }}>
                                    {p.percentage}%
                                </div>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                                    {p.score} / {p.totalQuestions} correct
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <h2 style={{ marginBottom: '1.5rem' }}>Question Breakdown</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {questions.map((q, idx) => {
                    const totalResponses = q.options.reduce((sum, opt) => sum + opt.count, 0);

                    return (
                        <div key={q.questionId} style={{ backgroundColor: 'var(--surface)', padding: '1.5rem', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)' }}>
                            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>{idx + 1}. {q.questionText}</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>Total Responses: {totalResponses}</p>

                            {q.imageUrl && (
                                <img src={q.imageUrl} alt="Question Context" style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain', borderRadius: 'var(--radius-sm)', marginBottom: '1rem' }} />
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {q.questionType === 'short_answer' ? (
                                    q.options.filter(opt => opt.count > 0).map(opt => (
                                        <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem', backgroundColor: '#F9FAFB', borderRadius: 'var(--radius-sm)' }}>
                                            <div style={{ flex: 1, fontWeight: opt.is_correct ? 600 : 400, color: opt.is_correct ? 'var(--secondary)' : 'var(--text-main)' }}>
                                                "{opt.text}"
                                            </div>
                                            <div style={{ width: '60px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>
                                                {opt.count}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    q.options.map(opt => {
                                        const percentage = totalResponses > 0 ? Math.round((opt.count / totalResponses) * 100) : 0;
                                        const barColor = opt.is_correct ? 'var(--secondary)' : '#E5E7EB';
                                        const textColor = opt.is_correct ? 'var(--secondary)' : 'var(--text-main)';

                                        return (
                                            <div key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    {opt.is_correct ? <CheckCircle size={18} color="var(--secondary)" style={{ flexShrink: 0 }} /> : <div style={{ width: 18, height: 18, flexShrink: 0 }} />}
                                                    <span style={{ fontWeight: opt.is_correct ? 600 : 400, color: textColor, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{opt.text}</span>
                                                </div>
                                                <div style={{ width: '200px', height: '12px', backgroundColor: '#F3F4F6', borderRadius: '1rem', overflow: 'hidden', flexShrink: 0 }}>
                                                    <div style={{ height: '100%', width: `${percentage}%`, backgroundColor: barColor, transition: 'width 1s ease-out' }} />
                                                </div>
                                                <div style={{ width: '60px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>
                                                    {opt.count} ({percentage}%)
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
