/**
 * Type declaration for optional pdf-parse (PDF text extraction).
 * Install with: npm install pdf-parse
 */
declare module 'pdf-parse' {
  function pdfParse(buffer: Buffer): Promise<{ text: string; numpages: number; info?: unknown; metadata?: unknown }>;
  export default pdfParse;
}
