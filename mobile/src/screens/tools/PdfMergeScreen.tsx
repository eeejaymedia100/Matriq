import React from "react";
import { FileToolScreen } from "./FileToolScreen";

export function PdfMergeScreen() {
  return (
    <FileToolScreen
      title="PDF merge"
      subtitle="Combine multiple PDFs into one document, in the order you pick them."
      icon="layers"
      endpoint="/tools/pdf/merge"
      fieldName="files"
      mode="document"
      multiple
      mimeTypes={["application/pdf"]}
      pickLabel="Choose PDFs"
      runLabel="Merge PDFs"
      emptyHint="Pick two or more PDFs to combine"
    />
  );
}
