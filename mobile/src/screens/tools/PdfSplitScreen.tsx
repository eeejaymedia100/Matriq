import React from "react";
import { FileToolScreen } from "./FileToolScreen";

export function PdfSplitScreen() {
  return (
    <FileToolScreen
      title="PDF split"
      subtitle="Split a PDF into separate pages, returned as a zip you can unzip anywhere."
      icon="fileText"
      endpoint="/tools/pdf/split"
      fieldName="file"
      mode="document"
      mimeTypes={["application/pdf"]}
      pickLabel="Choose a PDF"
      runLabel="Split into pages"
      emptyHint="Pick a multi-page PDF to split"
      successHint="Each page becomes its own PDF, zipped together."
    />
  );
}
