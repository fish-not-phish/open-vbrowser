/**
 * BlockNote custom inline content: #fileRef
 *
 * Stored in the document as:
 *   { type: "fileRef", props: { uuid: "...", filename: "report.pdf", source: "upload" } }
 *
 * Renders as a blue chip: #report.pdf (upload) or indigo (workspace).
 * Clicking triggers a download via event delegation on the BlockNoteView
 * container (data attributes carry the uuid + source).
 */

import { createReactInlineContentSpec } from "@blocknote/react";

export const FileRefInlineContent = createReactInlineContentSpec(
  {
    type: "fileRef" as const,
    propSchema: {
      uuid: { default: "" },
      filename: { default: "" },
      source: { default: "upload" },
    },
    content: "none",
  },
  {
    render: (props) => {
      const { uuid, filename, source } = props.inlineContent.props;
      return (
        <span
          data-file-ref-uuid={uuid}
          data-file-ref-source={source}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "2px",
            backgroundColor: source === "workspace"
              ? "rgba(99, 102, 241, 0.15)"
              : "rgba(59, 130, 246, 0.15)",
            color: source === "workspace" ? "#818CF8" : "#3B82F6",
            borderRadius: "4px",
            padding: "0 4px",
            fontWeight: 600,
            fontSize: "0.9em",
            userSelect: "none",
            whiteSpace: "nowrap",
            cursor: "pointer",
          }}
          contentEditable={false}
        >
          {"#"}
          {filename}
        </span>
      );
    },
  }
);
