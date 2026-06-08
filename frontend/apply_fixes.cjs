const fs = require('fs');
let content = fs.readFileSync('src/pages/SuperAdminPage.jsx', 'utf8');

// Fix 1: activeTab logic
const badActiveTab = `  const [activeTab, setActiveTab] = useState(() => sessionStorage.getItem('sa_active_tab') || 'dashboard');

  // Sync with sessionStorage when sidebar sets the tab
  useEffect(() => {
    const onStorage = () => setActiveTab(sessionStorage.getItem('sa_active_tab') || 'dashboard');
    window.addEventListener('storage', onStorage);
    // Poll sessionStorage since same-tab writes don't trigger storage event
    const poll = setInterval(() => {
      const tab = sessionStorage.getItem('sa_active_tab') || 'dashboard';
      setActiveTab(prev => prev !== tab ? tab : prev);
    }, 120);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(poll); };
  }, []);`;

const goodActiveTab = `  const getSafeTab = () => {
    const t = sessionStorage.getItem('sa_active_tab');
    if (!t || t === 'null' || t === 'undefined' || t === '') return 'dashboard';
    const valid = ['dashboard','tenants','plans','razorpay','coupons','purchases','branding','seo','homepage','invoices','accounts','logs','platform','email_delivery'];
    return valid.includes(t) ? t : 'dashboard';
  };
  const [activeTab, setActiveTab] = useState(getSafeTab);

  // Sync with sessionStorage when sidebar sets the tab
  useEffect(() => {
    const onStorage = () => setActiveTab(getSafeTab());
    window.addEventListener('storage', onStorage);
    // Poll sessionStorage since same-tab writes don't trigger storage event
    const poll = setInterval(() => {
      const tab = getSafeTab();
      setActiveTab(prev => prev !== tab ? tab : prev);
    }, 120);
    return () => { window.removeEventListener('storage', onStorage); clearInterval(poll); };
  }, []);`;

content = content.replace(badActiveTab, goodActiveTab);

// Fix 2: CouponManager saved state
const badCouponManager = `  const [couponUsage, setCouponUsage] = useState([]);
  const [loadingUsage, setLoadingUsage] = useState(false);`;

const goodCouponManager = `  const [couponUsage, setCouponUsage] = useState([]);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [saved, setSaved] = useState(false);`;

content = content.replace(badCouponManager, goodCouponManager);

fs.writeFileSync('src/pages/SuperAdminPage.jsx', content, 'utf8');
console.log('Fixes applied successfully!');
