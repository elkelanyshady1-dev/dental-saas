/**
 * AttachmentsGrid.tsx
 * Renders image / xray / stl / document attachments from a snapshot.
 * Files are URL references only — no binary data stored in MongoDB.
 */

import React, { useState } from "react";

interface Attachment {
  url:      string;
  type:     string;
  name:     string | null;
  fileName?:string;
}

interface Props {
  attachments: Attachment[];
  snapshotId:  string | null;
}

const TYPE_ICONS: Record<string, string> = {
  image:    "🖼️",
  xray:     "🔆",
  stl:      "🧊",
  document: "📄",
  photo:    "📷",
};

const TYPE_LABELS: Record<string, string> = {
  image:    "Photo",
  xray:     "X-Ray",
  stl:      "STL Scan",
  document: "Document",
  photo:    "Photo",
};

function AttachmentTile({ attachment, index }: { attachment: Attachment; index: number }) {
  const [imgError, setImgError] = useState(false);
  const isImage = ["image", "photo", "xray"].includes(attachment.type) && !imgError;
  const label = attachment.name ?? attachment.fileName ?? `${TYPE_LABELS[attachment.type] ?? attachment.type} ${index + 1}`;

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open ${label}`}
      style={{
        display:        "flex",
        flexDirection:  "column",
        borderRadius:   "10px",
        overflow:       "hidden",
        border:         "1px solid rgba(255,255,255,0.08)",
        textDecoration: "none",
        transition:     "transform 0.15s ease, border-color 0.15s ease",
        background:     "rgba(255,255,255,0.04)",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(99,102,241,0.5)"; (e.currentTarget as HTMLAnchorElement).style.transform = "scale(1.02)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.08)"; (e.currentTarget as HTMLAnchorElement).style.transform = "scale(1)"; }}
    >
      {/* Preview or icon */}
      <div style={{
        height:         "120px",
        background:     "rgba(0,0,0,0.3)",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        overflow:       "hidden",
      }}>
        {isImage ? (
          <img
            src={attachment.url}
            alt={label}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={() => setImgError(true)}
          />
        ) : (
          <span style={{ fontSize: "36px", opacity: 0.6 }}>
            {TYPE_ICONS[attachment.type] ?? "📎"}
          </span>
        )}
      </div>

      {/* Label */}
      <div style={{ padding: "8px 10px" }}>
        <div style={{
          fontSize:     "11px",
          color:        "#94a3b8",
          whiteSpace:   "nowrap",
          overflow:     "hidden",
          textOverflow: "ellipsis",
        }}>
          {TYPE_ICONS[attachment.type] ?? "📎"} {label}
        </div>
        <div style={{ fontSize: "10px", color: "#475569", marginTop: "2px" }}>
          {TYPE_LABELS[attachment.type] ?? attachment.type}
        </div>
      </div>
    </a>
  );
}

export function AttachmentsGrid({ attachments, snapshotId }: Props) {
  if (!attachments || attachments.length === 0) {
    return (
      <div style={{
        background:     "rgba(255,255,255,0.04)",
        border:         "1px solid rgba(255,255,255,0.08)",
        borderRadius:   "12px",
        padding:        "24px 20px",
        textAlign:      "center",
      }}>
        <div style={{ fontSize: "28px", marginBottom: "8px", opacity: 0.4 }}>📎</div>
        <p style={{ margin: 0, fontSize: "13px", color: "#475569" }}>No attachments uploaded</p>
      </div>
    );
  }

  return (
    <div style={{
      background:   "rgba(255,255,255,0.04)",
      border:       "1px solid rgba(255,255,255,0.08)",
      borderRadius: "12px",
      padding:      "20px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
        <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Attachments
        </h3>
        <span style={{ fontSize: "12px", color: "#64748b" }}>{attachments.length} file{attachments.length !== 1 ? "s" : ""}</span>
      </div>

      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
        gap:                 "10px",
      }}>
        {attachments.map((a, i) => (
          <AttachmentTile key={`${a.url}-${i}`} attachment={a} index={i} />
        ))}
      </div>
    </div>
  );
}
