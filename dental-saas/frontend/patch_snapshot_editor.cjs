const fs = require('fs');
const file = 'c:\\Clinic system project\\dental-saas\\frontend\\src\\org\\modules\\patients\\components\\orthodontic-chart\\components\\SnapshotEditor.tsx';
let data = fs.readFileSync(file, 'utf8');

// Normalize line endings to avoid replace mismatches due to \r\n vs \n
let d = data.replace(/\r\n/g, '\n');

// 1. imports
d = d.replace(
    "import { dispatchClinicalAction } from '../utils/actionDispatcher';",
    "import { dispatchClinicalAction } from '../utils/actionDispatcher';\nimport DuplicateActionModal from '@/components/ui/DuplicateActionModal';"
);

// 2. state
d = d.replace(
    "  } | null>(null);\n\n  // ── STATUS FILTER ENGINE",
    "  } | null>(null);\n\n  const [duplicateModal, setDuplicateModal] = useState<{\n    open: boolean;\n    actionLabel?: string;\n    contextParams?: { tooth?: string | number; arch?: string };\n    onConfirm: () => void;\n  }>({\n    open: false,\n    onConfirm: () => {},\n  });\n\n  const handleDuplicateBlocked = (actionLabel: string, contextParams: any, dispatchOptions: any) => {\n    console.warn(`[ActionDispatcher] Duplicate intercepted: showing modal for ${actionLabel}`);\n    setDuplicateModal({\n      open: true,\n      actionLabel,\n      contextParams,\n      onConfirm: () => {\n        dispatchClinicalAction({ ...dispatchOptions, skipDuplicateCheck: true });\n        setDuplicateModal(prev => ({ ...prev, open: false }));\n      }\n    });\n  };\n\n  // ── STATUS FILTER ENGINE"
);

// 3. setArchwire
const archwireTarget = `    const result = dispatchClinicalAction({
      action: {
        type: 'ARCHWIRE_SET',
        payload: {
          arch,
          material: selectedArchwireMaterial,
          size: selectedArchwireSize,
          from: fromId,
          to: toId,
          cinched: selectedCinchWire,
        },
        timestamp: Date.now(),
        source: 'ui',
      },
      getState: () => ({
        upperArchwire,
        lowerArchwire,
      }),
      onApply: () => {
        saveToHistory();
        if (arch === 'upper') {
          setUpperArchwire(config);
        } else {
          setLowerArchwire(config);
        }
      },
      logAction: (desc) => logAction(desc),
    });

    if (result.blocked) {
      console.warn('[ActionDispatcher] Duplicate archwire blocked');
      return;
    }`;
const archwireReplacement = `    const dispatchOpts = {
      action: {
        type: 'ARCHWIRE_SET' as const,
        payload: {
          arch,
          material: selectedArchwireMaterial,
          size: selectedArchwireSize,
          from: fromId,
          to: toId,
          cinched: selectedCinchWire,
        },
        timestamp: Date.now(),
        source: 'ui' as const,
      },
      getState: () => ({
        upperArchwire,
        lowerArchwire,
      }),
      onApply: () => {
        saveToHistory();
        if (arch === 'upper') {
          setUpperArchwire(config);
        } else {
          setLowerArchwire(config);
        }
      },
      logAction: (desc: string) => logAction(desc),
    };

    const result = dispatchClinicalAction(dispatchOpts);
    if (result.blocked) {
      handleDuplicateBlocked('Archwire Placement', { arch }, dispatchOpts);
      return;
    }`;
d = d.replace(archwireTarget, archwireReplacement);

// 4. addElastic
const elasticTarget = `    const result = dispatchClinicalAction({
      action: {
        type: 'ELASTIC_SET',
        payload: {
          teeth: [...selectedToothIds],
          type,
          size,
        },
        timestamp: Date.now(),
        source: 'ui',
      },
      getState: () => ({ elastics }),
      onApply: () => {
        saveToHistory();
        const newElastic: ElasticConnection = {
          id: Math.random().toString(36).substr(2, 9),
          toothIds: [...selectedToothIds],
          type,
          size
        };
        setElastics(prev => [...prev, newElastic]);
        logAction(\`Added \${type} elastic (\${size})\`);
        setSelectedToothIds([]);
      },
      logAction: (desc) => logAction(desc),
    });

    if (result.blocked) {
      console.warn('[ActionDispatcher] Duplicate elastic blocked');
    }`;
const elasticReplacement = `    const dispatchOpts = {
      action: {
        type: 'ELASTIC_SET' as const,
        payload: {
          teeth: [...selectedToothIds],
          type,
          size,
        },
        timestamp: Date.now(),
        source: 'ui' as const,
      },
      getState: () => ({ elastics }),
      onApply: () => {
        saveToHistory();
        const newElastic: ElasticConnection = {
          id: Math.random().toString(36).substr(2, 9),
          toothIds: [...selectedToothIds],
          type,
          size
        };
        setElastics(prev => [...prev, newElastic]);
        logAction(\`Added \${type} elastic (\${size})\`);
        setSelectedToothIds([]);
      },
      logAction: (desc: string) => logAction(desc),
    };

    const result = dispatchClinicalAction(dispatchOpts);
    if (result.blocked) {
      handleDuplicateBlocked(\`\${type} Elastic\`, { tooth: selectedToothIds.join(', ') }, dispatchOpts);
    }`;
d = d.replace(elasticTarget, elasticReplacement);

// 5. addPowerChain
const pcTarget = `    const result = dispatchClinicalAction({
      action: {
        type: 'POWERCHAIN_SET',
        payload: {
          teeth: allTeethForChain,
          type,
          color,
          miniscrewId: selectedMiniscrewId,
        },
        timestamp: Date.now(),
        source: 'ui',
      },
      getState: () => ({ powerChains }),
      onApply: () => {
        saveToHistory();
        const newPC: PowerChainConfig = {
          id: Math.random().toString(36).substr(2, 9),
          anchorTeeth: selectedMiniscrewId ? [rangeTeeth[rangeTeeth.length - 1]] : [rangeTeeth[0], rangeTeeth[rangeTeeth.length - 1]],
          activeTeeth: selectedMiniscrewId ? rangeTeeth.slice(0, -1) : rangeTeeth.slice(1, -1),
          type,
          color,
          direction: 'mesial',
          isUpper,
          miniscrewId: selectedMiniscrewId || undefined
        };
        setPowerChains(prev => [...prev, newPC]);
        logAction(\`Added \${type} power chain \${selectedMiniscrewId ? 'from miniscrew' : ''}\`);
        setSelectedToothIds([]);
        setSelectedMiniscrewId(null);
      },
      logAction: (desc) => logAction(desc),
    });

    if (result.blocked) {
      console.warn('[ActionDispatcher] Duplicate power chain blocked');
    }`;
const pcReplacement = `    const dispatchOpts = {
      action: {
        type: 'POWERCHAIN_SET' as const,
        payload: {
          teeth: allTeethForChain,
          type,
          color,
          miniscrewId: selectedMiniscrewId,
        },
        timestamp: Date.now(),
        source: 'ui' as const,
      },
      getState: () => ({ powerChains }),
      onApply: () => {
        saveToHistory();
        const newPC: PowerChainConfig = {
          id: Math.random().toString(36).substr(2, 9),
          anchorTeeth: selectedMiniscrewId ? [rangeTeeth[rangeTeeth.length - 1]] : [rangeTeeth[0], rangeTeeth[rangeTeeth.length - 1]],
          activeTeeth: selectedMiniscrewId ? rangeTeeth.slice(0, -1) : rangeTeeth.slice(1, -1),
          type,
          color,
          direction: 'mesial',
          isUpper,
          miniscrewId: selectedMiniscrewId || undefined
        };
        setPowerChains(prev => [...prev, newPC]);
        logAction(\`Added \${type} power chain \${selectedMiniscrewId ? 'from miniscrew' : ''}\`);
        setSelectedToothIds([]);
        setSelectedMiniscrewId(null);
      },
      logAction: (desc: string) => logAction(desc),
    };

    const result = dispatchClinicalAction(dispatchOpts);
    if (result.blocked) {
      handleDuplicateBlocked(\`\${type} Powerchain\`, { arch: isUpper ? 'upper' : 'lower' }, dispatchOpts);
    }`;
d = d.replace(pcTarget, pcReplacement);

// 6. Modal JSX
d = d.replace(
    "{errorModalMessage && <div className=\"hidden\">{errorModalMessage}</div>}\n    </div>\n  );\n};\n\nexport default SnapshotEditor;",
    "{errorModalMessage && <div className=\"hidden\">{errorModalMessage}</div>}\n\n      <DuplicateActionModal\n        open={duplicateModal.open}\n        actionLabel={duplicateModal.actionLabel}\n        contextParams={duplicateModal.contextParams}\n        onClose={() => setDuplicateModal(prev => ({ ...prev, open: false }))}\n        onConfirm={duplicateModal.onConfirm}\n      />\n    </div>\n  );\n};\n\nexport default SnapshotEditor;"
);

// If Windows line endings were originally used, we leave it as \n. Prettier/Git will fix it transparently.
fs.writeFileSync(file, d);
console.log("Done patching SnapshotEditor.tsx");
