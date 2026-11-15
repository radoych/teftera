/** Symbologies a loyalty card can be stored in. Mirrors `loyalty_cards.code_format`. */
export type BarcodeFormat = 'ean13' | 'ean8' | 'code128' | 'qr';

/** A 1-D barcode as a run of equal-width modules; true = bar, false = space. Quiet zones excluded. */
export type Modules = boolean[];
