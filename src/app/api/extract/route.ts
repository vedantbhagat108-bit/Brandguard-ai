import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = ["txt", "md", "docx", "pdf"];

function normalizeText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const entry = formData.get("file");

    if (!(entry instanceof File)) {
      return NextResponse.json(
        { error: "Choose a document to upload." },
        { status: 400 },
      );
    }

    if (entry.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error:
            "That file is larger than 5 MB. Try a smaller document or paste the text instead.",
        },
        { status: 413 },
      );
    }

    const extension = entry.name.split(".").pop()?.toLowerCase() ?? "";
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      return NextResponse.json(
        {
          error:
            "That file type isn't supported. Use PDF, DOCX, TXT or Markdown.",
        },
        { status: 415 },
      );
    }

    const buffer = Buffer.from(await entry.arrayBuffer());
    let text = "";
    let pages: number | undefined;

    if (extension === "txt" || extension === "md") {
      text = buffer.toString("utf8");
    } else if (extension === "docx") {
      const mammoth = (await import("mammoth")).default;
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const extracted = await extractText(pdf, { mergePages: true });
      text = extracted.text;
      pages = extracted.totalPages;
    }

    const normalized = normalizeText(text);
    if (normalized.length < 20) {
      return NextResponse.json(
        {
          error:
            "We couldn't find selectable text in that document. Scanned PDFs and image-only files need OCR — try a text-based export instead.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      text: normalized.slice(0, 60000),
      fileName: entry.name,
      pages,
    });
  } catch (error) {
    console.error("Document extraction failed", error);
    return NextResponse.json(
      {
        error:
          "We couldn't read that document. Try exporting it as a PDF or TXT file, or paste the text instead.",
      },
      { status: 500 },
    );
  }
}
