import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './DonorsPage.css';

function DonorsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState({ matches: [], stats: {}, topMatches: [], summary: {} });
  const [sortKey, setSortKey] = useState('bestScore');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('all');

  useEffect(() => {
    async function fetchMatches() {
      try {
        const token = localStorage.getItem('accessToken');
        const res = await fetch('/api/donors/matches', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          throw new Error('Failed to fetch donor matches');
        }
        const result = await res.json();
        setData(result);
        setLoading(false);
      } catch (e) {
        setError(e.message || 'Failed to load matches');
        setLoading(false);
      }
    }
    fetchMatches();
  }, []);

  // Soft-matching brand filter
  const isBrandMatch = (brandField, brandKey) => {
    if (!brandField) return false;
    const b = brandField.toLowerCase();
    if (brandKey === 'seagate') return b.includes('seagate');
    if (brandKey === 'wd') return b.includes('wd') || b.includes('western');
    if (brandKey === 'toshiba') return b.includes('toshiba');
    if (brandKey === 'hitachi') return b.includes('hitachi') || b.includes('hgst');
    if (brandKey === 'samsung') return b.includes('samsung');
    return false;
  };

  // Highlighting matching terms helper
  const highlightText = (text, searchWord) => {
    if (text === null || text === undefined) return '—';
    const textStr = String(text);
    if (!searchWord || !searchWord.trim()) return textStr;
    const escaped = searchWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const splitRegex = new RegExp(`(${escaped})`, 'gi');
    const testRegex = new RegExp(`(${escaped})`, 'i');
    const parts = textStr.split(splitRegex);
    return parts.map((part, i) =>
      testRegex.test(part) ? <span key={i} className="donors-highlight">{part}</span> : part
    );
  };

  if (loading) {
    return (
      <div className="donors-loading-container">
        <div className="donors-spinner" />
        <div className="donors-loading-text">Computing donor drive compatibility metrics…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="donors-error-container">
        <h3>Compatibility Engine Error</h3>
        <p>{error}</p>
      </div>
    );
  }

  const { matches = [], stats = {} } = data;

  // 1. Filter by Brand (Stat Card / Tab). Matches cases or donors for the selected brand.
  let filtered = matches;
  if (selectedBrand !== 'all') {
    filtered = matches.map(m => {
      const caseBrandMatches = isBrandMatch(m.caseDrive.device_brand, selectedBrand);
      const donorMatches = m.donorMatches.filter(dm =>
        isBrandMatch(dm.donorItem.company || dm.donorItem.brand, selectedBrand)
      );

      if (caseBrandMatches) {
        return m;
      }

      if (donorMatches.length > 0) {
        return { ...m, donorMatches };
      }

      return null;
    }).filter(Boolean);
  }

  // 2. Filter by Search Query
  const query = search.trim().toLowerCase();
  if (query) {
    filtered = filtered.map(m => {
      // Find which donor drives match the search term
      const matchedDonors = m.donorMatches.filter(dm => {
        const d = dm.donorItem;
        return (
          String(m.caseDrive.case_number || '').toLowerCase().includes(query) ||
          String(m.caseDrive.serial_number || '').toLowerCase().includes(query) ||
          String(m.caseDrive.pcb_number || '').toLowerCase().includes(query) ||
          String(m.caseDrive.device_model || '').toLowerCase().includes(query) ||
          String(m.caseDrive.device_brand || '').toLowerCase().includes(query) ||
          String(m.caseDrive.first_name || '').toLowerCase().includes(query) ||
          String(m.caseDrive.last_name || '').toLowerCase().includes(query) ||
          String(d.stock_number || d.sku || '').toLowerCase().includes(query) ||
          String(d.serial_number || '').toLowerCase().includes(query) ||
          String(d.pcb_number || '').toLowerCase().includes(query) ||
          String(d.model || d.name || '').toLowerCase().includes(query) ||
          String(d.ssd_number || '').toLowerCase().includes(query) ||
          String(m.caseDrive.ssd_number || m.caseDrive.customFields?.ssd_number || '').toLowerCase().includes(query)
        );
      });

      // Also support matching case itself
      const caseMatchesQuery = (
        String(m.caseDrive.case_number || '').toLowerCase().includes(query) ||
        String(m.caseDrive.serial_number || '').toLowerCase().includes(query) ||
        String(m.caseDrive.pcb_number || '').toLowerCase().includes(query) ||
        String(m.caseDrive.device_model || '').toLowerCase().includes(query) ||
        String(m.caseDrive.device_brand || '').toLowerCase().includes(query) ||
        String(m.caseDrive.first_name || '').toLowerCase().includes(query) ||
        String(m.caseDrive.last_name || '').toLowerCase().includes(query) ||
        String(m.caseDrive.ssd_number || m.caseDrive.customFields?.ssd_number || '').toLowerCase().includes(query)
      );

      if (caseMatchesQuery) {
        return m; // Return case with all its matches
      } else if (matchedDonors.length > 0) {
        return { ...m, donorMatches: matchedDonors }; // Return case only with matched donors
      }
      return null;
    }).filter(Boolean);
  }

  const sortedMatches = [...filtered].sort((a, b) => {
    if (sortKey === 'bestScore') {
      return (b.donorMatches[0]?.score || 0) - (a.donorMatches[0]?.score || 0);
    }
    if (sortKey === 'caseNumber') {
      return String(a.caseDrive.case_number || '').localeCompare(String(b.caseDrive.case_number || ''), undefined, { numeric: true, sensitivity: 'base' });
    }
    if (sortKey === 'donorBrand') {
      return String(a.donorMatches[0]?.donorItem.company || a.donorMatches[0]?.donorItem.brand || '').localeCompare(
        String(b.donorMatches[0]?.donorItem.company || b.donorMatches[0]?.donorItem.brand || ''),
        undefined,
        { sensitivity: 'base' }
      );
    }
    return 0;
  });

  const totalDonorMatches = filtered.reduce((count, item) => count + item.donorMatches.length, 0);
  const { topMatches: resultTopMatches = [], summary = {} } = data;

  // Brand Stats helper
  const getBrandStat = (key) => {
    const s = stats[key] || { donors: 0, cases: 0 };
    return `${s.donors} (${s.cases})`;
  };

  return (
    <div className="donors-page">
      <header className="donors-header">
        <div className="donors-search-wrapper">
          <span className="donors-search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search drive details, case#, PCB#, SSD# or SN…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="donors-search"
          />
        </div>
        <button className="donors-back-btn" onClick={() => navigate('/inventory')}>
          📦 Back to Stock
        </button>
      </header>

      {/* Brand Stat Cards */}
      <section className="donors-stats-grid">
        {[
          { key: 'seagate', label: 'SEAGATE', color: 'var(--status-success)' },
          { key: 'wd', label: 'WD', color: 'var(--status-warning)' },
          { key: 'toshiba', label: 'TOSHIBA', color: 'var(--status-info)' },
          { key: 'hitachi', label: 'HITACHI', color: 'var(--status-danger)' },
          { key: 'samsung', label: 'SAMSUNG', color: 'var(--accent-primary)' }
        ].map(card => (
          <div
            key={card.key}
            onClick={() => setSelectedBrand(selectedBrand === card.key ? 'all' : card.key)}
            className={`donors-stat-card ${selectedBrand === card.key ? 'active' : ''}`}
            style={{ '--stat-accent': card.color }}
          >
            <span className="donors-stat-brand">{card.label}</span>
            <span className="donors-stat-value">
              {stats[card.key]?.donors || 0} <span className="donors-stat-cases">({stats[card.key]?.cases || 0})</span>
            </span>
          </div>
        ))}
      </section>

      {/* Horizontal pill button selectors to complement brand filtering */}
      <div className="donors-tabs">
        <button
          className={`donors-tab-btn ${selectedBrand === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedBrand('all')}
        >
          All Brands
        </button>
        <button
          className={`donors-tab-btn ${selectedBrand === 'seagate' ? 'active' : ''}`}
          onClick={() => setSelectedBrand('seagate')}
        >
          Seagate
        </button>
        <button
          className={`donors-tab-btn ${selectedBrand === 'wd' ? 'active' : ''}`}
          onClick={() => setSelectedBrand('wd')}
        >
          Western Digital
        </button>
        <button
          className={`donors-tab-btn ${selectedBrand === 'toshiba' ? 'active' : ''}`}
          onClick={() => setSelectedBrand('toshiba')}
        >
          Toshiba
        </button>
        <button
          className={`donors-tab-btn ${selectedBrand === 'hitachi' ? 'active' : ''}`}
          onClick={() => setSelectedBrand('hitachi')}
        >
          Hitachi
        </button>
        <button
          className={`donors-tab-btn ${selectedBrand === 'samsung' ? 'active' : ''}`}
          onClick={() => setSelectedBrand('samsung')}
        >
          Samsung
        </button>
      </div>

      {resultTopMatches.length > 0 && (
        <section className="donors-top-matches">
          <div className="donors-top-matches-header">
            <div>
              <div className="donors-top-heading">Top donor matches</div>
              <div className="donors-top-subtitle">
                Showing the best compatible donors across active cases. {summary.totalDonorMatches || totalDonorMatches} matches across {summary.casesWithMatches || filtered.length} cases.
              </div>
            </div>
            <div className="donors-sort-row">
              <label htmlFor="donor-sort">Sort:</label>
              <select id="donor-sort" value={sortKey} onChange={e => setSortKey(e.target.value)}>
                <option value="bestScore">Best matches first</option>
                <option value="caseNumber">Case number</option>
                <option value="donorBrand">Donor brand</option>
              </select>
            </div>
          </div>

          <div className="donors-top-cards">
            {resultTopMatches.slice(0, 3).map((match, idx) => (
              <div key={`${match.caseDrive.id}-${match.donorItem.id}-${idx}`} className="donors-top-card">
                <div className="donors-top-card-score">{match.score}%</div>
                <div>
                  <div className="donors-top-card-title">Case {match.caseDrive.case_number}</div>
                  <div className="donors-top-card-detail">{match.caseDrive.device_brand} {match.caseDrive.device_model}</div>
                </div>
                <div>
                  <div className="donors-top-card-title">Donor {match.donorItem.stock_number || match.donorItem.sku || match.donorItem.id}</div>
                  <div className="donors-top-card-detail">{match.donorItem.company || match.donorItem.brand} {match.donorItem.model || match.donorItem.name}</div>
                </div>
                <button className="donors-top-card-action" onClick={() => navigate(`/inventory/${String(match.donorItem.id).replace('legacy-', '')}?compare=${match.caseDrive.id}`)}>
                  Compare
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="donors-control-row">
        <div className="donors-summary-text">
          {sortedMatches.length} cases · {summary.totalDonorMatches || totalDonorMatches} donor match rows
        </div>
        <div className="donors-sort-select">
          <label htmlFor="donor-sort-inline">Sort</label>
          <select id="donor-sort-inline" value={sortKey} onChange={e => setSortKey(e.target.value)}>
            <option value="bestScore">Best matches first</option>
            <option value="caseNumber">Case number</option>
            <option value="donorBrand">Donor brand</option>
          </select>
        </div>
      </div>

      {/* Matching Results List */}
      <div className="donors-table-container">
        <div className="donors-table-scroll">
          <table className="donors-table">
            <thead>
              <tr>
                <th style={{ width: '25%' }}>Source Drive (Patient Case)</th>
                <th style={{ width: '12%', textAlign: 'center' }}>Match Score</th>
                <th style={{ width: '25%' }}>Donor Drive Details (Inventory Stock)</th>
                <th style={{ width: '30%' }}>Matching Criteria</th>
                <th style={{ width: '8%', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedMatches.map(m => {
                const c = m.caseDrive;
                const caseSsd = c.ssd_number || c.customFields?.ssd_number || null;

                return m.donorMatches.map((dm, idx) => {
                  const d = dm.donorItem;
                  const donorSsd = d.ssd_number || d.dynamic_fields?.ssd_number || null;

                  return (
                    <tr key={`${c.id}-${d.id}-${idx}`}>
                      {/* Source Case Drive Details */}
                      <td>
                        <div className="donors-drive-card">
                          <span className="donors-drive-title">
                            Case: {highlightText(c.case_number, search)}
                          </span>
                          <span className="donors-drive-subtitle">
                            {c.device_brand} {highlightText(c.device_model, search)}
                          </span>
                          <span className="donors-drive-detail">
                            <strong>S/N:</strong> {highlightText(c.serial_number, search)}
                          </span>
                          {c.pcb_number && (
                            <span className="donors-drive-detail">
                              <strong>PCB No:</strong> {highlightText(c.pcb_number, search)}
                            </span>
                          )}
                          {caseSsd && (
                            <span className="donors-drive-detail">
                              <strong>SSD No:</strong> {highlightText(caseSsd, search)}
                            </span>
                          )}
                          {c.pn_number && (
                            <span className="donors-drive-detail">
                              <strong>P/N:</strong> {c.pn_number}
                            </span>
                          )}
                          <span className="donors-drive-detail">
                            <strong>Capacity:</strong> {c.capacity_gb ? `${c.capacity_gb} GB` : '—'}
                          </span>
                          <span className="donors-drive-detail">
                            <strong>Client:</strong> {highlightText(`${c.first_name || ''} ${c.last_name || ''}`, search)}
                          </span>
                        </div>
                      </td>

                      {/* Compatibility Score */}
                      <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                        <div className="donors-score-cell">
                          <span className={`donors-score-badge ${
                            dm.score >= 80 ? 'donors-score-high' :
                            dm.score >= 50 ? 'donors-score-medium' :
                            'donors-score-low'
                          }`}>
                            {dm.score}%
                          </span>
                        </div>
                      </td>

                      {/* Target Donor Stock Details */}
                      <td>
                        <div className="donors-drive-card">
                          <span className="donors-drive-title" style={{ color: 'var(--accent-secondary)' }}>
                            Stock #: {highlightText(d.stock_number || d.sku, search)}
                          </span>
                          <span className="donors-drive-subtitle">
                            {d.company || d.brand} {highlightText(d.model || d.name, search)}
                          </span>
                          <span className="donors-drive-detail">
                            <strong>S/N:</strong> {highlightText(d.serial_number, search)}
                          </span>
                          {d.pcb_number && (
                            <span className="donors-drive-detail">
                              <strong>PCB No:</strong> {highlightText(d.pcb_number, search)}
                            </span>
                          )}
                          {donorSsd && (
                            <span className="donors-drive-detail">
                              <strong>SSD No:</strong> {highlightText(donorSsd, search)}
                            </span>
                          )}
                          {(d.pn_number || d.pn) && (
                            <span className="donors-drive-detail">
                              <strong>P/N:</strong> {d.pn_number || d.pn}
                            </span>
                          )}
                          <span className="donors-drive-detail">
                            <strong>Capacity:</strong> {d.capacity || '—'}
                          </span>
                          <span className="donors-drive-detail">
                            <strong>Location:</strong> {d.location || '—'} (Qty: {d.quantity})
                          </span>
                        </div>
                      </td>

                      {/* Matching Criteria checklist */}
                      <td>
                        <div className="donors-criteria-list">
                          {dm.matchedFields.map((field, fIdx) => (
                            <div className="donors-criteria-item" key={fIdx}>
                              <span className="donors-check-icon">✓</span>
                              <span>{field}</span>
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* Action trigger comparison */}
                      <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                        <button
                          className="donors-action-btn"
                          title="Open Case Comparison"
                          onClick={() => navigate(`/inventory/${String(d.id).replace('legacy-', '')}?compare=${c.id}`)}
                        >
                          <svg viewBox="0 0 24 24">
                            <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                });
              })}
              {sortedMatches.length === 0 && (
                <tr>
                  <td colSpan="5">
                    <div className="donors-empty-state">
                      <div className="donors-empty-icon">💿</div>
                      <div className="donors-empty-title">No donor drive matches found</div>
                      <div className="donors-empty-desc">
                        No available stock items match your search term or active cases compatibility.
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default DonorsPage;
