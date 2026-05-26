import React, { useState, useEffect } from 'react';
import { donorsApi } from '../services/api';
import './DonorsPage.css';

function DonorsPage() {
  const [donors, setDonors] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchDonors() {
      try {
        const data = await donorsApi.donors();
        setDonors(data);
        setFiltered(data);
        setLoading(false);
      } catch (e) {
        setError(e.message || 'Failed to load donors');
        setLoading(false);
      }
    }
    fetchDonors();
  }, []);

  useEffect(() => {
    const lowered = search.toLowerCase();
    const filteredList = donors.filter(d =>
      (d.stock_number && d.stock_number.toLowerCase().includes(lowered)) ||
      (d.company && d.company.toLowerCase().includes(lowered)) ||
      (d.brand && d.brand.toLowerCase().includes(lowered)) ||
      (d.model && d.model.toLowerCase().includes(lowered))
    );
    setFiltered(filteredList);
  }, [search, donors]);

  const handleSelect = donor => {
    // Placeholder: In a real workflow this would open a modal or navigate to a case assignment screen.
    alert(`Selected donor \nID: ${donor.id}\nStock #: ${donor.stock_number || donor.sku}`);
  };

  if (loading) return <div className="donors-loading">Loading donor drives…</div>;
  if (error) return <div className="donors-error">Error: {error}</div>;

  return (
    <div className="donors-page">
      <header className="donors-header">
        <h2 className="donors-title">📦 Donor Drives</h2>
        <input
          type="text"
          placeholder="Search donors…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="donors-search"
        />
      </header>
      <section className="donors-grid">
        {filtered.map(donor => (
          <div key={donor.id} className="donor-card">
            <h3 className="donor-model">{donor.model || donor.stock_number || 'Unnamed'}</h3>
            <p className="donor-info"><strong>Company:</strong> {donor.company || '—'}</p>
            <p className="donor-info"><strong>Brand:</strong> {donor.brand || '—'}</p>
            <p className="donor-info"><strong>Capacity:</strong> {donor.capacity || '—'}</p>
            <p className="donor-info"><strong>Status:</strong> {donor.status || 'available'}</p>
            <p className="donor-info"><strong>Qty:</strong> {donor.stock_qty ?? donor.quantity ?? 0}</p>
            <button className="donor-select-btn" onClick={() => handleSelect(donor)}>
              ⚡ Select for Case
            </button>
          </div>
        ))}
        {filtered.length === 0 && <p className="donors-empty">No donors match your search.</p>}
      </section>
    </div>
  );
}

export default DonorsPage;
