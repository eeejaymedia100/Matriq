import React from "react";
import { FileToolScreen } from "./FileToolScreen";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function WordToPdfScreen() {
  return (
    <FileToolScreen
      title="Word → PDF"
      subtitle="Turn a .docx document into a shareable PDF."
      icon="pen"
      endpoint="/tools/pdf/from-word"
      fieldName="file"
      mode="document"
      mimeTypes={[DOCX_MIME, "application/octet-stream"]}
      pickLabel="Choose a .docx"
      runLabel="Convert to PDF"
      emptyHint="Pick a .docx file to convert"
    />
  );
}
