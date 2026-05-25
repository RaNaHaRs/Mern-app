# 🎨 SuperAdmin Design System — Quick Reference

## 📌 Color Palette

```
Primary:    #7c3aed    Purple
Secondary:  #0ea5e9    Cyan
Success:    #10b981    Green
Warning:    #f59e0b    Amber
Danger:     #ef4444    Red
Info:       #0ea5e9    Blue
```

## 🎯 Most Used Classes

### Badges
```jsx
// Color-coded badges
<span className="saas-badge saas-badge-primary">Primary</span>
<span className="saas-badge saas-badge-success">Success</span>
<span className="saas-badge saas-badge-warning">Warning</span>
<span className="saas-badge saas-badge-danger">Danger</span>
<span className="saas-badge saas-badge-info">Info</span>

// Status indicators
<span className="status-indicator status-active">Active</span>
<span className="status-indicator status-trial">Trial</span>
<span className="status-indicator status-expired">Expired</span>
<span className="status-indicator status-suspended">Suspended</span>
```

### Buttons
```jsx
<button className="saas-btn saas-btn-primary">Primary Button</button>
<button className="saas-btn saas-btn-success">Success Button</button>
<button className="saas-btn saas-btn-secondary">Secondary Button</button>
<button className="saas-btn saas-btn-warning">Warning Button</button>
<button className="saas-btn saas-btn-danger">Danger Button</button>
```

### Cards
```jsx
<div className="saas-card">Light Mode Card</div>
<div className="saas-card saas-card-dark">Dark Mode Card</div>
<div className="saas-plan-card">Plan Card</div>
<div className="sa-stat-card">Stat Card</div>
```

### Grids
```jsx
// Responsive grids that auto-adapt to screen size
<div className="saas-grid-2">2 columns</div>
<div className="saas-grid-3">3 columns</div>
<div className="saas-grid-4">4 columns</div>
```

### Tables
```jsx
<table className="saas-table">
  <thead className="saas-table-header">
    <tr><th>Column</th></tr>
  </thead>
  <tbody>
    <tr className="saas-table-row">
      <td>Data</td>
    </tr>
  </tbody>
</table>
```

### Modals
```jsx
<div className="saas-modal">
  <div className="saas-modal-header">Header</div>
  <div className="saas-modal-body">Content</div>
  <div className="saas-modal-footer">Actions</div>
</div>
```

### Forms
```jsx
<div className="form-group">
  <label className="form-label">Label</label>
  <input className="form-input" type="text" />
</div>

<textarea className="form-textarea"></textarea>
<select className="form-select">
  <option>Option</option>
</select>
```

### Typography
```jsx
<h1 className="sa-section-title">Main Title</h1>
<h2 className="sa-subsection-title">Subtitle</h2>
<p className="sa-body-text">Body text</p>
```

## 🚀 Component Patterns

### Stat Card (Most Common)
```jsx
function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="sa-stat-card" style={{ '--sa-stat-color': color }}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-content">
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
}
```

### Plan Card
```jsx
<div className="saas-plan-card" style={{ borderTopColor: planColor }}>
  <div className="plan-header">
    <h3 className="plan-name">{plan.label}</h3>
    <div className="saas-badge saas-badge-primary">{plan.type}</div>
  </div>
  <div className="plan-price">
    ₹{plan.price.toLocaleString('en-IN')}/month
  </div>
  <div className="plan-features">
    {plan.features.map(f => (
      <div key={f} className="feature-item">✓ {f}</div>
    ))}
  </div>
  <button className="saas-btn saas-btn-primary">Select Plan</button>
</div>
```

### List with Status
```jsx
<div className="activity-feed">
  {items.map(item => (
    <div key={item.id} className="activity-item" style={{ borderLeftColor: item.color }}>
      <div className="activity-dot"></div>
      <div className="activity-content">
        <div className="activity-title">{item.title}</div>
        <div className="activity-time">{formatTime(item.time)}</div>
      </div>
      <span className={`status-indicator status-${item.status}`}>
        {item.status}
      </span>
    </div>
  ))}
</div>
```

## 📐 Spacing System

All components use 8px base unit:
- `8px` = 1 unit (x-small)
- `12px` = 1.5 units (small)
- `16px` = 2 units (medium)
- `20px` = 2.5 units (large)
- `24px` = 3 units (x-large)
- `28px` = 3.5 units (2x-large)

## 🎬 Animations

All components include smooth animations:
- **Hover**: Lift effect with shadow
- **Active**: Color transition
- **Load**: Slide-in effect
- **Transition**: All changes are smooth (0.3s)

## 📱 Responsive Breakpoints

```
Mobile:   < 480px   → Single column, stacked layout
Tablet:   480-768px → 2 column layout
Desktop:  > 768px   → 3-4 column layout
```

## ✨ CSS Variables (Use in Components)

```css
/* Colors */
--color-primary: #7c3aed;
--color-secondary: #0ea5e9;
--color-success: #10b981;
--color-warning: #f59e0b;
--color-danger: #ef4444;
--color-info: #0ea5e9;

/* Gradients */
--gradient-primary: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
--gradient-success: linear-gradient(135deg, #10b981 0%, #059669 100%);
--gradient-premium: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 50%, #0ea5e9 100%);
--gradient-cool: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0ea5e9 100%);

/* Shadows */
--shadow-sm: 0 4px 12px rgba(0,0,0,0.05);
--shadow-md: 0 8px 24px rgba(0,0,0,0.08);
--shadow-lg: 0 20px 60px rgba(0,0,0,0.3);

/* Borders */
--border-color: rgba(0,0,0,0.1);
--border-light: rgba(255,255,255,0.1);
```

## 🎯 Quick Tips

### 1. Use Semantic Colors
```jsx
// ✅ Good
<button className="saas-btn saas-btn-danger">Delete</button>
<span className="status-indicator status-active">Active</span>

// ❌ Avoid
<button style={{ background: 'red' }}>Delete</button>
```

### 2. Combine Grid with Cards
```jsx
// ✅ Good pattern for lists
<div className="saas-grid-3">
  {items.map(item => (
    <div key={item.id} className="saas-card">
      {/* content */}
    </div>
  ))}
</div>
```

### 3. Use Icons + Labels
```jsx
// ✅ Better UX with icons
<button className="saas-btn saas-btn-primary">
  📊 Generate Report
</button>
```

### 4. Color as Prop (like StatCard)
```jsx
// ✅ Flexible color system
<StatCard color="#7c3aed" value="123" label="Active Users" />

// Component uses CSS variable
style={{ '--sa-stat-color': color }}
```

## 🔧 Customization

### Add New Color Badge
```css
.saas-badge-custom {
  background: rgba(your-color, 0.1);
  color: your-color;
  border: 1px solid rgba(your-color, 0.3);
}
```

### Add New Button Variant
```css
.saas-btn-custom {
  background: var(--gradient-custom);
  color: white;
}

.saas-btn-custom:hover {
  opacity: 0.9;
  transform: translateY(-2px);
}
```

## 📚 File Structure

```
frontend/src/pages/
├── SuperAdminPage.jsx              (Main component)
├── SuperAdminPage.css              (Original styles)
└── SuperAdminPageTailwind.css      (New SAAS design)
```

## 🐛 Debugging Tips

1. **Check CSS Import**: Ensure both CSS files are imported
2. **Verify Class Names**: Use exact class names from list above
3. **Check Color Props**: Pass color as hex (e.g., `#7c3aed`)
4. **Mobile View**: Test responsive design with DevTools
5. **Animation Check**: Smooth transitions should work on all components

## ✅ Best Practices

1. ✨ Use semantic class names
2. 🎨 Stick to color palette
3. 📏 Use 8px spacing grid
4. 🎬 Keep animations smooth
5. ♿ Maintain good contrast ratios
6. 📱 Test responsive design
7. 🔄 Reuse components
8. 📚 Document custom styles

## 🎓 Example Full Component

```jsx
function MyFeatureCard({ title, count, status, color }) {
  return (
    <div className="saas-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 className="sa-subsection-title">{title}</h3>
          <div style={{ fontSize: '2rem', fontWeight: 900, color }}>
            {count.toLocaleString()}
          </div>
        </div>
        <span className={`status-indicator status-${status}`}>
          {status}
        </span>
      </div>
      <button className="saas-btn saas-btn-primary" style={{ marginTop: '16px' }}>
        View Details
      </button>
    </div>
  );
}

// Usage
<div className="saas-grid-3">
  <MyFeatureCard title="Active Users" count={245} status="active" color="#10b981" />
  <MyFeatureCard title="Pending" count={12} status="trial" color="#0ea5e9" />
  <MyFeatureCard title="Issues" count={3} status="expired" color="#ef4444" />
</div>
```

---

**Last Updated**: 2024 | **Version**: 1.0 | **Status**: ✅ Complete
