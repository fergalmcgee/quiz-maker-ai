import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Send } from 'lucide-react';
import toast from 'react-hot-toast';

const trafficOptions = [
    { value: 'green', label: 'Green', description: 'I understand', color: '#16A34A', bg: '#DCFCE7' },
    { value: 'yellow', label: 'Yellow', description: 'I am partly sure', color: '#CA8A04', bg: '#FEF9C3' },
    { value: 'red', label: 'Red', description: 'I need help', color: '#DC2626', bg: '#FEE2E2' }
];

export default function StudentQuickCheck({ user }) {
    const { checkId } = useParams();
    const navigate = useNavigate();
    const [check, setCheck] = useState(null);
    const [trafficLight, setTrafficLight] = useState('');
    const [textAnswer, setTextAnswer] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    useEffect(() => {
        const loadCheck = async () => {
            try {
                const res = await fetch(`/api/quick-checks/${checkId}`, {
                    headers: { 'x-user-id': user.id, 'x-user-role': user.role }
                });
                if (!res.ok) throw new Error('Quick check not found');
                setCheck(await res.json());
            } catch (error) {
                toast.error(error.message);
                navigate('/student');
            } finally {
                setLoading(false);
            }
        };
        loadCheck();
    }, [checkId, navigate, user.id, user.role]);

    const submitResponse = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const res = await fetch(`/api/quick-checks/${checkId}/responses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': user.id,
                    'x-user-role': user.role
                },
                body: JSON.stringify({ trafficLight, textAnswer })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Could not submit response');
            setSubmitted(true);
            toast.success('Response submitted');
        } catch (error) {
            toast.error(error.message);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading quick check...</div>;

    if (submitted) {
        return (
            <div className="fade-in" style={{ maxWidth: '620px', margin: '3rem auto', padding: '2rem', textAlign: 'center', backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)' }}>
                <CheckCircle2 size={64} color="#10B981" style={{ marginBottom: '1rem' }} />
                <h1 style={{ margin: '0 0 0.75rem 0' }}>Thanks, {user.username}</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', lineHeight: 1.5 }}>
                    Your quick check response has been sent.
                </p>
                <button onClick={() => navigate('/student')} style={{ marginTop: '1.5rem', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', padding: '0.85rem 1.5rem', cursor: 'pointer', fontWeight: 800 }}>
                    Back to Dashboard
                </button>
            </div>
        );
    }

    return (
        <div className="fade-in" style={{ maxWidth: '720px', margin: '0 auto', padding: '2rem' }}>
            <button onClick={() => navigate('/student')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '2rem', padding: 0, fontWeight: 700 }}>
                <ArrowLeft size={20} /> Back to Dashboard
            </button>

            <form onSubmit={submitResponse} style={{ backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: '2rem', border: '1px solid var(--border)' }}>
                <div style={{ color: 'var(--primary)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                    {check.mode === 'traffic_light' ? 'Traffic Light Check' : 'Mini Whiteboard'}
                </div>
                <h1 style={{ margin: '0 0 0.75rem 0' }}>{check.title}</h1>
                <p style={{ color: 'var(--text-main)', fontSize: '1.3rem', lineHeight: 1.45, marginBottom: '2rem' }}>{check.question}</p>

                {check.mode === 'traffic_light' ? (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                            {trafficOptions.map(option => (
                                <button key={option.value} type="button" onClick={() => setTrafficLight(option.value)} style={{ backgroundColor: trafficLight === option.value ? option.bg : 'white', color: option.color, border: `3px solid ${trafficLight === option.value ? option.color : 'var(--border)'}`, borderRadius: 'var(--radius-lg)', padding: '1.25rem 0.75rem', cursor: 'pointer', fontWeight: 900 }}>
                                    <div style={{ fontSize: '1.4rem' }}>{option.label}</div>
                                    <div style={{ fontSize: '0.8rem', marginTop: '0.35rem' }}>{option.description}</div>
                                </button>
                            ))}
                        </div>
                        <label style={{ display: 'block', fontWeight: 800, marginBottom: '0.5rem' }}>Optional comment</label>
                        <textarea value={textAnswer} onChange={e => setTextAnswer(e.target.value)} rows={3} placeholder="Add a short note if you want..." style={{ width: '100%', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', resize: 'vertical', marginBottom: '1.5rem' }} />
                    </>
                ) : (
                    <>
                        <label style={{ display: 'block', fontWeight: 800, marginBottom: '0.5rem' }}>Your whiteboard response</label>
                        <textarea value={textAnswer} onChange={e => setTextAnswer(e.target.value)} required rows={6} placeholder="Type your answer..." style={{ width: '100%', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', resize: 'vertical', marginBottom: '1.5rem', fontSize: '1.05rem', lineHeight: 1.5 }} />
                    </>
                )}

                <button type="submit" disabled={submitting} style={{ width: '100%', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', padding: '1rem', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 900, fontSize: '1.05rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <Send size={20} /> {submitting ? 'Submitting...' : 'Submit Response'}
                </button>
            </form>
        </div>
    );
}
