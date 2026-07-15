// ponytail: singleton ref for AiPanel to extract page text without re-loading PDF
import type { PDFDocumentProxy, TextItem } from "pdfjs-dist";

let _doc: PDFDocumentProxy | null = null;
let _totalPages = 0;

export function setPdfDoc(doc: PDFDocumentProxy, totalPages: number) {
  _doc = doc;
  _totalPages = totalPages;
}

export function clearPdfDoc() {
  _doc = null;
  _totalPages = 0;
}

export async function getPageText(pageNum: number): Promise<string> {
  if (!_doc || pageNum < 1 || pageNum > _totalPages) return "";
  try {
    const page = await _doc.getPage(pageNum);
    const content = await page.getTextContent();
    return content.items
      .filter((item): item is TextItem => "str" in item)
      .map((item) => item.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}
