/**
 * Board deck: slide-ready structure (title + bullets).
 */

export interface BoardSlide {
  title: string;
  bullets: string[];
}

export interface BoardDeckResult {
  periodLabel?: string;
  slides: BoardSlide[];
  generatedAt: string; // ISO
}
