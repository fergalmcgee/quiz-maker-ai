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
                const res = await fetch(`/api/sessions/${sessionId}/teacher-results`, {
                    headers: {
                        'x-user-id': user.id,
                        'x-user-role': user.role
                    }
                });
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

    const { session, questions, participants, retakeSummary } = results;

    const handleDownloadCSV = async () => {
        try {
            const res = await fetch(`/api/sessions/${sessionId}/export`, {
                headers: {
                    'x-user-id': user.id,
                    'x-user-role': user.role
                }
            });
            if (!res.ok) throw new Error('Failed to generate CSV');

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Results-${session.name || session.quizTitle}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Download failed:', error);
            alert('Failed to download CSV');
        }
    };

    // --- Analytics Logic ---
    const totalClassScore = participants.reduce((sum, p) => sum + p.score, 0);
    const totalClassPossible = participants.reduce((sum, p) => sum + p.totalQuestions, 0);
    const classAverage = totalClassPossible > 0 ? Math.round((totalClassScore / totalClassPossible) * 100) : 0;

    const questionStats = questions.map(q => {
        const totalResponses = q.options.reduce((sum, opt) => sum + opt.count, 0);
        const correctOptions = q.options.filter(opt => opt.is_correct);
        const correctResponses = correctOptions.reduce((sum, opt) => sum + opt.count, 0);
        const accuracy = totalResponses > 0 ? Math.round((correctResponses / totalResponses) * 100) : 0;

        const incorrectOptions = q.options.filter(opt => !opt.is_correct);
        let topDistractor = null;
        if (incorrectOptions.length > 0) {
            topDistractor = incorrectOptions.reduce((prev, current) => (prev.count > current.count) ? prev : current);
            if (topDistractor.count === 0) topDistractor = null;
        }

        return { ...q, totalResponses, correctResponses, accuracy, topDistractor };
    });

    const struggleAreas = questionStats.filter(q => q.totalResponses > 0 && q.accuracy < 60).sort((a, b) => a.accuracy - b.accuracy);
    const retakeStudents = participants
        .filter(p => p.retakeCount > 0)
        .sort((a, b) => b.improvement - a.improvement);

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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
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
                    </div>
                    <button
                        onClick={handleDownloadCSV}
                        style={{
                            backgroundColor: 'white', color: 'var(--primary)', border: '1px solid var(--primary)',
                            padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                            fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}
                    >
                        Download CSV
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginTop: '2.5rem' }}>
                    <div style={{ backgroundColor: '#F0FDF4', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid #BBF7D0' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: '#166534', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Class Average</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#10B981' }}>{classAverage}%</div>
                    </div>
                    <div style={{ backgroundColor: '#EFF6FF', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid #BFDBFE' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: '#1E40AF', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Participants</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#2563EB' }}>{participants.length}</div>
                    </div>
                    <div style={{ backgroundColor: struggleAreas.length > 0 ? '#FEF2F2' : '#F9FAFB', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: `1px solid ${struggleAreas.length > 0 ? '#FECACA' : '#E5E7EB'}` }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: struggleAreas.length > 0 ? '#991B1B' : '#6B7280', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Needs Review</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 800, color: struggleAreas.length > 0 ? '#DC2626' : '#9CA3AF' }}>{struggleAreas.length} <span style={{fontSize: '1rem', fontWeight: 600}}>Q's</span></div>
                    </div>
                    <div style={{ backgroundColor: '#EEF2FF', padding: '1.5rem', borderRadius: 'var(--radius-md)', border: '1px solid #C7D2FE' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: '#3730A3', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Retake Growth</div>
                        <div style={{ fontSize: '2.5rem', fontWeight: 800, color: '#4F46E5' }}>{retakeSummary?.retakeCount || 0}</div>
                        <div style={{ fontSize: '0.85rem', color: '#3730A3', fontWeight: 600 }}>Avg change: {(retakeSummary?.averageImprovement || 0) >= 0 ? '+' : ''}{retakeSummary?.averageImprovement || 0}</div>
                    </div>
                </div>
            </div>

            {retakeStudents.length > 0 && (
                <div style={{ marginBottom: '3rem' }}>
                    <h2 style={{ marginBottom: '1.5rem' }}>Retake Improvement View</h2>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {retakeStudents.map(p => (
                            <div key={p.id} style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                                <div>
                                    <div style={{ fontWeight: 800, color: 'var(--text-main)' }}>{p.username}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                                        Original {p.originalPercentage}% → Latest {p.latestPercentage}% · Attempt {p.attemptNumber}
                                    </div>
                                </div>
                                <div style={{ color: p.improvement >= 0 ? '#047857' : '#B91C1C', fontWeight: 900, fontSize: '1.25rem' }}>
                                    {p.improvement >= 0 ? '+' : ''}{p.improvement}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {struggleAreas.length > 0 && (
                <div style={{ marginBottom: '3rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
                        <h2 style={{ margin: 0, color: '#991B1B' }}>⚠️ Struggle Areas</h2>
                        <span style={{ backgroundColor: '#FEF2F2', color: '#DC2626', padding: '0.2rem 0.75rem', borderRadius: 'var(--radius-full)', fontSize: '0.85rem', fontWeight: 600, border: '1px solid #FCA5A5' }}>&lt; 60% Accuracy</span>
                    </div>
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {struggleAreas.map(q => (
                            <div key={q.questionId} style={{ backgroundColor: '#FEF2F2', padding: '1.5rem', borderRadius: 'var(--radius-md)', borderLeft: '6px solid #EF4444', boxShadow: 'var(--shadow-sm)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#7F1D1D', flex: 1, paddingRight: '1rem' }}>"{q.questionText}"</h3>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#DC2626' }}>{q.accuracy}%</div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.95rem' }}>
                                    <div style={{ backgroundColor: 'white', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid #FCA5A5' }}>
                                        <div style={{ color: '#991B1B', fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Top Distractor (Common Mistake)</div>
                                        {q.topDistractor ? (
                                            <div>"{q.topDistractor.text}" <span style={{ color: '#DC2626', fontWeight: 600 }}>({q.topDistractor.count} votes)</span></div>
                                        ) : (
                                            <div style={{ color: 'var(--text-muted)' }}>None defined</div>
                                        )}
                                    </div>
                                    <div style={{ backgroundColor: '#F0FDF4', padding: '1rem', borderRadius: 'var(--radius-sm)', border: '1px solid #BBF7D0' }}>
                                        <div style={{ color: '#166534', fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Correct Answer</div>
                                        {q.options.filter(o => o.is_correct).map(o => (
                                            <div key={o.id}>"{o.text}" <span style={{ color: '#10B981', fontWeight: 600 }}>({o.count} votes)</span></div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

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
                                {p.attemptNumber > 1 && (
                                    <p style={{ color: '#3730A3', fontSize: '0.8rem', margin: '0.5rem 0 0 0', fontWeight: 700 }}>
                                        {p.originalPercentage}% → {p.latestPercentage}% ({p.improvement >= 0 ? '+' : ''}{p.improvement}) · Attempt {p.attemptNumber}
                                    </p>
                                )}
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
