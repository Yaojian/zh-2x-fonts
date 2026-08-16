declare module "fontkit" {
  export interface FontKitGlyph {
    id: number;
    advanceWidth: number;
  }
  export interface FontKitFont {
    hasGlyphForCodePoint(cp: number): boolean;
    glyphForCodePoint(cp: number): FontKitGlyph;
  }
  export function create(buffer: Uint8Array): FontKitFont;
}
