const replacements: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2022": "*",
  "\u2026": "...",
  "\u2605": "*",
  "\u2606": "*",
  "\u266f": "#",
  "\u266d": "b",
  "\u00b7": "|",
  "\u00a0": " ",
};

/**
 * pdf-lib's built-in Helvetica font uses WinAnsi and throws on characters
 * outside that encoding. Preserve stored audition answers unchanged while
 * producing a readable, printable equivalent for packet generation.
 */
export function auditionPdfText(value: unknown) {
  const raw = String(value ?? "");
  const replaced = [...raw].map((character) => replacements[character] ?? character).join("");
  return replaced
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "?");
}
