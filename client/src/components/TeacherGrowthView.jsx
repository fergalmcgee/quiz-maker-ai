import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
} from 'chart.js';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

export default function TeacherGrowthView({ user, classes }) {
    const [selectedClassId, setSelectedClassId] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState('');

    const [growthData, setGrowthData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!selectedClassId) return;

        const fetchAnalytics = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/analytics/growth?classId=${selectedClassId}`);
                if (res.ok) {
                    const data = await res.json();
                    setGrowthData(data);
                }
            } catch (error) {
                console.error("Failed to fetch analytics:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchAnalytics();
        // Reset student filter when class changes
        setSelectedStudentId('');
    }, [selectedClassId]);


    let chartData = null;

    if (growthData && growthData.labels.length > 0) {

        const datasets = [
            {
                label: 'Class Average',
                data: growthData.classAverages,
                borderColor: '#10B981', // green
                backgroundColor: 'rgba(16, 185, 129, 0.5)',
                tension: 0.3,
                borderWidth: 3,
                pointRadius: 5,
                spanGaps: true
            }
        ];

        if (selectedStudentId && growthData.studentData[selectedStudentId]) {
            const stuData = growthData.studentData[selectedStudentId];
            datasets.push({
                label: `${stuData.username}'s Score`,
                data: stuData.scores,
                borderColor: '#4F46E5', // indigo
                backgroundColor: 'rgba(79, 70, 229, 0.5)',
                borderDash: [5, 5],
                tension: 0.3,
                borderWidth: 3,
                pointRadius: 5,
                spanGaps: true
            });
        }

        chartData = {
            labels: growthData.labels,
            datasets
        };
    }

    const chartOptions = {
        responsive: true,
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    font: { family: "'Inter', sans-serif", size: 14 }
                }
            },
            tooltip: {
                callbacks: {
                    label: function (context) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            label += context.parsed.y + '%';
                        } else {
                            label += 'Missed session';
                        }
                        return label;
                    }
                }
            }
        },
        scales: {
            y: {
                min: 0,
                max: 100,
                ticks: {
                    callback: function (value) {
                        return value + '%';
                    }
                },
                title: {
                    display: true,
                    text: 'Score (%)'
                }
            }
        }
    };

    return (
        <div>
            <h2>Class Growth Analytics</h2>
            <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0 1.5rem 0' }}>
                Track how your classes and individual students are performing over time.
            </p>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>1. Select Class</label>
                    <select
                        value={selectedClassId}
                        onChange={e => setSelectedClassId(e.target.value)}
                        style={selectStyle}
                    >
                        <option value="" disabled>Choose a class...</option>
                        {classes.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>

                <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>2. Select Student (Optional)</label>
                    <select
                        value={selectedStudentId}
                        onChange={e => setSelectedStudentId(e.target.value)}
                        style={selectStyle}
                        disabled={!selectedClassId || !growthData || Object.keys(growthData.studentData).length === 0}
                    >
                        <option value="">Compare a student...</option>
                        {growthData && Object.entries(growthData.studentData).map(([id, data]) => (
                            <option key={id} value={id}>{data.username}</option>
                        ))}
                    </select>
                </div>
            </div>

            {loading && <p>Loading analytics data...</p>}

            {!loading && selectedClassId && !chartData && (
                <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: '#F8FAFC', borderRadius: 'var(--radius-md)', border: '1px dashed #CBD5E1' }}>
                    <p style={{ color: '#64748B', margin: 0 }}>Not enough data. This class needs to complete some sessions first.</p>
                </div>
            )}

            {!loading && chartData && (
                <div style={{ padding: '1.5rem', backgroundColor: 'white', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
                    <Line data={chartData} options={chartOptions} />
                </div>
            )}
        </div>
    );
}

const selectStyle = {
    width: '100%',
    padding: '0.75rem',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    backgroundColor: '#F9FAFB',
    fontSize: '1rem'
};
