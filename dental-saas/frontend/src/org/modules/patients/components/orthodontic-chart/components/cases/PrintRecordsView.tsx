import React, { forwardRef } from 'react';
import { PhotoRecord } from '../../types';
import { resolveFileUrl } from '@/utils/resolveFileUrl';

/* ═══════════════════════════════════════════════════════════════
   PrintRecordsView — Clean, printable layout for orthodontic records.
   
   Renders a white background, no dark UI, no buttons.
   Designed for window.print() and html2canvas PDF export.
   ═══════════════════════════════════════════════════════════════ */

interface PrintRecordsViewProps {
  records: PhotoRecord[];
  patientName: string;
  chiefComplaint: string;
  date: string;
  doctorName?: string;
}

const PrintRecordsView = forwardRef<HTMLDivElement, PrintRecordsViewProps>(({
  records,
  patientName,
  chiefComplaint,
  date,
  doctorName = 'Shady Elkelany',
}, ref) => {

  const extraoral = records.filter(r => ['profile-rest', 'front-rest', 'front-smile', 'oblique'].includes(r.id));
  const occlusal = records.filter(r => ['occlusal-upper', 'occlusal-lower'].includes(r.id));
  const intraoral = records.filter(r => ['lateral-right', 'frontal-retracted', 'lateral-left'].includes(r.id));
  const xrays = records.filter(r => ['ceph', 'opg'].includes(r.id));

  return (
    <div ref={ref} id="print-area" className="bg-white text-black p-8" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', fontFamily: 'Georgia, serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, paddingBottom: 16, borderBottom: '2px solid #1e293b' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>{patientName || 'Patient Records'}</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0', fontStyle: 'italic' }}>{chiefComplaint || 'No chief complaint recorded'}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Orthodontic Record</p>
          <p style={{ fontSize: 14, color: '#475569', margin: '4px 0 0' }}>{date}</p>
        </div>
      </div>

      {/* Extraoral Row */}
      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 6 }}>Extraoral</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
          {extraoral.map(r => (
            <div key={r.id} style={{ background: '#f8fafc', borderRadius: 4, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              {r.url ? (
                                <img src={resolveFileUrl(r.url)} alt={r.label} style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain', transform: `rotate(${r.rotation || 0}deg) scaleX(${r.flipH ? -1 : 1}) scaleY(${r.flipV ? -1 : 1})` }} />
              ) : (
                <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 10 }}>{r.label}</div>
              )}
              <p style={{ fontSize: 8, textAlign: 'center', padding: '3px 0', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Middle Row: Occlusal + Info + X-rays */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginBottom: 12 }}>
        {/* Occlusal */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {occlusal.map(r => (
            <div key={r.id} style={{ background: '#f8fafc', borderRadius: 4, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              {r.url ? (
                                <img src={resolveFileUrl(r.url)} alt={r.label} style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain', transform: `rotate(${r.rotation || 0}deg) scaleX(${r.flipH ? -1 : 1}) scaleY(${r.flipV ? -1 : 1})` }} />
              ) : (
                <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 10 }}>{r.label}</div>
              )}
              <p style={{ fontSize: 8, textAlign: 'center', padding: '2px 0', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{r.label}</p>
            </div>
          ))}
        </div>

        {/* X-rays */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: 'span 2' }}>
          {xrays.map(r => (
            <div key={r.id} style={{ background: '#0f172a', borderRadius: 4, overflow: 'hidden', border: '1px solid #334155', flex: 1 }}>
              {r.url ? (
                                <img src={resolveFileUrl(r.url)} alt={r.label} style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain', transform: `rotate(${r.rotation || 0}deg) scaleX(${r.flipH ? -1 : 1}) scaleY(${r.flipV ? -1 : 1})` }} />
              ) : (
                <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 10 }}>{r.label}</div>
              )}
              <p style={{ fontSize: 8, textAlign: 'center', padding: '2px 0', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>{r.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Intraoral Row */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: 6 }}>Intraoral</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
          {intraoral.map(r => (
            <div key={r.id} style={{ background: '#f8fafc', borderRadius: 4, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
              {r.url ? (
                                <img src={resolveFileUrl(r.url)} alt={r.label} style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain', transform: `rotate(${r.rotation || 0}deg) scaleX(${r.flipH ? -1 : 1}) scaleY(${r.flipV ? -1 : 1})` }} />
              ) : (
                <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', fontSize: 10 }}>{r.label}</div>
              )}
              <p style={{ fontSize: 8, textAlign: 'center', padding: '2px 0', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>{r.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>Generated on {new Date().toLocaleDateString()}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 18, fontStyle: 'italic', color: '#1e293b', margin: 0, fontFamily: 'Georgia, serif' }}>{doctorName}</p>
          <p style={{ fontSize: 8, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.15em', margin: '2px 0 0', fontWeight: 700 }}>Orthodontic Specialist</p>
        </div>
      </div>
    </div>
  );
});

PrintRecordsView.displayName = 'PrintRecordsView';

export default PrintRecordsView;
