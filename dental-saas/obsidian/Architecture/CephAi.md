# 📄 Technical Design Specification (TDS)

## System: CephAI Service Extraction + AI Plane Integration (FINAL MERGED)

---

# 1. Overview

## 1.1 Purpose

Extract and integrate a **production-ready, stateless CephAI inference service** from:

```txt
D:\dev\Cephalometric analysis ai module
```

Into a new independent AI microservice:

```txt
D:\dev\cephai-service\
```

And integrate it into the Dental Platform with:

```txt
✔ AI inference (landmarks + measurements)
✔ Human correction workflow
✔ Cloudflare storage (images + annotations)
✔ Multi-tenant architecture
✔ Dataset separation for training
✔ Local retraining loop (RTX 4080)
✔ Dockerized AI Plane (CPU + GPU)
```

---

## 1.2 Core Principles

```txt
✔ AI Plane is stateless
✔ Org Plane owns patient data
✔ Training NEVER runs in production
✔ Dataset is isolated from clinical data
✔ Human corrections improve model
✔ Model + data must be versioned
```

---

# 2. System Architecture

## 2.1 High-Level Architecture

```txt
[ React Frontend ]
        │
        ▼
[ Node Backend (Platform API) ]
        │
        ▼
[ 🧠 CephAI Service (Docker) ]
        │
        ▼
[ Cloudflare Storage ]
        │
        ▼
[ Dataset Builder ]
        │
        ▼
[ Local Training (RTX 4080) ]
```

---

## 2.2 Logical Planes

|Plane|Responsibility|
|---|---|
|Platform Plane|Auth, routing|
|Org Plane|Patient records|
|AI Plane|Inference + validation|
|Dataset Plane|Training dataset|

---

# 3. Service Extraction

---

## 3.1 Target Structure

```txt
D:/dev/cephai-service/
├── api/
│   ├── main.py
│   └── routes/ceph.py
├── core/
│   ├── model_loader.py
│   ├── hrnet.py
│   ├── inference.py
│   └── measurements.py
├── utils/
│   ├── image_processing.py
│   ├── annotation.py
│   ├── orientation.py
│   └── validation.py
├── models/.gitkeep
├── config.py
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## 3.2 Extraction Rules

### MUST COPY

```txt
✔ HRNet model + loader
✔ inference pipeline
✔ measurement engine
✔ preprocessing + utils
```

### MUST EXCLUDE

```txt
dataset/
training/
experiments/
scripts/
train_*.py
debug_*.py
model_weights/
```

---

## 3.3 Critical Rule

```txt
❌ DO NOT modify original repo
✔ Copy-only extraction
```

---

# 4. API Design

---

## 4.1 Endpoints

|Endpoint|Method|Description|
|---|---|---|
|/ai/ceph-analysis|POST|AI inference|
|/ai/recalculate|POST|Measurement recompute|
|/ai/save-correction|POST|Stateless validation|
|/health|GET|Health check|

---

## 4.2 Response Schema

```json
{
  "landmarks": {},
  "confidence": {},
  "measurements": {},
  "annotatedImage": "base64",
  "modelInputSize": 512,
  "modelVersion": "v2",
  "lowConfidenceLandmarks": [],
  "warnings": [],
  "_meta": {
    "orgId": "...",
    "userId": "..."
  }
}
```

---

# 5. Stateless Save-Correction

---

## Removed (MANDATORY)

```txt
dataset writes
cv2.imwrite
JSON file writes
case ID auto increment
```

---

## New Behavior

```json
{
  "status": "processed",
  "storage": "external",
  "caseId": "abc123",
  "numCorrected": 4,
  "timestamp": "...",
  "payload": { ... },
  "_meta": { "orgId": "...", "userId": "..." }
}
```

---

# 6. Model Management

---

## 6.1 Volume Mount

```txt
/app/models/
   ceph_v1.pth
   ceph_v2.pth
```

---

## 6.2 Auto-load Latest

```python
files.sort()
latest = files[-1]
```

---

## 6.3 Singleton Model (MANDATORY)

```python
_model = None

def get_model():
    global _model
    if _model is None:
        _model = load_hrnet_model()
    return _model
```

---

## 6.4 Model Version Extraction

```python
def extract_version(name):
    return "vX"
```

---

# 7. Inference Hardening

---

## 7.1 Timeout

```python
asyncio.wait_for(...)
```

---

## 7.2 Image Size Limit

```python
MAX_SIZE = 10MB
```

---

## 7.3 Coordinate Standardization

```txt
All landmarks MUST be in 512x512 model space
```

---

## 7.4 Logging Context

```python
[orgId] [userId] request log
```

---

## 7.5 CORS

```python
allow_origins="*"
```

---

## 7.6 Health Endpoint

```python
status + model version
```

---

## 7.7 Rate Limit Hook

```txt
placeholder middleware
```

---

# 8. Multi-Tenant Support

---

## Headers

```txt
X-Org-Id
X-User-Id
X-API-Key
```

---

## Behavior

```txt
✔ pass-through only
✔ logged
✔ returned in response
```

---

# 9. Docker Architecture

---

## 9.1 Multi-stage Build

```bash
--target cpu
--target gpu
```

---

## 9.2 Runtime

```bash
docker run -v /models:/app/models
```

---

## 9.3 GPU

```bash
docker run --gpus all
```

---

# 10. Platform Backend Integration

---

## 10.1 Module

```txt
/backend/src/platform/ai/ceph/
```

---

## 10.2 Responsibilities

```txt
✔ proxy to CephAI
✔ inject headers
✔ upload to Cloudflare
✔ store Mongo metadata
✔ link to patient
```

---

## 10.3 Routes

```txt
POST /api/ceph/analyze
POST /api/ceph/recalculate
POST /api/ceph/save
GET /api/ceph/export-dataset
```

---

# 11. Cloud Storage (Cloudflare)

Using

---

## Structure

```txt
/ceph/org_{orgId}/
   case.jpg
   case.json
   preview.jpg
```

---

## JSON Schema

```json
{
  "orgId": "...",
  "patientId": "...",
  "aiLandmarks": {},
  "correctedLandmarks": {},
  "measurements": {},
  "modelVersion": "v2"
}
```

---

# 12. Org Plane Integration

---

## Patient Model

```js
cephAnalyses: [
  {
    imageUrl,
    jsonUrl,
    previewUrl,
    modelVersion,
    createdAt
  }
]
```

---

# 13. Dataset Separation

---

## Structure

```txt
/ai-datasets/
   /dataset_v1/
      /batch_001/
         images/
         labels/
```

---

## Rules

```txt
✔ 100 cases per batch
✔ corrected only
✔ no PHI
✔ normalized labels
```

---

# 14. Dataset Builder

---

## Responsibilities

```txt
✔ fetch from Cloudflare
✔ filter valid data
✔ export batches
✔ anonymize
```

---

# 15. Training Pipeline

---

## Location

```txt
✔ local RTX 4080
❌ not production
```

---

## Flow

```txt
Cloudflare → dataset → local training → new model
```

---

## Deployment

```bash
scp model → /models
docker restart cephai
```

---

# 16. Security

---

## Controls

```txt
✔ API key required
✔ size validation
✔ stateless isolation
✔ HTTPS
```

---

# 17. Verification Plan

```txt
1. import check
2. run locally
3. model load
4. test endpoints
5. verify stateless
6. docker CPU
7. docker GPU
8. backend integration
```

---

# 18. Non-Functional Requirements

|Metric|Target|
|---|---|
|Inference|<1s GPU|
|CPU|<3s|
|Image size|≤10MB|
|Availability|99.9%|

---

# 19. Out of Scope

```txt
❌ training inside service
❌ dataset building automation
❌ frontend UI
❌ auth enforcement
```

---

# 20. Final Architecture Summary

```txt
CephAI → compute engine
Node → control + storage
Cloudflare → data layer
Local GPU → training
```

---

# ✅ Final Result

```txt
✔ Clean AI microservice
✔ Fully stateless
✔ Scalable
✔ Dockerized
✔ Multi-tenant ready
✔ Continuous learning loop
✔ Research repo preserved
```

---