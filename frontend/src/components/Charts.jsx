import React, { useRef, useEffect, useMemo } from 'react';
import { useTheme } from '../store/ThemeContext';
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler } from 'chart.js';
import { Doughnut, Pie, Line, Bar } from 'react-chartjs-2';

ChartJS.register(ArcElement, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

const STAGE_COLORS_HEX = {
  received: '#64748b', inspection: '#3b82f6', diagnosis: '#6366f1', quotation: '#f59e0b',
  approved: '#10b981', rejected: '#ef4444', recovery_in_progress: '#00d4ff', imaging: '#7c3aed',
  data_extraction: '#ec4899', verification: '#fbbf24', completed: '#10b981', delivered: '#00d4ff', failed: '#dc2626',
};

const chartOptions = {
  responsive: true,
  maintainAspectRatio: true,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          font: { size: 11, family: 'var(--font-mono)' },
          // scriptable: choose color based on document theme
          color: (ctx) => (document.documentElement.getAttribute('data-theme') === 'dark' ? '#f8fafc' : '#0f172a'),
          padding: 12,
          usePointStyle: true,
        },
      },
      tooltip: {
        // scriptable tooltip colors for theme contrast
        backgroundColor: (ctx) => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(0,0,0,0.8)' : '#ffffff'),
        titleColor: (ctx) => (document.documentElement.getAttribute('data-theme') === 'dark' ? '#f8fafc' : '#0f172a'),
        bodyColor: (ctx) => (document.documentElement.getAttribute('data-theme') === 'dark' ? '#f8fafc' : '#0f172a'),
        borderColor: (ctx) => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)'),
        titleFont: { size: 12 },
        bodyFont: { size: 11 },
        padding: 10,
        borderRadius: 6,
        cornerRadius: 4,
      },
    },
};

export function StageDistributionChart({ data = [] }) {
  if (!data.length) return <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>No stage data available</div>;
  
  const total = data.reduce((s, d) => s + parseInt(d.count), 0);
  const chartData = {
    labels: data.map(d => d.stage?.replace(/_/g, ' ') || 'Unknown'),
    datasets: [{
      data: data.map(d => parseInt(d.count)),
      backgroundColor: data.map(d => STAGE_COLORS_HEX[d.stage] || '#94a3b8'),
      borderColor: 'var(--bg-card)',
      borderWidth: 3,
      hoverBorderWidth: 4,
      hoverOffset: 8,
    }],
  };

  const { theme } = useTheme();
  const chartRef = useRef(null);
  const options = useMemo(() => {
    const themeIsDark = theme !== 'light';
    const base = JSON.parse(JSON.stringify(chartOptions));
    if (base.plugins?.legend?.labels) base.plugins.legend.labels.color = themeIsDark ? '#f8fafc' : '#0f172a';
    if (base.plugins?.tooltip) {
      base.plugins.tooltip.backgroundColor = themeIsDark ? 'rgba(0,0,0,0.8)' : '#ffffff';
      base.plugins.tooltip.titleColor = themeIsDark ? '#f8fafc' : '#0f172a';
      base.plugins.tooltip.bodyColor = themeIsDark ? '#f8fafc' : '#0f172a';
      base.plugins.tooltip.borderColor = themeIsDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';
    }
    base.plugins = { ...base.plugins, tooltip: { ...base.plugins.tooltip, callbacks: { label: (context) => {
      const count = context.parsed;
      const pct = ((count / total) * 100).toFixed(1);
      return `${count} cases (${pct}%)`;
    } } } };
    return base;
  }, [theme, total]);

  useEffect(() => {
    if (chartRef.current && chartRef.current.update) chartRef.current.update();
  }, [theme]);

  return (
    <div style={{ position: 'relative', height: 220 }}>
      <Doughnut ref={chartRef} data={chartData} options={options} />
    </div>
  );
}

export function RevenueTrendChart({ data = [] }) {
  if (!data.length) return <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>No revenue data</div>;

  const chartData = {
    labels: data.map(d => new Date(d.month).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })),
    datasets: [{
      label: 'Revenue (₹)',
      data: data.map(d => parseFloat(d.revenue || 0)),
      fill: true,
      backgroundColor: 'rgba(0,212,255,0.1)',
      borderColor: 'var(--accent-primary)',
      borderWidth: 2,
      tension: 0.4,
      pointBackgroundColor: 'var(--accent-primary)',
      pointBorderColor: 'var(--bg-card)',
      pointBorderWidth: 2,
      pointRadius: 5,
      pointHoverRadius: 7,
    }],
  };

  const { theme } = useTheme();
  const chartRef = useRef(null);
  const options = useMemo(() => {
    const themeIsDark = theme !== 'light';
    const base = JSON.parse(JSON.stringify(chartOptions));
    if (base.plugins?.legend?.labels) base.plugins.legend.labels.color = themeIsDark ? '#f8fafc' : '#0f172a';
    if (base.plugins?.tooltip) {
      base.plugins.tooltip.backgroundColor = themeIsDark ? 'rgba(0,0,0,0.8)' : '#ffffff';
      base.plugins.tooltip.titleColor = themeIsDark ? '#f8fafc' : '#0f172a';
      base.plugins.tooltip.bodyColor = themeIsDark ? '#f8fafc' : '#0f172a';
      base.plugins.tooltip.borderColor = themeIsDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';
    }
    base.scales = { y: { beginAtZero: true, ticks: { callback: (v) => `₹${(v / 1000).toFixed(0)}k` } } };
    base.plugins = { ...base.plugins, tooltip: { ...base.plugins.tooltip, callbacks: { label: (context) => `₹${parseFloat(context.parsed.y).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` } } };
    return base;
  }, [theme]);

  useEffect(() => {
    if (chartRef.current && chartRef.current.update) chartRef.current.update();
  }, [theme]);

  return (
    <div style={{ position: 'relative', height: 220 }}>
      <Line ref={chartRef} data={chartData} options={options} />
    </div>
  );
}

export function FailureTypeChart({ data = [] }) {
  if (!data.length) return <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>No failure data</div>;

  const colors = { logical: '#3b82f6', firmware: '#6366f1', electrical: '#f59e0b', mechanical: '#ef4444', unknown: '#64748b' };
  const chartData = {
    labels: data.map(d => d.label),
    datasets: [{
      label: 'Count',
      data: data.map(d => d.count),
      backgroundColor: data.map(d => colors[d.label] || '#94a3b8'),
      borderColor: 'var(--bg-card)',
      borderWidth: 2,
      hoverBackgroundColor: data.map(d => colors[d.label] || '#94a3b8'),
      borderRadius: 6,
    }],
  };

  const options = {
    ...chartOptions,
    indexAxis: 'y',
    scales: { x: { beginAtZero: true } },
  };

  return (
    <div style={{ position: 'relative', height: Math.max(180, data.length * 32) }}>
      <Bar data={chartData} options={options} />
    </div>
  );
}

export function BrandDistributionChart({ data = [] }) {
  if (!data.length) return <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>No brand data</div>;

  const colors = ['#00d4ff', '#7c3aed', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#ec4899', '#fbbf24'];
  const chartData = {
    labels: data.map(d => d.label),
    datasets: [{
      label: 'Cases',
      data: data.map(d => d.count),
      backgroundColor: data.map((_, i) => colors[i % colors.length]),
      borderColor: 'var(--bg-card)',
      borderWidth: 2,
      borderRadius: 6,
    }],
  };

  const options = {
    ...chartOptions,
    scales: { y: { beginAtZero: true } },
  };

  return (
    <div style={{ position: 'relative', height: 220 }}>
      <Bar data={chartData} options={options} />
    </div>
  );
}

export function CaseStatusChart({ total = 0, active = 0, completed = 0, failed = 0 }) {
  const chartData = {
    labels: ['Active', 'Completed', 'Failed'],
    datasets: [{
      data: [active, completed, failed],
      backgroundColor: ['#00d4ff', '#10b981', '#ef4444'],
      borderColor: 'var(--bg-card)',
      borderWidth: 3,
      hoverBorderWidth: 4,
      hoverOffset: 6,
    }],
  };

  const options = {
    ...chartOptions,
    plugins: {
      ...chartOptions.plugins,
      tooltip: {
        ...chartOptions.plugins.tooltip,
        callbacks: {
          label: (context) => {
            const count = context.parsed;
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
            return `${count} (${pct}%)`;
          },
        },
      },
    },
  };

  return (
    <div style={{ position: 'relative', height: 220 }}>
      <Pie data={chartData} options={options} />
    </div>
  );
}

export function PendingPaymentChart({ data = [] }) {
  if (!data.length) return <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>💰 No pending data</div>;

  const chartData = {
    labels: data.map(d => d.label),
    datasets: [{
      label: 'Pending Amount (₹)',
      data: data.map(d => parseFloat(d.amount || 0)),
      backgroundColor: 'rgba(239,68,68,0.7)',
      borderColor: '#ef4444',
      borderWidth: 2,
      borderRadius: 6,
    }],
  };

  const options = {
    ...chartOptions,
    indexAxis: 'y',
    scales: { x: { beginAtZero: true, ticks: { callback: (v) => `₹${(v / 1000).toFixed(0)}k` } } },
  };

  return (
    <div style={{ position: 'relative', height: Math.max(200, data.length * 40) }}>
      <Bar data={chartData} options={options} />
    </div>
  );
}
