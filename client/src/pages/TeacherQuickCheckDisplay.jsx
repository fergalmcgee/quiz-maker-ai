import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Monitor, Square } from 'lucide-react';
import toast from 'react-hot-toast';

const lightMeta = {
    green: { label: 'Green', color: '#16A34A', bg: '#DCFCE7' },
    yellow: { label: 'Yellow', color: '#CA8A04', bg: '#FEF9C3' },
    red: { label: 'Red', color: '#DC2626', bg: '#FEE2E2' }
};

export default function TeacherQuickCheckDisplay({ user }) {
    const { checkId } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchResponses = async () => {
        try {
            const res = await fetch(`/api/quick-checks/${checkId}/responses`, {
                headers: { 'x-user-id': user.id, 'x-user-role': user.role }
            });
            if (!res.ok) throw new Error('Could not load quick check');
            setData(await res.json());
        } catch (error) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchResponses();
        const interval = setInterval(fetchResponses, 2500);
        return () => clearInterval(interval);
    }, [checkId]);

    const counts = useMemo(() => {
        const initial = { green: 0, yellow: 0, red: 0 };
        (data?.responses || []).forEach(response => {
            if (initial[response.traffic_light] !== undefined) initial[response.traffic_light]++;
        });
        return initial;
    }, [data]);

    const submittedIds = new Set((data?.responses || []).map(response => Number(response.student_id)));
    const waitingStudents = (data?.roster || []).filter(student => !submittedIds.has(Number(student.id)));

    const toggleReveal = async () => {
        const nextReveal = data?.check?.reveal_responses !== 1;
        const res = await fetch(`/api/quick-checks/${checkId}/reveal`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': user.id,
                'x-user-role': user.role
            },
            body: JSON.stringify({ reveal: nextReveal })
        });
        if (res.ok) {
            fetchResponses();
        }
    };

    const updateStatus = async (status) => {
        await fetch(`/api/quick-checks/${checkId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': user.id,
                'x-user-role': user.role
            },
            body: JSON.stringify({ status })
        });
        fetchResponses();
    };

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading display...</div>;
    if (!data) return <div style={{ padding: '2rem', textAlign: 'center' }}>Quick check not found.</div>;

    const { check, responses, roster } = data;
    const revealed = check.reveal_responses === 1;

    return (
        <div className="fade-in" style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
            <button onClick={() => navigate('/teacher/quick-checks')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '1.5rem', padding: 0, fontWeight: 700 }}>
                <ArrowLeft size={20} /> Back to Quick Checks
            </button>

            <header style={{ backgroundColor: '#111827', color: 'white', borderRadius: 'var(--radius-lg)', padding: '2rem', boxShadow: 'var(--shadow-lg)', marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#A7F3D0', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                            <Monitor size={18} /> {check.mode === 'traffic_light' ? 'Traffic Light Check' : 'Mini Whiteboard'}
                        </div>
                        <h1 style={{ margin: '0 0 0.75rem 0', fontSize: '2.1rem' }}>{check.title}</h1>
                        <p style={{ margin: 0, fontSize: '1.35rem', lineHeight: 1.45, color: '#E5E7EB' }}>{check.question}</p>
                    </div>
                    <div style={{ textAlign: 'right', color: '#CBD5E1', fontWeight: 700 }}>
                        <div>{check.class_name}</div>
                        <div>{responses.length} / {roster.length} submitted</div>
                        <div style={{ textTransform: 'capitalize' }}>{check.status}</div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                    {check.mode === 'whiteboard' && (
                        <button onClick={toggleReveal} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', backgroundColor: revealed ? '#FEE2E2' : '#A7F3D0', color: revealed ? '#991B1B' : '#064E3B', border: 'none', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', cursor: 'pointer', fontWeight: 900 }}>
                            {revealed ? <EyeOff size={18} /> : <Eye size={18} />} {revealed ? 'Hide Responses' : 'Reveal All Responses'}
                        </button>
                    )}
                    {check.status === 'open' && (
                        <button onClick={() => updateStatus('closed')} style={{ backgroundColor: 'white', color: '#111827', border: 'none', borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', cursor: 'pointer', fontWeight: 900 }}>
                            End Quick Check
                        </button>
                    )}
                </div>
            </header>

            {check.mode === 'traffic_light' ? (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                        {['green', 'yellow', 'red'].map(light => (
                            <div key={light} style={{ backgroundColor: lightMeta[light].bg, color: lightMeta[light].color, borderRadius: 'var(--radius-lg)', padding: '1.5rem', textAlign: 'center', border: `1px solid ${lightMeta[light].color}` }}>
                                <div style={{ fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase' }}>{lightMeta[light].label}</div>
                                <div style={{ fontSize: '4rem', fontWeight: 900 }}>{counts[light]}</div>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                        {['green', 'yellow', 'red'].map(light => (
                            <section key={light} style={{ backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', padding: '1rem' }}>
                                <h2 style={{ marginTop: 0, color: lightMeta[light].color }}>{lightMeta[light].label}</h2>
                                <div style={{ display: 'grid', gap: '0.65rem' }}>
                                    {responses.filter(response => response.traffic_light === light).map(response => (
                                        <div key={response.id} style={{ backgroundColor: lightMeta[light].bg, borderRadius: 'var(--radius-md)', padding: '0.75rem', fontWeight: 800 }}>
                                            {response.username}
                                            {response.text_answer && <div style={{ marginTop: '0.35rem', fontWeight: 500, color: 'var(--text-main)' }}>{response.text_answer}</div>}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                </>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
                    {responses.map(response => (
                        <div key={response.id} style={{ backgroundColor: 'white', border: '1px solid #E2E8F0', borderTop: '6px solid #4F46E5', borderRadius: 'var(--radius-lg)', padding: '1rem', boxShadow: 'var(--shadow-sm)', minHeight: '150px' }}>
                            <h2 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem' }}>{response.username}</h2>
                            {revealed ? (
                                <p style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'var(--text-main)', lineHeight: 1.5 }}>{response.text_answer}</p>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#4F46E5', fontWeight: 900 }}>
                                    <Square size={18} fill="currentColor" /> Submitted
                                </div>
                            )}
                        </div>
                    ))}
                    {waitingStudents.map(student => (
                        <div key={student.id} style={{ backgroundColor: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: 'var(--radius-lg)', padding: '1rem', color: 'var(--text-muted)' }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{student.username}</h2>
                            <p>Waiting...</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
