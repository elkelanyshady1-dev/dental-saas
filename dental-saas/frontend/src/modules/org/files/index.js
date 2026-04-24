/**
 * files/index.js — File Module Barrel Export
 * Phase v27.1 — Frontend File Module
 *
 * Re-exports all public APIs for the File module.
 *
 * Usage:
 *   import { FileUploader, FilePreview } from "@/modules/org/files";
 *   import { useFileUpload, useFileUrl, useFileList } from "@/modules/org/files";
 *   import { useRecordPhotoUpload } from "@/modules/org/files";
 *   import { useSnapshotFileUpload, dataURLtoBlob } from "@/modules/org/files";
 *   import { fileApi } from "@/modules/org/files";
 *
 * PLANE: Organization
 */

// ── Components ───────────────────────────────────────────────────────────────
export { default as FileUploader } from "./components/FileUploader";
export { default as FilePreview } from "./components/FilePreview";

// ── Core Hooks ───────────────────────────────────────────────────────────────
export { useFileUpload } from "./hooks/useFileUpload";
export { useFileUrl, useFileList } from "./hooks/useFileUrl";

// ── Domain Integration Hooks ─────────────────────────────────────────────────
export { useRecordPhotoUpload } from "./hooks/useRecordPhotoUpload";
export { useSnapshotFileUpload, dataURLtoBlob } from "./hooks/useSnapshotFileUpload";

// ── API Layer ────────────────────────────────────────────────────────────────
export { fileApi } from "./api/file.api";
