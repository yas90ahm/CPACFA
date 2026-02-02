/** Single extracted value with bounding box (coordinates in % of page width/height) */
export interface OcrBox {
  id: string;
  value: string;
  /** 0–100, left edge */
  x: number;
  /** 0–100, top edge */
  y: number;
  /** 0–100, width */
  width: number;
  /** 0–100, height */
  height: number;
  /** Optional label (e.g. account name) */
  label?: string;
}

/** OCR extraction result per page */
export interface OcrExtraction {
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  boxes: OcrBox[];
}

/** Full extraction for a document (supports multiple pages) */
export interface SmartIngestionExtraction {
  documentId: string;
  fileName: string;
  pages: OcrExtraction[];
}

/** Ingestion pipeline stages (order matters) */
export type IngestionStageId =
  | 'extracting'
  | 'classifying'
  | 'verifying'
  | 'generating';

/** Status of a single stage in the pipeline */
export type StageStatus = 'pending' | 'active' | 'done' | 'error';

/** Parsing/validation error from the agent for a given stage */
export interface ParsingError {
  stageId: IngestionStageId;
  message: string;
  details?: string;
  /** e.g. line number, cell reference */
  location?: string;
}

/** Stage definition for Activity Chips */
export interface IngestionStageDef {
  id: IngestionStageId;
  label: string;
  icon: string;
}
