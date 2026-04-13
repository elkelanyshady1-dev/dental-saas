/**
 * ChartSettingsModal.tsx — Chart Settings Configuration Modal
 * ===========================================================
 * Provides a modal interface for configuring:
 *   - Default notation system (FDI, Palmer, Both)
 *   - Bracket brand management (add/remove custom brands)
 *   - Archwire brand management (add/remove custom brands)
 *   - Elastic brand management (add/remove custom brands)
 *
 * Brands are dynamically managed and propagated to all action bars
 * and context menus throughout the chart editor.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Settings,
  Plus,
  Grid,
  Hash
} from 'lucide-react';
import { ChartSettings } from '../types';

interface ChartSettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: ChartSettings;
  onSettingsChange: (settings: ChartSettings) => void;
}

const ChartSettingsModal: React.FC<ChartSettingsModalProps> = ({
  open,
  onClose,
  settings,
  onSettingsChange,
}) => {
  const [newBracketBrand, setNewBracketBrand] = useState('');
  const [newArchwireBrand, setNewArchwireBrand] = useState('');
  const [newElasticBrand, setNewElasticBrand] = useState('');

  const addBrand = (category: 'bracketBrands' | 'archwireBrands' | 'elasticBrands', value: string, reset: () => void) => {
    const trimmed = value.trim();
    if (!trimmed || settings[category].includes(trimmed)) return;
    onSettingsChange({
      ...settings,
      [category]: [...settings[category], trimmed],
    });
    reset();
  };

  const removeBrand = (category: 'bracketBrands' | 'archwireBrands' | 'elasticBrands', value: string) => {
    onSettingsChange({
      ...settings,
      [category]: settings[category].filter(b => b !== value),
    });
  };

  const setNotation = (v: 'fdi' | 'palmer' | 'both') => {
    onSettingsChange({ ...settings, notationSystem: v });
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden max-h-[85vh] flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-100 rounded-xl">
                  <Settings className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Chart Settings</h3>
                  <p className="text-xs text-slate-500 font-medium">Configure preferences and brands</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="p-6 space-y-8 overflow-y-auto flex-1">

              {/* ─── Notation System ─── */}
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-extrabold text-slate-700 uppercase tracking-widest">Notation System</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['fdi', 'palmer', 'both'] as const).map(v => (
                    <button
                      key={v}
                      onClick={() => setNotation(v)}
                      className={`py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide border transition-all ${
                        settings.notationSystem === v
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </section>

              {/* ─── Bracket Brands ─── */}
              <BrandSection
                icon={<Grid className="w-4 h-4 text-slate-500" />}
                title="Bracket Brands"
                brands={settings.bracketBrands}
                newValue={newBracketBrand}
                onNewValueChange={setNewBracketBrand}
                placeholder="Add bracket brand..."
                onAdd={() => addBrand('bracketBrands', newBracketBrand, () => setNewBracketBrand(''))}
                onRemove={(b) => removeBrand('bracketBrands', b)}
              />

              {/* ─── Archwire Brands ─── */}
              <BrandSection
                icon={<Grid className="w-4 h-4 text-slate-500" />}
                title="Archwire Brands"
                brands={settings.archwireBrands}
                newValue={newArchwireBrand}
                onNewValueChange={setNewArchwireBrand}
                placeholder="Add archwire brand..."
                onAdd={() => addBrand('archwireBrands', newArchwireBrand, () => setNewArchwireBrand(''))}
                onRemove={(b) => removeBrand('archwireBrands', b)}
              />

              {/* ─── Elastic Brands ─── */}
              <BrandSection
                icon={<Grid className="w-4 h-4 text-slate-500" />}
                title="Elastic Brands"
                brands={settings.elasticBrands}
                newValue={newElasticBrand}
                onNewValueChange={setNewElasticBrand}
                placeholder="Add elastic brand..."
                onAdd={() => addBrand('elasticBrands', newElasticBrand, () => setNewElasticBrand(''))}
                onRemove={(b) => removeBrand('elasticBrands', b)}
              />
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 shrink-0">
              <button
                onClick={onClose}
                className="w-full py-3 bg-slate-900 text-white rounded-2xl font-bold text-sm shadow-lg shadow-slate-300 hover:bg-slate-800 transition-all"
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

// ─── Brand Section Sub-component ───────────────────────────────────────────────
function BrandSection({ icon, title, brands, newValue, onNewValueChange, placeholder, onAdd, onRemove }: {
  icon: React.ReactNode;
  title: string;
  brands: string[];
  newValue: string;
  onNewValueChange: (v: string) => void;
  placeholder: string;
  onAdd: () => void;
  onRemove: (brand: string) => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-extrabold text-slate-700 uppercase tracking-widest">{title}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {brands.map(brand => (
          <span
            key={brand}
            className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 group hover:border-red-200 hover:bg-red-50/50 transition-all"
          >
            {brand}
            <button
              onClick={() => onRemove(brand)}
              className="p-0.5 rounded-full text-slate-300 hover:text-red-500 hover:bg-red-100 transition-all opacity-50 group-hover:opacity-100"
              title={`Remove ${brand}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newValue}
          onChange={(e) => onNewValueChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); }}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 transition-all"
        />
        <button
          onClick={onAdd}
          disabled={!newValue.trim()}
          className={`p-2 rounded-xl transition-all ${
            newValue.trim()
              ? 'bg-blue-600 text-white shadow-md shadow-blue-200 hover:bg-blue-700'
              : 'bg-slate-100 text-slate-300 cursor-not-allowed'
          }`}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}

export default ChartSettingsModal;
