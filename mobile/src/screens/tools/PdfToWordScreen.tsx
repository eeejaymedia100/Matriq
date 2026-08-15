import React from "react";
import { FileToolScreen } from "./FileToolScreen";

export function PdfToWordScreen() {
  return (
    <FileToolScreen
      title="PDF → Word"
      subtitle="Extract the text from a PDF into an editable .docx file."
      icon="fileText"
      endpoint="/tools/pdf/to-word"
      fieldName="file"
      mode="document"
      mimeTypes={["application/pdf"]}
      pickLabel="Choose a PDF"
      runLabel="Convert to Word"
      emptyHint="Pick a text-based PDF to convert"
      successHint="Scanned pages have no selectable text — try OCR on those instead."
    />
  );
}
