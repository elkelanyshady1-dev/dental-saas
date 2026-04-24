# TECHNICAL DESIGN SPECIFICATION (TDS)

## U-CAP Background Processing + Upload Tracking System

---

# 1. OVERVIEW

## 1.1 Objective

Implement a **lightweight in-process background worker system** for asset processing (thumbnails, DICOM parsing, metadata) with:

- Non-blocking uploads
- Retry & recovery guarantees
- UI progress tracking (upload + processing)
- Failure visibility + manual retry

---

## 1.2 Scope

### Backend

- Self worker (setImmediate-based)
- Retry mechanism
- Crash recovery
- Processing state tracking

### Frontend

- Upload progress bar
- Processing status indicators
- Failure UI + retry action

---

## 1.3 Non-Goals

- Distributed queue (BullMQ)
- Redis dependency
- Multi-instance job coordination

---

# 2. SYSTEM ARCHITECTURE

## 2.1 Flow

```
Upload → API → Save Photo → enqueueAssetJobs()
        ↓
   setImmediate()
        ↓
   processJob()
        ↓
   Update Photo.processingStatus
        ↓
   UI auto-refresh via React Query
```

---

# 3. DATA MODEL EXTENSIONS

## 3.1 Photo Model Additions

```js
processingStatus: {
  type: String,
  enum: ["pending", "processing", "done", "failed", "skipped"],
  default: "pending"
},

processingProgress: {
  type: Number, // 0 → 100
  default: 0
},

retryCount: {
  type: Number,
  default: 0
},

processingError: {
  type: String,
  default: null
},

thumbnailStorageKey: String,

dicomMetadata: {
  modality: String,
  width: Number,
  height: Number,
  windowCenter: Number,
  windowWidth: Number
}
```

---

# 4. BACKEND IMPLEMENTATION

## 4.1 Enqueue Job

```js
export function enqueueAssetJobs(photo) {
  setImmediate(() => {
    processWithLimit(photo._id);
  });
}
```

---

## 4.2 Concurrency Control

```js
import pLimit from "p-limit";

const limit = pLimit(3);

function processWithLimit(photoId) {
  return limit(() => processJob(photoId));
}
```

---

## 4.3 Job Processor

```js
async function processJob(photoId) {
  const photo = await Photo.findById(photoId);
  if (!photo) return;

  if (photo.processingStatus === "done") return;

  await Photo.updateOne(
    { _id: photoId },
    { processingStatus: "processing", processingProgress: 0 }
  );

  try {
    await runAssetPipeline(photo, updateProgress);

    await Photo.updateOne(
      { _id: photoId },
      {
        processingStatus: "done",
        processingProgress: 100,
        processingError: null
      }
    );

  } catch (err) {
    await handleFailure(photo, err);
  }
}
```

---

## 4.4 Progress Callback

```js
async function updateProgress(photoId, progress) {
  await Photo.updateOne(
    { _id: photoId },
    { processingProgress: progress }
  );
}
```

---

## 4.5 Retry Logic

```js
async function handleFailure(photo, err) {
  const retryCount = (photo.retryCount || 0) + 1;

  await Photo.updateOne(
    { _id: photo._id },
    {
      processingStatus: "failed",
      processingError: String(err),
      retryCount
    }
  );

  if (retryCount < 3) {
    setTimeout(() => processWithLimit(photo._id), 5000);
  }
}
```

---

## 4.6 Recovery on Server Start

```js
export async function recoverJobs() {
  const jobs = await Photo.find({
    processingStatus: { $in: ["pending", "processing", "failed"] },
    retryCount: { $lt: 3 }
  });

  for (const job of jobs) {
    enqueueAssetJobs(job);
  }
}
```

Call during app bootstrap:

```js
await recoverJobs();
```

---

## 4.7 Retry Endpoint

```js
POST /api/v1/org/photos/:id/retry
```

```js
export async function retryPhoto(req, res) {
  const { id } = req.params;

  await Photo.updateOne(
    { _id: id },
    { processingStatus: "pending", retryCount: 0 }
  );

  enqueueAssetJobs({ _id: id });

  res.json({ success: true });
}
```

---

# 5. FRONTEND IMPLEMENTATION

## 5.1 Upload Progress (Axios)

```js
await axios.post("/upload", formData, {
  onUploadProgress: (e) => {
    const percent = Math.round((e.loaded * 100) / e.total);
    setUploadProgress(percent);
  }
});
```

---

## 5.2 UI States

|State|UI|
|---|---|
|Uploading|Blue progress bar|
|Processing|Animated progress bar|
|Done|Normal asset|
|Failed|Red banner + retry button|

---

## 5.3 AssetCard Enhancements

```tsx
{photo.processingStatus === "processing" && (
  <ProgressBar value={photo.processingProgress} />
)}

{photo.processingStatus === "failed" && (
  <div className="text-red-500">
    Failed
    <button onClick={() => retry(photo.id)}>Retry</button>
  </div>
)}
```

---

## 5.4 Retry Hook

```ts
export function useRetryPhoto(caseId: string) {
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`/photos/${id}/retry`),

    onSuccess: () => {
      queryClient.invalidateQueries(QK.orthodontics.photos(caseId));
    }
  });
}
```

---

## 5.5 React Query Auto Refresh

```ts
useQuery({
  queryKey: QK.orthodontics.photos(caseId),
  queryFn: fetchPhotos,
  refetchInterval: 5000
});
```

---

# 6. UI/UX REQUIREMENTS

## 6.1 Progress Bar Behavior

- Upload progress (real-time)
- Processing progress (backend-driven)
- Smooth animation (CSS transition)

---

## 6.2 Failure UX

- Red state card
- Error message tooltip
- Retry button
- No silent failures

---

## 6.3 Success UX

- Instant preview
- Thumbnail replaces placeholder
- No page reload

---

# 7. OBSERVABILITY

## 7.1 Logs

```txt
ASSET_JOB_START
ASSET_JOB_PROGRESS
ASSET_JOB_DONE
ASSET_JOB_FAILED
ASSET_JOB_RETRY
ASSET_JOB_RECOVERED
```

Each includes:

- photoId
- caseId
- retryCount

---

# 8. SAFETY & LIMITS

- Max retries: 3
- Concurrency: 3 jobs
- No blocking API threads
- Recovery on every restart

---

# 9. INVARIANTS

❌ No frontend fileType inference  
❌ No silent fallback  
❌ No blocking request processing  
❌ No direct storageKey exposure

✅ Backend remains source of truth  
✅ UI reflects real processing state  
✅ Jobs never silently disappear

---

# 10. FUTURE EXTENSIONS

- Replace worker with BullMQ (no API change required)
- Add job priority queue
- Add batch retry UI
- Add processing analytics dashboard

---

# FINAL RESULT

You now have:

✔ Background processing without Redis  
✔ Reliable retry + recovery  
✔ Real-time UI progress  
✔ Failure visibility + retry  
✔ Production-safe for single-instance deployment

---