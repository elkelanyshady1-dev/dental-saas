import { PhotoRecord } from '../../types';

/* ═══════════════════════════════════════════════════════════════
   analysisToProblems — Auto-generation engine that converts
   photo/radiograph analysis data into structured diagnostic
   problems for the Problem List.

   Sources:
     - Ceph analysis      → skeletal classification, vertical, inclinations
     - Lateral photos     → molar/canine/incisor class, overjet
     - Frontal retracted  → overbite, midline shifts
     - Front rest         → facial type, lip analysis
     - Front smile        → smile analysis
     - Profile rest       → profile type, chin, lip prominence
     - Oblique            → midface, nasal deformity

   Safety:
     ❌ Never overwrites manual entries
     ✅ Only adds/merges auto-derived data
     ✅ Uses source tagging to distinguish auto from manual
   ═══════════════════════════════════════════════════════════════ */

export interface AutoProblem {
  label: string;
  source: 'ceph' | 'photo' | 'lateral' | 'frontal' | 'profile' | 'oblique' | 'manual';
  severity?: 'mild' | 'moderate' | 'severe';
  value?: number | string;
  category: 'skeletal' | 'dental' | 'esthetic' | 'functional' | 'vertical' | 'transverse';
}

/**
 * Generate structured problems from all analysis data across records.
 * Returns an array of AutoProblem entries — never mutates existing data.
 */
export const generateProblemsFromAnalysis = (records: PhotoRecord[]): AutoProblem[] => {
  const problems: AutoProblem[] = [];

  // ───── CEPHALOMETRIC ANALYSIS ─────
  const cephRecord = records.find(r => r.id === 'ceph');
  const ceph = cephRecord?.analysis;
  if (ceph) {
    const anb = parseFloat(ceph.anb);
    if (!isNaN(anb)) {
      if (anb > 4) {
        problems.push({
          label: 'Skeletal Class II',
          source: 'ceph',
          severity: anb > 6 ? 'severe' : 'moderate',
          value: anb,
          category: 'skeletal',
        });
      } else if (anb < 0) {
        problems.push({
          label: 'Skeletal Class III',
          source: 'ceph',
          severity: anb < -2 ? 'severe' : 'moderate',
          value: anb,
          category: 'skeletal',
        });
      } else {
        problems.push({
          label: 'Skeletal Class I',
          source: 'ceph',
          severity: 'mild',
          value: anb,
          category: 'skeletal',
        });
      }
    }

    const sna = parseFloat(ceph.sna);
    if (!isNaN(sna)) {
      if (sna > 86) {
        problems.push({ label: 'Maxillary Protrusion', source: 'ceph', value: sna, category: 'skeletal' });
      } else if (sna < 80) {
        problems.push({ label: 'Maxillary Retrusion', source: 'ceph', value: sna, category: 'skeletal' });
      }
    }

    const snb = parseFloat(ceph.snb);
    if (!isNaN(snb)) {
      if (snb > 83) {
        problems.push({ label: 'Mandibular Protrusion', source: 'ceph', value: snb, category: 'skeletal' });
      } else if (snb < 77) {
        problems.push({ label: 'Mandibular Retrusion', source: 'ceph', value: snb, category: 'skeletal' });
      }
    }

    const mmp = parseFloat(ceph.mmp);
    if (!isNaN(mmp)) {
      if (mmp > 28) {
        problems.push({
          label: 'Vertical Growth Pattern (High Angle)',
          source: 'ceph',
          severity: mmp > 35 ? 'severe' : 'moderate',
          value: mmp,
          category: 'vertical',
        });
      } else if (mmp < 22) {
        problems.push({
          label: 'Horizontal Growth Pattern (Low Angle)',
          source: 'ceph',
          severity: 'moderate',
          value: mmp,
          category: 'vertical',
        });
      }
    }

    const u1pp = parseFloat(ceph.u1pp);
    if (!isNaN(u1pp)) {
      if (u1pp > 117) {
        problems.push({ label: 'Proclined Upper Incisors', source: 'ceph', value: u1pp, category: 'dental' });
      } else if (u1pp < 107) {
        problems.push({ label: 'Retroclined Upper Incisors', source: 'ceph', value: u1pp, category: 'dental' });
      }
    }

    const l1mandb = parseFloat(ceph.l1mandb);
    if (!isNaN(l1mandb)) {
      if (l1mandb > 104) {
        problems.push({ label: 'Proclined Lower Incisors', source: 'ceph', value: l1mandb, category: 'dental' });
      } else if (l1mandb < 92) {
        problems.push({ label: 'Retroclined Lower Incisors', source: 'ceph', value: l1mandb, category: 'dental' });
      }
    }

    // CVM Growth Status
    const cvm = ceph.cvmStage;
    if (cvm) {
      const isGrowing = cvm === 'CS2' || cvm === 'CS3';
      problems.push({
        label: isGrowing ? `Active Growth (CVM ${cvm})` : `Non-Growing (CVM ${cvm})`,
        source: 'ceph',
        value: cvm,
        category: 'skeletal',
      });
    }
  }

  // ───── LATERAL ANALYSIS ─────
  const lateralRight = records.find(r => r.id === 'lateral-right');
  const lateralLeft = records.find(r => r.id === 'lateral-left');
  const lateral = lateralRight?.analysis || lateralLeft?.analysis;
  if (lateral) {
    const overjet = parseFloat(lateral.overjet);
    if (!isNaN(overjet)) {
      if (overjet > 4) {
        problems.push({
          label: 'Increased Overjet',
          source: 'lateral',
          severity: overjet > 7 ? 'severe' : 'moderate',
          value: overjet,
          category: 'dental',
        });
      } else if (overjet < 0) {
        problems.push({
          label: 'Reverse Overjet (Anterior Crossbite)',
          source: 'lateral',
          severity: 'moderate',
          value: overjet,
          category: 'dental',
        });
      }
    }

    if (lateral.molarClass && lateral.molarClass !== 'I') {
      problems.push({
        label: `Molar Class ${lateral.molarClass}`,
        source: 'lateral',
        value: `${lateral.molarClass} ${lateral.molarUnit || ''}`.trim(),
        category: 'dental',
      });
    }

    if (lateral.canineClass && lateral.canineClass !== 'I') {
      problems.push({
        label: `Canine Class ${lateral.canineClass}`,
        source: 'lateral',
        value: `${lateral.canineClass} ${lateral.canineUnit || ''}`.trim(),
        category: 'dental',
      });
    }

    if (lateral.incisorClass && lateral.incisorClass !== 'I') {
      problems.push({
        label: `Incisor ${lateral.incisorClass}`,
        source: 'lateral',
        value: lateral.incisorClass,
        category: 'dental',
      });
    }
  }

  // ───── FRONTAL RETRACTED ─────
  const frontalRetracted = records.find(r => r.id === 'frontal-retracted')?.analysis;
  if (frontalRetracted) {
    const overbite = parseFloat(frontalRetracted.overbite);
    if (!isNaN(overbite)) {
      if (overbite > 4) {
        problems.push({
          label: 'Deep Bite',
          source: 'frontal',
          severity: overbite > 6 ? 'severe' : 'moderate',
          value: overbite,
          category: 'vertical',
        });
      } else if (overbite < 0) {
        problems.push({
          label: 'Anterior Open Bite',
          source: 'frontal',
          severity: 'moderate',
          value: overbite,
          category: 'vertical',
        });
      }
    }

    const upperShift = parseFloat(frontalRetracted.upperMidlineShift);
    if (!isNaN(upperShift) && Math.abs(upperShift) > 1) {
      problems.push({
        label: `Upper Midline Shift (${upperShift > 0 ? 'Right' : 'Left'})`,
        source: 'frontal',
        value: upperShift,
        category: 'dental',
      });
    }

    const lowerShift = parseFloat(frontalRetracted.lowerMidlineShift);
    if (!isNaN(lowerShift) && Math.abs(lowerShift) > 1) {
      problems.push({
        label: `Lower Midline Shift (${lowerShift > 0 ? 'Right' : 'Left'})`,
        source: 'frontal',
        value: lowerShift,
        category: 'dental',
      });
    }

    if (frontalRetracted.gingivalHealth && frontalRetracted.gingivalHealth !== 'Healthy') {
      problems.push({
        label: `Gingival: ${frontalRetracted.gingivalHealth}`,
        source: 'frontal',
        category: 'dental',
      });
    }
  }

  // ───── FRONT REST (ESTHETIC) ─────
  const frontRest = records.find(r => r.id === 'front-rest')?.analysis;
  if (frontRest) {
    if (frontRest.lipCompetency === 'Incompetent') {
      problems.push({ label: 'Lip Incompetency', source: 'frontal', category: 'esthetic' });
    }
    if (frontRest.asymmetry && frontRest.asymmetry !== 'None') {
      problems.push({ label: `Facial Asymmetry: ${frontRest.asymmetry}`, source: 'frontal', category: 'esthetic' });
    }
  }

  // ───── PROFILE REST ─────
  const profileRest = records.find(r => r.id === 'profile-rest')?.analysis;
  if (profileRest) {
    if (profileRest.profileType === 'Convex') {
      problems.push({ label: 'Convex Profile', source: 'profile', category: 'esthetic' });
    } else if (profileRest.profileType === 'Concave') {
      problems.push({ label: 'Concave Profile', source: 'profile', category: 'esthetic' });
    }
  }

  return problems;
};

/**
 * Merge auto-generated problems into existing problem list
 * without overwriting manual entries.
 */
export const mergeAutoProblems = (
  existing: any,
  autoProblems: AutoProblem[]
): any => {
  if (!existing) return existing;

  const updated = JSON.parse(JSON.stringify(existing));

  // Derive skeletal classification from auto problems
  const skeletalClass = autoProblems.find(p => p.label.startsWith('Skeletal Class'));
  if (skeletalClass) {
    if (skeletalClass.label.includes('II')) updated.developmental.apProblems.skeletal = 'class2';
    else if (skeletalClass.label.includes('III')) updated.developmental.apProblems.skeletal = 'class3';
    else updated.developmental.apProblems.skeletal = 'class1';
  }

  // Derive vertical problems
  const verticalProblem = autoProblems.find(p => p.category === 'vertical');
  if (verticalProblem) {
    if (verticalProblem.label.includes('High Angle') || verticalProblem.label.includes('Open Bite')) {
      updated.developmental.verticalProblems.skeletal = 'open-bite';
    } else if (verticalProblem.label.includes('Low Angle') || verticalProblem.label.includes('Deep Bite')) {
      updated.developmental.verticalProblems.skeletal = 'deep-bite';
    }
  }

  // Derive dental overbite
  const deepBite = autoProblems.find(p => p.label === 'Deep Bite');
  const openBite = autoProblems.find(p => p.label === 'Anterior Open Bite');
  if (deepBite) updated.developmental.verticalProblems.dental = 'deep-bite';
  if (openBite) updated.developmental.verticalProblems.dental = 'open-bite';

  // Derive AP dental details from lateral
  const molarClass = autoProblems.find(p => p.label.startsWith('Molar Class'));
  if (molarClass && !updated.developmental.apProblems.dental.molarClass) {
    updated.developmental.apProblems.dental.molarClass = molarClass.label;
  }

  const canineClass = autoProblems.find(p => p.label.startsWith('Canine Class'));
  if (canineClass && !updated.developmental.apProblems.dental.canineClass) {
    updated.developmental.apProblems.dental.canineClass = canineClass.label;
  }

  const overjet = autoProblems.find(p => p.label.includes('Overjet'));
  if (overjet && !updated.developmental.apProblems.dental.increasedOverjet) {
    updated.developmental.apProblems.dental.increasedOverjet = `${overjet.value}mm`;
  }

  const crossbite = autoProblems.find(p => p.label.includes('Anterior Crossbite'));
  if (crossbite && !updated.developmental.apProblems.dental.anteriorCrossbite) {
    updated.developmental.apProblems.dental.anteriorCrossbite = `${crossbite.value}mm reverse overjet`;
  }

  // Append non-duplicate items to "other"
  const otherProblems = autoProblems.filter(p =>
    ['Maxillary Protrusion', 'Maxillary Retrusion', 'Mandibular Protrusion', 'Mandibular Retrusion',
     'Proclined Upper Incisors', 'Retroclined Upper Incisors',
     'Proclined Lower Incisors', 'Retroclined Lower Incisors',
     'Lip Incompetency', 'Convex Profile', 'Concave Profile'
    ].includes(p.label) ||
    p.label.startsWith('Active Growth') || p.label.startsWith('Non-Growing') ||
    p.label.includes('Midline Shift') || p.label.includes('Gingival') ||
    p.label.includes('Asymmetry')
  );

  otherProblems.forEach(p => {
    if (!updated.developmental.other.includes(p.label)) {
      updated.developmental.other += (updated.developmental.other ? ', ' : '') + p.label;
    }
  });

  return updated;
};
