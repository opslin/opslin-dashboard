declare module "ansi-to-html" {
  export default class Convert {
    constructor(options?: {
      fg?: string;
      bg?: string;
      newline?: boolean;
      escapeXML?: boolean;
      stream?: boolean;
      colors?: string[];
    });

    toHtml(input: string): string;
  }
}
