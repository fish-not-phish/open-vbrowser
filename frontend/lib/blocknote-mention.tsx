/**
 * BlockNote custom inline content: @mention
 *
 * Stored in the document as:
 *   { type: "mention", props: { email: "alice@example.com" } }
 *
 * Renders as a pink chip: @alice@example.com
 */

import { createReactInlineContentSpec } from "@blocknote/react";

export const MentionInlineContent = createReactInlineContentSpec(
  {
    type: "mention" as const,
    propSchema: {
      email: { default: "" },
    },
    content: "none",
  },
  {
    render: (props) => (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          backgroundColor: "rgba(207, 114, 135, 0.15)",
          color: "#CF7287",
          borderRadius: "4px",
          padding: "0 4px",
          fontWeight: 600,
          fontSize: "0.9em",
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
        contentEditable={false}
      >
        @{props.inlineContent.props.email}
      </span>
    ),
  }
);
