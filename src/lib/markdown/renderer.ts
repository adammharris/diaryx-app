import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";
import { frontmatter, frontmatterHtml } from "micromark-extension-frontmatter";
import type { Options as MicromarkOptions } from "micromark";

const processorOptions: MicromarkOptions = {
  extensions: [gfm(), frontmatter(["yaml", "toml"])],
  htmlExtensions: [gfmHtml(), frontmatterHtml(["yaml", "toml"])],
};

export const renderMarkdownToHtml = (markdown: string): string =>
  micromark(markdown, undefined, processorOptions);
