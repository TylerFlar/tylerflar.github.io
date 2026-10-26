---
title: "Papyrus"
summary: "A research assistant for academic papers: upload PDFs, ask questions, and get answers from Claude that cite the page they came from."
image: /assets/images/projects/papyrus/cover.png
date: 2026-04-05
cv: project/papyrus
category: software
role: "Personal project"
links:
    - { label: Code, href: "https://github.com/TylerFlar/papyrus" }
---

Papyrus lets you upload research papers as PDFs and ask questions about them. Answers stream back from Claude with a citation to the paper and page each claim came from. I built it in April 2026.

## How a question gets answered

1. **Upload.** The backend pulls the text out of each PDF with PyMuPDF, splits it into chunks of about 1,000 characters that remember which section they came from, embeds them with a sentence-transformer model (all-MiniLM-L6-v2), and stores them in Qdrant.
2. **Retrieve.** A question is embedded the same way, and of the 10 nearest chunks, the best 5 go forward.
3. **Answer.** Claude gets those chunks and a system prompt that requires a citation like [Paper Title, p. 4] for every claim. Its answer streams to the browser over server-sent events, along with the sources it used.

Besides plain questions, it can compare papers side by side, with a few chunks from each, or write a literature review across the library. Claude also pulls the references out of each paper, and a citation graph draws each paper and the papers it cites.

## Stack

- **Backend:** FastAPI, Qdrant, SQLite through SQLAlchemy, and the Anthropic API, with 30 tests on the chunking and PDF processing.
- **Frontend:** Next.js, React and Tailwind, with pages for uploading, the library, chat and the citation graph.
- Docker Compose runs Qdrant, the backend and the frontend together.
