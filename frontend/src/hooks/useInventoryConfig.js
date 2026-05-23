import { useState, useEffect, useCallback } from 'react';
import {
  loadBrands, saveBrands, loadCategories, saveCategories,
  DEFAULT_INVENTORY_BRANDS, DEFAULT_INV_CATEGORIES,
} from '../constants/inventoryConfig';

const BASE = '/api';
const getToken = () => localStorage.getItem('accessToken');

export function useInventoryConfig() {
  const [brands, setBrands] = useState(loadBrands);
  const [categories, setCategories] = useState(loadCategories);
  const [stockFields, setStockFields] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/inventory-config`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.brands?.length) {
          setBrands(data.brands);
          saveBrands(data.brands);
        }
        if (data.categories?.length) {
          setCategories(data.categories);
          saveCategories(data.categories);
        }
        if (data.stockFields) setStockFields(data.stockFields);
      }
    } catch {
      /* use localStorage cache */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const activeBrandNames = brands.filter(b => b.active !== false).map(b => b.name);

  const activeCategories = categories.filter(c => c.active !== false);

  const hddCategories = activeCategories.filter(c => c.isHdd !== false);

  return {
    brands,
    setBrands,
    categories,
    setCategories,
    stockFields,
    loading,
    refresh,
    activeBrandNames: activeBrandNames.length ? activeBrandNames : DEFAULT_INVENTORY_BRANDS,
    activeCategories: activeCategories.length ? activeCategories : DEFAULT_INV_CATEGORIES,
    hddCategories: hddCategories.length ? hddCategories : DEFAULT_INV_CATEGORIES.filter(c => c.isHdd !== false),
  };
}
