/**
 * jsbarcode ships `jsbarcode.d.ts` at its package root but sets neither a
 * `types` field nor an `index.d.ts`, so TypeScript's resolver never finds it
 * (it looks for `bin/JsBarcode.d.ts` next to the `main` entry). Declaring the
 * slice of the API this feature actually uses is cleaner than adding a
 * `paths` entry pointing into node_modules.
 */
declare module 'jsbarcode' {
  interface JsBarcodeOptions {
    format?: string;
    /** Width of a single narrow module, in pixels. */
    width?: number;
    /** Bar height, in pixels. */
    height?: number;
    displayValue?: boolean;
    text?: string;
    fontSize?: number;
    font?: string;
    textMargin?: number;
    textAlign?: string;
    textPosition?: string;
    background?: string;
    lineColor?: string;
    margin?: number;
    marginTop?: number;
    marginBottom?: number;
    marginLeft?: number;
    marginRight?: number;
    flat?: boolean;
    valid?: (valid: boolean) => void;
  }

  function JsBarcode(
    element: HTMLCanvasElement | SVGElement | string,
    value: string,
    options?: JsBarcodeOptions,
  ): void;

  export = JsBarcode;
}
