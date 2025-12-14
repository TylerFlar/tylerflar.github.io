# tylerflar.github.io

Personal site built with Eleventy and published via GitHub Pages.

## Local development

```powershell
npm install
npm run serve
```

Visit http://localhost:8080 to preview.

## Math notation in Markdown

Mathematical expressions render through MathJax 3. Use standard delimiters:

- Inline math: `$O(n^3)$`
- Display math: `$$\int_0^1 f(x) \\ dx$$`

Eleventy is configured with `markdown-it` + `markdown-it-mathjax3`, and the base layout loads the MathJax runtime from jsDelivr so math renders consistently without any extra asset copying. Update `.eleventy.js` (markdown library) or the `window.MathJax` block in `base.njk` if you need custom macros or display tweaks.

**Styling tip:** MathJax renders into `<mjx-container>` elements. The layout simply adds a small margin to those containers, so if you change your global spacing or typography you may want to adjust that selector accordingly.

## Images

1. Drop image files under `src/assets/images/` (subfolders are fine).
2. Reference them in Markdown using absolute URLs so the output works on GitHub Pages:

```markdown
![Packed micro-kernel diagram](/assets/images/dgemm-packing.png)
```

During the Eleventy build, everything in `src/assets` is copied to `docs/assets`. The base layout auto-centers Markdown images, constrains them to 640px max width, and keeps the aspect ratio. Wrap an image in `<figure>` / `<figcaption>` if you want accompanying captions.

## Syntax highlighting

- Fenced code blocks automatically highlight using Prism.js. Set the language right after the fence, e.g.:

```markdown
```cpp
for (int i = 0; i < n; ++i) {
	// ...
}
```
```

- Supported aliases follow Prism's language list (cpp, js, ts, python, bash, etc.). Inline code (`` `printf("hi")` ``) gets a subtle background for readability.

## Detail page back buttons

Individual entries for classes (`tags: classes`), blog posts (`tags: post`), and projects (`tags: projects`) automatically get a pill-shaped back button that links to the respective archive. If you add new content types, either reuse one of those tags or extend the `backLink` logic in `.eleventy.js` so the layout knows where to send visitors.

### Class archive separators

- Each class markdown file can declare a `level` front matter field (`graduate` or `undergraduate`).
- The archive page groups classes by level and adds a subtle divider label.
- Items without `level` default into the undergraduate bucket, so set `level: graduate` explicitly for grad seminars/labs.

## Project metadata

- Add a `date_range` field to each project front matter (e.g., `date_range: "Jan 2023 – Aug 2023"`).
- Cards on `/projects/` display the range if present; otherwise they fall back to the single `date` value formatted as `Mon YYYY`.
- Keep `date` populated for sorting even when you use `date_range` for display.

## Build

```powershell
npm run build
```

Generated files land in the `docs/` directory for GitHub Pages hosting.
