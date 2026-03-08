const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const RESUMES_DIR = __dirname;
const OUTPUT_DIR = path.join(RESUMES_DIR, "output");
const AUX_EXTENSIONS = [".aux", ".fdb_latexmk", ".fls", ".log", ".out", ".synctex.gz"];

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR);
}

// Find all .tex files (skip files starting with _)
const texFiles = fs
  .readdirSync(RESUMES_DIR)
  .filter((f) => f.endsWith(".tex") && !f.startsWith("_"));

if (texFiles.length === 0) {
  console.log("No .tex files found to build (files starting with _ are skipped).");
  process.exit(0);
}

let failed = 0;

for (const tex of texFiles) {
  const name = path.parse(tex).name;
  console.log(`\n=== Building ${tex} ===`);
  try {
    execSync(`pdflatex -interaction=nonstopmode "${tex}"`, {
      cwd: RESUMES_DIR,
      stdio: "inherit",
    });

    // Move PDF to output directory
    const pdfSrc = path.join(RESUMES_DIR, `${name}.pdf`);
    const pdfDst = path.join(OUTPUT_DIR, `${name}.pdf`);
    if (fs.existsSync(pdfSrc)) {
      fs.renameSync(pdfSrc, pdfDst);
      console.log(`-> ${path.relative(RESUMES_DIR, pdfDst)}`);
    }
  } catch {
    console.error(`!! Failed to build ${tex}`);
    failed++;
  }

  // Clean up aux files regardless of success/failure
  for (const ext of AUX_EXTENSIONS) {
    const auxFile = path.join(RESUMES_DIR, `${name}${ext}`);
    if (fs.existsSync(auxFile)) fs.unlinkSync(auxFile);
  }
}

console.log(`\nDone. ${texFiles.length - failed}/${texFiles.length} built successfully.`);
if (failed > 0) process.exit(1);
