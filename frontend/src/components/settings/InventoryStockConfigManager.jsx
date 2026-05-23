import React, { useState } from 'react';
import { useInventoryConfig } from '../../hooks/useInventoryConfig';
import { saveBrands, saveCategories } from '../../constants/inventoryConfig';
import { fieldConfigApi } from '../../services/fieldConfigApi';

const BASE = '/api';
const getToken = () => localStorage.getItem('accessToken');

/** Settings → HDD Types: brands, categories (Add Stock form), and stock field definitions */
export default function InventoryStockConfigManager() {
  const { brands, setBrands, categories, setCategories, stockFields, refresh, loading } = useInventoryConfig();
  const [tab, setTab] = useState('brands');
  const [newBrand, setNewBrand] = useState('');
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatBrand, setNewCatBrand] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [error, setError] = useState('');

  const addBrand = async () => {
    if (!newBrand.trim()) return;
    setError('');
    try {
      const res = await fetch(`${BASE}/inventory-config/brands`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBrand.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setNewBrand('');
      await refresh();
    } catch (e) {
      const local = [...brands, {
        id: `local_${Date.now()}`,
        name: newBrand.trim(),
        config_key: newBrand.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        active: true,
        is_system: false,
      }];
      setBrands(local);
      saveBrands(local);
      setNewBrand('');
      setError(e.message + ' (saved locally)');
    }
  };

  const deleteBrand = async (b) => {
    if (!window.confirm(`Remove brand "${b.name}"?`)) return;
    try {
      if (b.id && !String(b.id).startsWith('local_')) {
        await fetch(`${BASE}/inventory-config/brands/${b.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${getToken()}` },
        });
      }
      const next = brands.filter(x => x.id !== b.id);
      setBrands(next);
      saveBrands(next);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const toggleBrand = async (b) => {
    const next = brands.map(x => x.id === b.id ? { ...x, active: !x.active } : x);
    setBrands(next);
    saveBrands(next);
    if (b.id && !String(b.id).startsWith('local_')) {
      try {
        await fetch(`${BASE}/inventory-config/brands/${b.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: !b.active }),
        });
      } catch { /* local ok */ }
    }
  };

  const addCategory = async () => {
    if (!newCatLabel.trim()) return;
    try {
      const res = await fetch(`${BASE}/inventory-config/categories`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newCatLabel.trim(), brand: newCatBrand, isHdd: true }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setNewCatLabel('');
      setNewCatBrand('');
      await refresh();
    } catch (e) {
      const key = newCatLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const next = [...categories, {
        id: `local_${Date.now()}`, key, label: newCatLabel.trim(),
        brand: newCatBrand, icon: '💿', color: '#8b5cf6', isHdd: true, active: true,
      }];
      setCategories(next);
      saveCategories(next);
      setNewCatLabel('');
      setError(e.message + ' (saved locally)');
    }
  };

  const deleteCategory = async (c) => {
    if (!window.confirm(`Remove category "${c.label}"?`)) return;
    try {
      if (c.id && !String(c.id).startsWith('local_')) {
        await fetch(`${BASE}/inventory-config/categories/${c.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${getToken()}` },
        });
      }
      const next = categories.filter(x => x.id !== c.id && x.key !== c.key);
      setCategories(next);
      saveCategories(next);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const addStockField = async () => {
    if (!newFieldLabel.trim()) return;
    try {
      await fieldConfigApi.addHddField(newFieldLabel.trim(), 'text');
      setNewFieldLabel('');
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const deleteStockField = async (fieldKey) => {
    if (!window.confirm('Delete this field? It will be removed from Field Config mappings.')) return;
    try {
      await fieldConfigApi.deleteHddField(fieldKey);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const TABS = [
    ['brands', '🏷️ Brands (Company list)'],
    ['categories', '📂 Categories (Add Stock)'],
    ['fields', '📋 Stock Form Fields'],
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="alert alert-info" style={{ marginBottom: 0 }}>
        <span className="alert-icon">💡</span>
        <strong>Categories</strong> match Add Stock → Category (WD, PCB, SSD, Phone).
        <strong>Brands</strong> match Company dropdown on HDD items.
        <strong>Stock Form Fields</strong> are mapped per category in Field Config.
      </div>
      {error && <div className="alert alert-warning">⚠ {error}</div>}
      {loading && <div className="text-muted text-sm">Loading…</div>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TABS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={tab === k ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'brands' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {brands.map(b => (
            <div key={b.id || b.config_key} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}>
                <input type="checkbox" checked={b.active !== false} onChange={() => toggleBrand(b)} />
                <span style={{ fontWeight: 700 }}>{b.name}</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{b.config_key}</span>
              </label>
              {!b.is_system && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteBrand(b)}>🗑 Delete</button>
              )}
            </div>
          ))}
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>➕ Add Brand</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" style={{ flex: 1 }} placeholder="e.g. Toshiba, Samsung"
                value={newBrand} onChange={e => setNewBrand(e.target.value)} onKeyDown={e => e.key === 'Enter' && addBrand()} />
              <button type="button" className="btn btn-primary" onClick={addBrand}>+ Add</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {categories.map(c => (
            <div key={c.id || c.key} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '1.2rem' }}>{c.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{c.label}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  key: {c.key} {c.brand ? `· ${c.brand}` : ''} {c.isHdd === false ? '· non-HDD' : ''}
                </div>
              </div>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteCategory(c)}>🗑</button>
            </div>
          ))}
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>➕ Add Category</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8 }}>
              <input className="form-input" placeholder='Label e.g. Toshiba 2.5"' value={newCatLabel} onChange={e => setNewCatLabel(e.target.value)} />
              <select className="form-select" value={newCatBrand} onChange={e => setNewCatBrand(e.target.value)}>
                <option value="">Default brand…</option>
                {brands.filter(b => b.active !== false).map(b => (
                  <option key={b.config_key} value={b.name}>{b.name}</option>
                ))}
              </select>
              <button type="button" className="btn btn-primary" onClick={addCategory}>+ Add</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'fields' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
            These fields can be mapped per brand under <strong>Field Config</strong> and shown on the Add Stock Item form for HDD categories.
          </p>
          {stockFields.map(f => (
            <div key={f.field_key} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{f.field_label}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{f.field_key}</div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deleteStockField(f.field_key)}>🗑</button>
            </div>
          ))}
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>➕ Add Field</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" style={{ flex: 1 }} placeholder="e.g. RMA Number, Warranty"
                value={newFieldLabel} onChange={e => setNewFieldLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && addStockField()} />
              <button type="button" className="btn btn-primary" onClick={addStockField}>+ Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
