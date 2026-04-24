# Technical Design Specification (TDS)

## AI Cephalometric Analysis Module (Landmarks + Planes + Interactive Correction)

---

## 1. Overview

### 1.1 Objective

Design and implement an AI-powered cephalometric analysis module that:

- Automatically detects cephalometric landmarks from lateral X-ray images
- Generates planes and orthodontic measurements
- Displays results in an interactive frontend viewer
- Allows manual correction of landmarks
- Recalculates measurements in real-time

---

## 2. System Architecture

### 2.1 High-Level Flow

```
[Frontend Upload]
        ↓
[Ceph API Endpoint]
        ↓
[AI Inference Service]
        ↓
[Landmarks JSON]
        ↓
[Measurement Engine]
        ↓
[Frontend Viewer + Editor]
```

---

### 2.2 Components

|Layer|Component|
|---|---|
|Frontend|Ceph Viewer + Landmark Editor|
|Backend|Ceph Controller (Node.js)|
|AI Service|Landmark Detection Model (Python)|
|Core Engine|Measurement + Plane Generator|
|Storage|MongoDB (CephAnalysis Model)|

---

## 3. Data Model

### 3.1 CephAnalysis Schema

```javascript
// models/CephAnalysis.model.js

const mongoose = require("mongoose");

const CephAnalysisSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },

  imageUrl: {
    type: String
  },

  landmarks: [
    {
      name: String,
      x: Number,
      y: Number,
      confidence: Number,
      isManual: { type: Boolean, default: false }
    }
  ],

  planes: [
    {
      name: String,
      points: [String]
    }
  ],

  measurements: [
    {
      name: String,
      value: Number,
      unit: String,
      normalRange: String
    }
  ],

  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("CephAnalysis", CephAnalysisSchema);
```

---

## 4. AI Landmark Detection

### 4.1 Input

- Lateral cephalometric X-ray image

### 4.2 Output

```json
{
  "landmarks": [
    { "name": "S", "x": 420, "y": 180, "confidence": 0.98 },
    { "name": "N", "x": 460, "y": 150, "confidence": 0.97 },
    { "name": "A", "x": 510, "y": 220, "confidence": 0.95 }
  ]
}
```

### 4.3 Model Options

- YOLOv8 Keypoint (recommended for speed)
- HRNet (recommended for accuracy)
- Custom CNN (lightweight deployment)

---

## 5. Measurement Engine

### 5.1 Angle Calculation

```javascript
function calculateAngle(A, B, C) {
  const AB = [A.x - B.x, A.y - B.y];
  const CB = [C.x - B.x, C.y - B.y];

  const dot = AB[0] * CB[0] + AB[1] * CB[1];
  const magAB = Math.hypot(...AB);
  const magCB = Math.hypot(...CB);

  return Math.acos(dot / (magAB * magCB)) * (180 / Math.PI);
}
```

---

### 5.2 Measurement Configuration

```javascript
const measurementConfig = {
  SNA: {
    type: "angle",
    points: ["S", "N", "A"],
    normal: "83° ± 3"
  },
  SNB: {
    type: "angle",
    points: ["S", "N", "B"]
  },
  ANB: {
    type: "difference",
    formula: (vals) => vals.SNA - vals.SNB
  }
};
```

---

## 6. Frontend — Ceph Viewer

### 6.1 Features

- Canvas-based X-ray rendering
- Landmark visualization
- Drag-and-drop editing
- Plane drawing
- Measurement panel

---

### 6.2 Landmark Rendering

```javascript
const drawLandmark = (ctx, point) => {
  ctx.beginPath();
  ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
  ctx.fillStyle = point.isManual ? "orange" : "cyan";
  ctx.fill();
};
```

---

### 6.3 Drag Handling

```javascript
const handleDrag = (id, newX, newY) => {
  setLandmarks(prev =>
    prev.map(l =>
      l.name === id
        ? { ...l, x: newX, y: newY, isManual: true }
        : l
    )
  );

  recalculateMeasurements();
};
```

---

## 7. Planes Rendering

### 7.1 Draw Plane

```javascript
const drawPlane = (ctx, p1, p2) => {
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.strokeStyle = "#00FFAA";
  ctx.stroke();
};
```

---

### 7.2 Plane Definitions

```javascript
const planes = [
  { name: "SN", points: ["S", "N"] },
  { name: "FH", points: ["Po", "Or"] },
  { name: "Mandibular", points: ["Go", "Me"] }
];
```

---

## 8. Real-Time Recalculation

### 8.1 Flow

```
User drags landmark
        ↓
Update state
        ↓
Recalculate measurements
        ↓
Update UI
```

---

### 8.2 React Hook

```javascript
useEffect(() => {
  const results = calculateAllMeasurements(landmarks);
  setMeasurements(results);
}, [landmarks]);
```

---

## 9. Backend API

### 9.1 Analyze Ceph Image

```
POST /api/ceph/analyze
```

```javascript
router.post("/analyze", async (req, res) => {
  const image = req.file;

  const landmarks = await aiService.detect(image);
  const measurements = calculateAllMeasurements(landmarks);

  const ceph = await CephAnalysis.create({
    imageUrl: image.path,
    landmarks,
    measurements
  });

  res.json(ceph);
});
```

---

### 9.2 Update Landmarks

```
PUT /api/ceph/:id/landmarks
```

```javascript
router.put("/:id/landmarks", async (req, res) => {
  const { landmarks } = req.body;

  const measurements = calculateAllMeasurements(landmarks);

  const updated = await CephAnalysis.findByIdAndUpdate(
    req.params.id,
    { landmarks, measurements },
    { new: true }
  );

  res.json(updated);
});
```

---

## 10. UX Enhancements

- Zoom and pan support
- Snap-to-anatomy assistance
- Highlight selected landmark
- Undo / redo functionality
- Toggle AI vs manual mode

---

## 11. Performance Considerations

|Issue|Solution|
|---|---|
|Large image rendering|Canvas scaling|
|Frequent recalculation|Debounce (50ms)|
|AI latency|Async processing + loader|
|Mobile performance|Optional WebGL rendering|

---

## 12. Future Enhancements

- AI treatment planning suggestions
- Growth prediction (CVM analysis)
- CBCT integration (3D ceph)
- PDF report export
- Longitudinal comparison

---

## 13. Summary

This module enables:

- Automated cephalometric analysis
- Interactive landmark correction
- Real-time measurement updates
- Scalable integration into dental systems

---

## 14. Next Steps

- Build React Ceph Viewer component
- Integrate AI service (FastAPI + model)
- Connect with patient records module
- Add reporting and export functionality

---