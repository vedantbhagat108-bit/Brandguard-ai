"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Accessibility,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Circle,
  CloudUpload,
  FileCheck2,
  FileText,
  FlaskConical,
  Info,
  Loader2,
  LockKeyhole,
  Megaphone,
  MessageCircle,
  Paperclip,
  Scale,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DemoGuideTrigger } from "@/components/layout/demo-guide";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, buttonStyles } from "@/components/ui/button";
import { Field, Input, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Modal } from "@/components/ui/modal";
import { useReviews } from "@/components/providers/review-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { DEMO_SAMPLES, type DemoSample } from "@/lib/mock/seed-reviews";
import { CHANNELS, type Channel } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_CONTENT = 20000;
const SUPPORTED_EXTENSIONS = ["txt", "md", "docx", "pdf"];

type UploadStage = "idle" | "uploading" | "extracting" | "complete" | "error";

function uploadFileWithProgress(
  file: File,
  onProgress: (percent: number, stage: UploadStage, statusLabel: string) => void,
): Promise<{ text: string; fileName: string; pages?: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    let extractInterval: number | undefined;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const ratio = event.loaded / event.total;
        const pct = Math.min(55, Math.max(12, Math.round(12 + ratio * 43)));
        onProgress(
          pct,
          "uploading",
          `Uploading document (${formatBytes(event.loaded)} / ${formatBytes(event.total)})...`,
        );
      }
    };

    xhr.upload.onload = () => {
      let currentPct = 60;
      onProgress(currentPct, "extracting", "Extracting selectable text & structure...");
      extractInterval = window.setInterval(() => {
        currentPct = Math.min(94, currentPct + 6);
        onProgress(currentPct, "extracting", "Extracting selectable text & structure...");
      }, 220);
    };

    xhr.onload = () => {
      if (extractInterval) window.clearInterval(extractInterval);
      let payload: { text?: string; fileName?: string; pages?: number; error?: string } = {};
      try {
        payload = JSON.parse(xhr.responseText || "{}");
      } catch {
        payload = {};
      }
      if (xhr.status >= 200 && xhr.status < 300 && payload.text) {
        onProgress(100, "complete", "Upload & text extraction complete (100%)");
        resolve({
          text: payload.text,
          fileName: payload.fileName || file.name,
          pages: payload.pages,
        });
      } else {
        reject(
          new Error(
            payload.error ||
              "We couldn't read that document. Try a PDF, DOCX, or TXT file under 5 MB.",
          ),
        );
      }
    };

    xhr.onerror = () => {
      if (extractInterval) window.clearInterval(extractInterval);
      reject(new Error("Network error while uploading document. Please try again."));
    };

    onProgress(10, "uploading", "Starting upload...");
    xhr.open("POST", "/api/extract");
    xhr.send(formData);
  });
}

const CHECKS = [
  {
    category: "Claims",
    description: "Medical, efficacy and absolute claims",
    icon: FlaskConical,
    tone: "bg-brand-50 text-brand-600",
  },
  {
    category: "Disclosure",
    description: "Paid partnerships, offers and required terms",
    icon: Megaphone,
    tone: "bg-amber-50 text-amber-600",
  },
  {
    category: "Terminology",
    description: "Approved product language and glossary",
    icon: BookOpen,
    tone: "bg-violet-50 text-violet-600",
  },
  {
    category: "Tone",
    description: "Warm, plain-spoken and non-shaming copy",
    icon: MessageCircle,
    tone: "bg-sky-50 text-sky-600",
  },
  {
    category: "Regulatory",
    description: "Comparatives, guarantees and consumer rules",
    icon: Scale,
    tone: "bg-rose-50 text-rose-600",
  },
  {
    category: "Accessibility",
    description: "Emoji, all-caps runs and descriptive alt text",
    icon: Accessibility,
    tone: "bg-emerald-50 text-emerald-600",
  },
] as const;

const ANALYSIS_STEPS = [
  {
    title: "Reading the draft",
    detail: "Normalising copy and checking the content structure.",
  },
  {
    title: "Checking 10 approved rules",
    detail: "Claims, disclosure, terminology, tone and accessibility.",
  },
  {
    title: "Linking findings to sources",
    detail: "Each issue is matched to an approved brand passage.",
  },
  {
    title: "Preparing the reviewer report",
    detail: "Severity, suggested fixes and knowledge gaps.",
  },
];

type FieldErrors = {
  title?: string;
  content?: string;
  file?: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AnalysisDialog({
  open,
  step,
  title,
}: {
  open: boolean;
  step: number;
  title: string;
}) {
  const progress = Math.min(100, Math.round((step / ANALYSIS_STEPS.length) * 100));
  return (
    <Modal
      open={open}
      onClose={() => undefined}
      title="Running your compliance review"
      description="Aurelia Skin · Approved knowledge v2.4 · 10 rules"
      size="md"
      icon={
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      }
      bodyClassName="space-y-5"
    >
      <div className="flex items-center gap-3 rounded-xl border border-line bg-ink-50/70 p-4">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-600 text-white">
          <span className="absolute inset-0 animate-soft-pulse bg-gradient-to-br from-brand-400 to-brand-700" />
          <Sparkles className="relative h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink-900">
            {title.trim() || "Untitled draft"}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-400">
            Local mock engine · your content stays in this browser
          </p>
        </div>
        <span className="ml-auto text-[11px] font-semibold tabular-nums text-brand-600">
          {progress}%
        </span>
      </div>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-ink-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label="Review progress"
      >
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-500 ease-out"
          style={{ width: `${Math.max(8, progress)}%` }}
        />
      </div>

      <ul className="space-y-2.5" aria-live="polite">
        {ANALYSIS_STEPS.map((item, index) => {
          const complete = step > index;
          const current = step === index;
          return (
            <li
              key={item.title}
              className={cn(
                "flex items-start gap-3 rounded-xl border px-3.5 py-3 transition",
                complete
                  ? "border-emerald-100 bg-emerald-50/40"
                  : current
                    ? "border-brand-100 bg-brand-50/50"
                    : "border-line bg-white",
              )}
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                {complete ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                ) : current ? (
                  <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-hidden="true" />
                ) : (
                  <Circle className="h-4 w-4 text-ink-200" aria-hidden="true" />
                )}
              </span>
              <div>
                <p
                  className={cn(
                    "text-[13px] font-semibold",
                    complete || current ? "text-ink-800" : "text-ink-400",
                  )}
                >
                  {item.title}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-400">
                  {item.detail}
                </p>
              </div>
              {complete && (
                <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-emerald-600">
                  Done
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-start gap-2 rounded-xl border border-line bg-white p-3 text-[11px] leading-relaxed text-ink-400">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint-600" aria-hidden="true" />
        Findings are advisory and cite synthetic approved sources. A human
        reviewer makes the final decision.
      </div>
    </Modal>
  );
}

function SampleCard({
  sample,
  onLoad,
}: {
  sample: DemoSample;
  onLoad: (sample: DemoSample) => void;
}) {
  const badgeTone =
    sample.badge === "High risk"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : sample.badge === "Clean copy"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <button
      type="button"
      onClick={() => onLoad(sample)}
      className="group flex h-full flex-col rounded-xl border border-line bg-white p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-ink-400">
          {sample.channel}
        </span>
        <Badge className={cn("normal-case tracking-normal", badgeTone)}>
          {sample.badge}
        </Badge>
      </div>
      <p className="mt-2 line-clamp-2 text-[12px] font-semibold leading-snug text-ink-900">
        {sample.title}
      </p>
      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-ink-400">
        {sample.description}
      </p>
      <span className="mt-auto flex items-center gap-1 pt-2.5 text-[10px] font-semibold text-brand-600">
        Load sample
        <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </button>
  );
}

export default function SubmitPage() {
  const router = useRouter();
  const { createReview } = useReviews();
  const { user, isManager } = useAuth();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [channel, setChannel] = useState<Channel>("Instagram");
  const [content, setContent] = useState("");
  const [isPaidPartnership, setIsPaidPartnership] = useState(false);
  const [mode, setMode] = useState<"paste" | "upload">("upload");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [contentNotice, setContentNotice] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [fileInfo, setFileInfo] = useState<{
    name: string;
    size: number;
    pages?: number;
  } | null>(null);
  const [contentUploadProgress, setContentUploadProgress] = useState(0);
  const [contentUploadStage, setContentUploadStage] = useState<UploadStage>("idle");
  const [contentUploadLabel, setContentUploadLabel] = useState("");
  const [contentUploadingFile, setContentUploadingFile] = useState<{
    name: string;
    size: number;
  } | null>(null);

  // Brand Knowledge Document / Text states
  const [knowledgeMode, setKnowledgeMode] = useState<"paste" | "upload">("upload");
  const [knowledgeText, setKnowledgeText] = useState("");
  const [knowledgeFileInfo, setKnowledgeFileInfo] = useState<{
    name: string;
    size: number;
    pages?: number;
  } | null>(null);
  const [extractingKnowledge, setExtractingKnowledge] = useState(false);
  const [knowledgeDragActive, setKnowledgeDragActive] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);
  const [knowledgeUploadProgress, setKnowledgeUploadProgress] = useState(0);
  const [knowledgeUploadStage, setKnowledgeUploadStage] = useState<UploadStage>("idle");
  const [knowledgeUploadLabel, setKnowledgeUploadLabel] = useState("");
  const [knowledgeUploadingFile, setKnowledgeUploadingFile] = useState<{
    name: string;
    size: number;
  } | null>(null);
  const knowledgeFileInputRef = useRef<HTMLInputElement>(null);

  async function processKnowledgeFile(file: File) {
    setKnowledgeError(null);
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      const msg = "File type not supported. Please upload PDF, DOCX, TXT or Markdown (under 5 MB).";
      setKnowledgeError(msg);
      setKnowledgeUploadStage("error");
      setKnowledgeUploadProgress(100);
      setKnowledgeUploadLabel(msg);
      setKnowledgeUploadingFile({ name: file.name, size: file.size });
      toast({
        title: "File type not supported",
        description: msg,
        variant: "error",
      });
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      const msg = `File "${file.name}" (${formatBytes(file.size)}) exceeds the 5 MB maximum size limit. Please upload a document smaller than 5 MB.`;
      setKnowledgeError(msg);
      setKnowledgeUploadStage("error");
      setKnowledgeUploadProgress(100);
      setKnowledgeUploadLabel("Upload rejected: File exceeds 5 MB limit");
      setKnowledgeUploadingFile({ name: file.name, size: file.size });
      toast({
        title: "File exceeds 5 MB limit",
        description: msg,
        variant: "error",
      });
      return;
    }

    setExtractingKnowledge(true);
    setKnowledgeUploadingFile({ name: file.name, size: file.size });
    setKnowledgeUploadProgress(10);
    setKnowledgeUploadStage("uploading");
    setKnowledgeUploadLabel("Starting brand knowledge document upload...");

    try {
      const json = await uploadFileWithProgress(
        file,
        (pct, stage, statusLabel) => {
          setKnowledgeUploadProgress(pct);
          setKnowledgeUploadStage(stage);
          setKnowledgeUploadLabel(statusLabel);
        },
      );
      setKnowledgeText(json.text);
      setKnowledgeFileInfo({
        name: json.fileName || file.name,
        size: file.size,
        pages: json.pages,
      });
      setKnowledgeUploadProgress(100);
      setKnowledgeUploadStage("complete");
      setKnowledgeUploadLabel(
        `Upload & extraction complete · ${json.text.length.toLocaleString()} chars extracted`,
      );
      toast({
        title: "Brand knowledge loaded",
        description: `Extracted ${json.text.length.toLocaleString()} characters from ${file.name}.`,
        variant: "success",
      });
    } catch (e: any) {
      const errMsg = e?.message || "Failed to extract brand knowledge document.";
      setKnowledgeError(errMsg);
      setKnowledgeUploadStage("error");
      setKnowledgeUploadProgress(100);
      setKnowledgeUploadLabel(errMsg);
      toast({ title: "Extraction failed", description: errMsg, variant: "error" });
    } finally {
      setExtractingKnowledge(false);
      if (knowledgeFileInputRef.current) knowledgeFileInputRef.current.value = "";
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const trimmedContent = content.trim();
  const wordCount = trimmedContent
    ? trimmedContent.split(/\s+/).filter(Boolean).length
    : 0;
  const charCount = content.length;

  useEffect(() => {
    if (!analyzing) return;
    setAnalysisStep(0);
    const timers = [
      window.setTimeout(() => setAnalysisStep(1), 220),
      window.setTimeout(() => setAnalysisStep(2), 720),
      window.setTimeout(() => setAnalysisStep(3), 1260),
      window.setTimeout(() => setAnalysisStep(4), 1780),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [analyzing]);

  function clearError(field: keyof FieldErrors) {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function validate() {
    const next: FieldErrors = {};
    if (title.trim().length < 3) {
      next.title = "Add a title of at least 3 characters.";
    } else if (title.trim().length > 120) {
      next.title = "Keep the title under 120 characters.";
    }

    if (trimmedContent.length < 40) {
      next.content =
        "Add at least 40 characters so the engine has enough context. Paste the copy or upload a document.";
    } else if (trimmedContent.length > MAX_CONTENT) {
      next.content = `Keep the draft under ${MAX_CONTENT.toLocaleString()} characters.`;
    }

    if (extracting || extractingKnowledge) {
      next.file = "Wait for the document to finish extracting.";
    }

    setErrors(next);

    if (next.title) {
      titleRef.current?.focus();
    } else if (next.content) {
      contentRef.current?.focus();
    }
    return Object.keys(next).length === 0;
  }

  function loadSample(sample: DemoSample) {
    setTitle(sample.title);
    setChannel(sample.channel);
    setContent(sample.content);
    setIsPaidPartnership(sample.isPaidPartnership);
    setMode("paste");
    setFileInfo(null);
    setContentUploadStage("idle");
    setContentUploadProgress(0);
    setContentUploadingFile(null);
    setErrors({});
    setSubmitError(null);
    setContentNotice(null);
    toast({
      title: "Sample draft loaded",
      description:
        "Review the copy, then run the mock compliance review. You can edit anything first.",
      variant: "info",
    });
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      document
        .getElementById("review-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function processFile(file: File) {
    setErrors((current) => {
      const next = { ...current };
      delete next.file;
      return next;
    });
    setContentNotice(null);

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      const msg = "That file type isn't supported. Use PDF, DOCX, TXT or Markdown (under 5 MB).";
      setErrors((current) => ({
        ...current,
        file: msg,
      }));
      setContentUploadingFile({ name: file.name, size: file.size });
      setContentUploadStage("error");
      setContentUploadProgress(100);
      setContentUploadLabel(msg);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      const msg = `File "${file.name}" (${formatBytes(file.size)}) exceeds the 5 MB maximum limit. Please upload a document under 5 MB or paste the text.`;
      setErrors((current) => ({
        ...current,
        file: msg,
      }));
      setContentUploadingFile({ name: file.name, size: file.size });
      setContentUploadStage("error");
      setContentUploadProgress(100);
      setContentUploadLabel("Upload rejected: File exceeds 5 MB limit");
      toast({
        title: "File exceeds 5 MB limit",
        description: msg,
        variant: "error",
      });
      return;
    }

    setExtracting(true);
    setContentUploadingFile({ name: file.name, size: file.size });
    setContentUploadProgress(10);
    setContentUploadStage("uploading");
    setContentUploadLabel("Starting content document upload...");

    try {
      const result = await uploadFileWithProgress(
        file,
        (pct, stage, statusLabel) => {
          setContentUploadProgress(pct);
          setContentUploadStage(stage);
          setContentUploadLabel(statusLabel);
        },
      );

      let text = result.text.trim();
      const pages = result.pages;

      if (text.length < 40) {
        throw new Error(
          "We couldn't find enough selectable text. Scanned documents may need OCR — paste the copy instead.",
        );
      }

      if (text.length > MAX_CONTENT) {
        setContent(text.slice(0, MAX_CONTENT));
        setContentNotice(
          `The document was longer than ${MAX_CONTENT.toLocaleString()} characters, so only the first ${MAX_CONTENT.toLocaleString()} were loaded. You can edit the text below.`,
        );
      } else {
        setContent(text);
      }

      setFileInfo({ name: file.name, size: file.size, pages });
      setContentUploadProgress(100);
      setContentUploadStage("complete");
      setContentUploadLabel(
        `Upload & extraction complete · ${text.length.toLocaleString()} chars extracted`,
      );
      if (!title.trim()) {
        setTitle(
          file.name
            .replace(/\.[^.]+$/, "")
            .replace(/[-_]+/g, " ")
            .slice(0, 120),
        );
      }
      clearError("content");
      toast({
        title: "Document extracted",
        description: `${file.name} is ready to review. The extracted text is editable.`,
        variant: "success",
      });
    } catch (error) {
      const errMsg =
        error instanceof Error
          ? error.message
          : "We couldn't read that document. Paste the text instead.";
      setErrors((current) => ({
        ...current,
        file: errMsg,
      }));
      setContentUploadStage("error");
      setContentUploadProgress(100);
      setContentUploadLabel(errMsg);
    } finally {
      setExtracting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    if (extracting || analyzing) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void processFile(file);
  }

  async function handleSubmit() {
    setSubmitError(null);
    if (!validate()) {
      toast({
        title: "Check the highlighted fields",
        description:
          "Add a title and at least 40 characters of content before running the review.",
        variant: "error",
      });
      return;
    }

    setAnalyzing(true);
    setAnalysisStep(0);
    try {
      const review = await createReview({
        title: title.trim(),
        channel,
        content: trimmedContent,
        isPaidPartnership,
        submittedBy: user.name,
        sourceFileName: fileInfo?.name,
        brandKnowledgeText: knowledgeText.trim() || undefined,
        brandKnowledgeFileName: knowledgeFileInfo?.name,
      });
      setAnalysisStep(ANALYSIS_STEPS.length);
      await new Promise((resolve) => window.setTimeout(resolve, 260));
      const open = review.findings.filter(
        (finding) => finding.status === "open",
      ).length;
      toast({
        title: "Review ready",
        description:
          open === 0
            ? "No policy issues were detected. The draft is ready for human approval."
            : `${pluralize(open, "finding")} across ${pluralize(review.knowledgeGaps.length, "knowledge gap")}.`,
        variant: "success",
      });
      router.push(`/reviews/${review.id}`);
    } catch (error) {
      setAnalyzing(false);
      const message =
        error instanceof Error
          ? error.message
          : "The review could not be started. Please try again.";
      setSubmitError(message);
      toast({
        title: "Review could not start",
        description: message,
        variant: "error",
      });
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <DemoBadge />
            <span className="text-[11px] font-medium text-ink-400">
              Step 1 of 2 · Submit
            </span>
          </>
        }
        title="New content review"
        description="Paste copy or upload a supported document. Every finding is linked to an approved brand source, or explicitly marked as a knowledge gap."
        actions={<DemoGuideTrigger />}
      />

      {/* CREATOR ACCESS GATE BANNER */}
      {!user.isApproved && !isManager && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/80 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <LockKeyhole className="h-5 w-5" />
            </span>
            <div>
              <h4 className="text-sm font-bold text-ink-900">
                Database Access Locked — Manager Approval Required
              </h4>
              <p className="text-xs text-ink-600 mt-0.5 leading-relaxed">
                Your account ({user.email}) is currently awaiting authorization from a Brand Governance Manager. You can draft copy, but governance auditing requires manager clearance.
              </p>
            </div>
          </div>
          <Link
            href="/access"
            className="shrink-0 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs px-4 py-2.5 transition shadow-sm"
          >
            Manage Permissions & BrandPIN &rarr;
          </Link>
        </div>
      )}

      <div id="review-form" className="grid scroll-mt-24 gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <Card className="overflow-hidden">
            <CardHeader
              title="Draft details"
              description="Tell us where this content will be published and what should be checked."
              action={
                <span className="inline-flex items-center gap-1 rounded-full border border-line bg-ink-50 px-2 py-1 text-[10px] font-semibold text-ink-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                  Step 1 of 2
                </span>
              }
            />
            <CardBody className="space-y-5">
              {submitError && (
                <InlineAlert variant="danger" title="The review could not start">
                  {submitError}
                </InlineAlert>
              )}

              <Field
                label="Review title"
                htmlFor="review-title"
                required
                error={errors.title}
                hint="A short name the team will see in the review queue."
              >
                <Input
                  ref={titleRef}
                  id="review-title"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    clearError("title");
                  }}
                  onBlur={() => {
                    if (title.trim().length > 0 && title.trim().length < 3) {
                      setErrors((current) => ({
                        ...current,
                        title: "Add a title of at least 3 characters.",
                      }));
                    }
                  }}
                  placeholder="e.g. Glow Renewal Serum — Instagram launch"
                  maxLength={120}
                  aria-invalid={Boolean(errors.title)}
                  aria-describedby={errors.title ? "review-title-error" : "review-title-hint"}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Publishing channel"
                  htmlFor="review-channel"
                  hint="Channel-specific rules, such as #ad placement, will apply."
                >
                  <Select
                    id="review-channel"
                    value={channel}
                    onChange={(event) => setChannel(event.target.value as Channel)}
                  >
                    {CHANNELS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="flex items-end">
                  <Checkbox
                    id="paid-partnership"
                    checked={isPaidPartnership}
                    onChange={setIsPaidPartnership}
                    label="This is a paid partnership"
                    description="Adds a disclosure check for #ad within the first 125 characters."
                    className="w-full"
                  />
                </div>
              </div>

              {/* 1. BRAND KNOWLEDGE REFERENCE (UPLOAD OR PASTE) */}
              <div className="rounded-2xl border border-purple-200 bg-purple-50/40 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label
                      className="flex items-center gap-1.5 text-[13px] font-bold text-purple-950"
                    >
                      <BookOpen className="h-4 w-4 text-purple-600" />
                      1. Brand Knowledge Reference
                      <span className="text-[10px] font-semibold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full ml-1">
                        Two-RAG Grounding Truth
                      </span>
                    </label>
                    <p className="text-[11px] text-purple-700/80 mt-0.5">
                      Upload brand guidelines or paste rules/approved facts to audit this draft against.
                    </p>
                  </div>

                  <div
                    className="inline-flex rounded-lg bg-white/90 border border-purple-200 p-1"
                    role="tablist"
                    aria-label="Brand knowledge input method"
                  >
                    <button
                      type="button"
                      onClick={() => setKnowledgeMode("upload")}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer",
                        knowledgeMode === "upload"
                          ? "bg-purple-600 text-white shadow-sm"
                          : "text-purple-900 hover:bg-purple-50"
                      )}
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      Upload Document
                    </button>
                    <button
                      type="button"
                      onClick={() => setKnowledgeMode("paste")}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer",
                        knowledgeMode === "paste"
                          ? "bg-purple-600 text-white shadow-sm"
                          : "text-purple-900 hover:bg-purple-50"
                      )}
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Paste Rules / Facts
                    </button>
                  </div>
                </div>

                {/* < 5 MB DISCLAIMER FOR BRAND KNOWLEDGE DOCUMENT */}
                <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-[11px] text-amber-900">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                    <span>
                      <strong className="font-semibold">Disclaimer:</strong> Brand knowledge document must be{" "}
                      <strong className="font-bold underline decoration-amber-400">less than 5 MB</strong> (PDF, DOCX, TXT, or Markdown).
                    </span>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] font-semibold text-amber-800">
                    Max: 5.0 MB
                  </span>
                </div>

                {knowledgeMode === "upload" ? (
                  <div className="space-y-2.5">
                    <input
                      ref={knowledgeFileInputRef}
                      type="file"
                      accept=".txt,.md,.docx,.pdf"
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void processKnowledgeFile(file);
                      }}
                    />
                    <div
                      onClick={() => {
                        if (!extractingKnowledge) knowledgeFileInputRef.current?.click();
                      }}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        setKnowledgeDragActive(true);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setKnowledgeDragActive(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        setKnowledgeDragActive(false);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setKnowledgeDragActive(false);
                        if (extractingKnowledge) return;
                        const file = e.dataTransfer.files?.[0];
                        if (file) void processKnowledgeFile(file);
                      }}
                      className={cn(
                        "cursor-pointer rounded-xl border-2 border-dashed p-4 text-center transition",
                        knowledgeDragActive
                          ? "border-purple-500 bg-purple-100/60"
                          : "border-purple-200 bg-white/80 hover:bg-white hover:border-purple-400",
                      )}
                    >
                      {extractingKnowledge ? (
                        <Loader2 className="mx-auto h-7 w-7 animate-spin text-purple-600" />
                      ) : (
                        <CloudUpload className="mx-auto h-7 w-7 text-purple-500" />
                      )}
                      <p className="mt-1.5 text-xs font-semibold text-purple-950">
                        {extractingKnowledge
                          ? "Uploading & extracting brand knowledge document..."
                          : "Click or drag brand document to upload (PDF, DOCX, TXT, MD · Under 5 MB)"}
                      </p>
                      <p className="text-[10px] text-purple-600/80 mt-0.5">
                        Style guides, fact sheets, brand books or disclosure policies · Must be &lt; 5 MB
                      </p>
                    </div>

                    {/* BRAND KNOWLEDGE UPLOAD PROGRESS BAR STATUS */}
                    <div className="rounded-xl border border-purple-200 bg-white p-3 space-y-2 shadow-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <div className="flex items-center gap-2 min-w-0">
                          {knowledgeUploadStage === "uploading" || knowledgeUploadStage === "extracting" ? (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-purple-600" />
                          ) : knowledgeUploadStage === "complete" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          ) : knowledgeUploadStage === "error" ? (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                          ) : (
                            <CloudUpload className="h-3.5 w-3.5 shrink-0 text-purple-500" />
                          )}
                          <span className="font-semibold text-purple-950 truncate">
                            {knowledgeUploadingFile
                              ? `${knowledgeUploadingFile.name} (${formatBytes(knowledgeUploadingFile.size)} / 5.0 MB max)`
                              : "Upload Status: Ready (Document must be < 5 MB)"}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "font-mono text-[11px] font-bold tabular-nums",
                            knowledgeUploadStage === "complete"
                              ? "text-emerald-600"
                              : knowledgeUploadStage === "error"
                                ? "text-rose-600"
                                : "text-purple-700",
                          )}
                        >
                          {knowledgeUploadProgress}%
                        </span>
                      </div>

                      <div
                        className="h-2 w-full overflow-hidden rounded-full bg-purple-100"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={knowledgeUploadProgress}
                        aria-label="Brand knowledge document upload progress"
                      >
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-300 ease-out",
                            knowledgeUploadStage === "complete"
                              ? "bg-emerald-500"
                              : knowledgeUploadStage === "error"
                                ? "bg-rose-500"
                                : "bg-purple-600",
                          )}
                          style={{ width: `${knowledgeUploadProgress}%` }}
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                        <span
                          className={cn(
                            "font-medium",
                            knowledgeUploadStage === "error"
                              ? "text-rose-600"
                              : knowledgeUploadStage === "complete"
                                ? "text-emerald-700"
                                : "text-purple-700/80",
                          )}
                        >
                          {knowledgeUploadLabel ||
                            "Select a PDF, DOCX, TXT, or MD file under 5 MB to start upload."}
                        </span>
                        {knowledgeFileInfo && (
                          <button
                            type="button"
                            onClick={() => {
                              setKnowledgeFileInfo(null);
                              setKnowledgeText("");
                              setKnowledgeUploadingFile(null);
                              setKnowledgeUploadProgress(0);
                              setKnowledgeUploadStage("idle");
                              setKnowledgeUploadLabel("");
                              setKnowledgeError(null);
                            }}
                            className="text-[11px] text-rose-600 hover:underline font-semibold cursor-pointer"
                          >
                            Remove file
                          </button>
                        )}
                      </div>
                    </div>

                    {knowledgeError && (
                      <InlineAlert variant="danger" title="Brand knowledge file not loaded">
                        {knowledgeError}
                      </InlineAlert>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Textarea
                      value={knowledgeText}
                      onChange={(e) => setKnowledgeText(e.target.value)}
                      placeholder="Paste approved brand facts, terminology rules, tone guidelines, or legal disclaimers here..."
                      rows={3}
                      className="border-purple-200 bg-white font-mono text-xs"
                    />
                    <div className="flex items-center justify-between text-[11px] text-purple-700">
                      <span>{knowledgeText.length} characters</span>
                      <button
                        type="button"
                        onClick={() => {
                          setKnowledgeText(
                            `Enterprise Brand Style Guidelines 2026:
- Always capitalize Aurelia Skin brand name.
- Tone must be empowering, calm, clinical, and transparent.
- Never use superlatives like "#1", "miracle", or "revolutionary".
- All clinical trial percentages must cite the official study ID.
- Sponsored posts must include "#ad" or "#sponsored" in the first 125 characters.`
                          );
                          toast({ title: "Default rules loaded", variant: "info" });
                        }}
                        className="font-semibold text-purple-800 hover:underline cursor-pointer"
                      >
                        Load standard brand template
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. CONTENT DOCUMENT TO REVIEW */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="review-content"
                    className="flex items-center gap-1.5 text-[13px] font-bold text-ink-900"
                  >
                    <FileText className="h-4 w-4 text-brand-600" />
                    2. Content Document to Review & Audit
                    <span className="text-rose-500" aria-hidden="true">
                      *
                    </span>
                  </label>
                  <div
                    className="inline-flex rounded-lg bg-ink-100/80 p-1"
                    role="tablist"
                    aria-label="Content input method"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === "paste"}
                      onClick={() => setMode("paste")}
                      disabled={extracting}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60",
                        mode === "paste"
                          ? "bg-white text-ink-900 shadow-sm"
                          : "text-ink-500 hover:text-ink-800",
                      )}
                    >
                      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                      Paste text
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mode === "upload"}
                      onClick={() => setMode("upload")}
                      disabled={extracting}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60",
                        mode === "upload"
                          ? "bg-white text-ink-900 shadow-sm"
                          : "text-ink-500 hover:text-ink-800",
                      )}
                    >
                      <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                      Upload document
                    </button>
                  </div>
                </div>

                {/* < 5 MB DISCLAIMER FOR CONTENT DOCUMENT */}
                <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-[11px] text-amber-900">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                    <span>
                      <strong className="font-semibold">Disclaimer:</strong> Content document to review must be{" "}
                      <strong className="font-bold underline decoration-amber-400">less than 5 MB</strong> (PDF, DOCX, TXT, or Markdown).
                    </span>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] font-semibold text-amber-800">
                    Max: 5.0 MB
                  </span>
                </div>

                {mode === "upload" && (
                  <div className="mb-3 space-y-2.5">
                    <input
                      ref={fileInputRef}
                      id="document-upload"
                      type="file"
                      accept=".txt,.md,.docx,.pdf,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="sr-only"
                      onChange={onFileChange}
                    />

                    {fileInfo ? (
                      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-mint-200 bg-mint-50/50 p-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-mint-600 shadow-sm">
                          <FileCheck2 className="h-[18px] w-[18px]" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold text-ink-900">
                            {fileInfo.name}
                          </p>
                          <p className="mt-0.5 text-[10px] text-ink-500">
                            {formatBytes(fileInfo.size)} (under 5 MB limit)
                            {typeof fileInfo.pages === "number" &&
                              ` · ${pluralize(fileInfo.pages, "page")}`}{" "}
                            · text extracted
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={extracting}
                          >
                            Replace
                          </Button>
                          <button
                            type="button"
                            onClick={() => {
                              setFileInfo(null);
                              setContentUploadingFile(null);
                              setContentUploadProgress(0);
                              setContentUploadStage("idle");
                              setContentUploadLabel("");
                            }}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-400 transition hover:bg-white hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                            aria-label="Remove uploaded file"
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onDragEnter={(event) => {
                          event.preventDefault();
                          setDragActive(true);
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setDragActive(true);
                        }}
                        onDragLeave={(event) => {
                          event.preventDefault();
                          setDragActive(false);
                        }}
                        onDrop={onDrop}
                        className={cn(
                          "flex min-h-[150px] flex-col items-center justify-center rounded-xl border-2 border-dashed px-5 py-5 text-center transition",
                          dragActive
                            ? "border-brand-400 bg-brand-50/70"
                            : "border-ink-200 bg-ink-50/40 hover:border-brand-300 hover:bg-brand-50/30",
                        )}
                      >
                        {extracting ? (
                          <>
                            <Loader2
                              className="h-7 w-7 animate-spin text-brand-600"
                              aria-hidden="true"
                            />
                            <p className="mt-3 text-[13px] font-semibold text-ink-800">
                              Uploading & extracting text…
                            </p>
                            <p className="mt-1 text-[11px] text-ink-400">
                              Reading the document locally. Large PDFs (up to 5 MB) may take a moment.
                            </p>
                          </>
                        ) : (
                          <>
                            <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-white text-brand-600 shadow-sm">
                              <CloudUpload className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <p className="mt-3 text-[13px] font-semibold text-ink-800">
                              Drop a document here
                            </p>
                            <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-ink-400">
                              PDF, DOCX, TXT or Markdown · <strong className="font-semibold text-ink-700">must be less than 5 MB</strong>. We extract
                              selectable text; the original file is not stored.
                            </p>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="mt-3"
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                              Choose file (&lt; 5 MB)
                            </Button>
                          </>
                        )}
                      </div>
                    )}

                    {/* CONTENT DOCUMENT UPLOAD PROGRESS BAR STATUS */}
                    <div className="rounded-xl border border-line bg-white p-3 space-y-2 shadow-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <div className="flex items-center gap-2 min-w-0">
                          {contentUploadStage === "uploading" || contentUploadStage === "extracting" ? (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-600" />
                          ) : contentUploadStage === "complete" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          ) : contentUploadStage === "error" ? (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                          ) : (
                            <CloudUpload className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                          )}
                          <span className="font-semibold text-ink-900 truncate">
                            {contentUploadingFile
                              ? `${contentUploadingFile.name} (${formatBytes(contentUploadingFile.size)} / 5.0 MB max)`
                              : "Upload Status: Ready (Document must be < 5 MB)"}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "font-mono text-[11px] font-bold tabular-nums",
                            contentUploadStage === "complete"
                              ? "text-emerald-600"
                              : contentUploadStage === "error"
                                ? "text-rose-600"
                                : "text-brand-600",
                          )}
                        >
                          {contentUploadProgress}%
                        </span>
                      </div>

                      <div
                        className="h-2 w-full overflow-hidden rounded-full bg-ink-100"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={contentUploadProgress}
                        aria-label="Content document upload progress"
                      >
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-300 ease-out",
                            contentUploadStage === "complete"
                              ? "bg-emerald-500"
                              : contentUploadStage === "error"
                                ? "bg-rose-500"
                                : "bg-brand-600",
                          )}
                          style={{ width: `${contentUploadProgress}%` }}
                        />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                        <span
                          className={cn(
                            "font-medium",
                            contentUploadStage === "error"
                              ? "text-rose-600"
                              : contentUploadStage === "complete"
                                ? "text-emerald-700"
                                : "text-ink-500",
                          )}
                        >
                          {contentUploadLabel ||
                            "Select a PDF, DOCX, TXT, or MD file under 5 MB to start upload."}
                        </span>
                        <span className="text-ink-400">
                          Limit: &lt; 5 MB
                        </span>
                      </div>
                    </div>

                    {errors.file && (
                      <InlineAlert variant="danger" title="File not loaded">
                        {errors.file}
                      </InlineAlert>
                    )}

                    <p className="flex items-center gap-1.5 text-[10px] text-ink-400">
                      <Info className="h-3 w-3" aria-hidden="true" />
                      Extracted text is editable below. Maximum file size is 5 MB.
                    </p>
                  </div>
                )}

                <Textarea
                  ref={contentRef}
                  id="review-content"
                  value={content}
                  onChange={(event) => {
                    setContent(event.target.value);
                    clearError("content");
                    if (contentNotice) setContentNotice(null);
                  }}
                  placeholder={
                    mode === "upload"
                      ? "Upload a document above, or paste the extracted copy here…"
                      : "Paste the caption, email, product page copy or brief you want reviewed…"
                  }
                  className="min-h-[260px]"
                  maxLength={MAX_CONTENT}
                  aria-invalid={Boolean(errors.content)}
                  aria-describedby={errors.content ? "review-content-error" : "review-content-help"}
                />
                <div className="mt-1.5 flex flex-wrap items-start justify-between gap-2">
                  <p
                    id="review-content-help"
                    className={cn(
                      "text-[11px] leading-relaxed",
                      errors.content ? "font-medium text-rose-600" : "text-ink-400",
                    )}
                  >
                    {errors.content ??
                      "Minimum 40 characters. The engine checks the words you submit, not external visuals."}
                  </p>
                  <p className="shrink-0 text-[10px] tabular-nums text-ink-400">
                    {charCount.toLocaleString()} / {MAX_CONTENT.toLocaleString()}{" "}
                    characters · {pluralize(wordCount, "word")}
                  </p>
                </div>
                {contentNotice && (
                  <InlineAlert variant="warning" className="mt-3">
                    {contentNotice}
                  </InlineAlert>
                )}
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-1.5 text-[10px] leading-relaxed text-ink-400">
                  <LockKeyhole className="h-3 w-3 shrink-0" aria-hidden="true" />
                  Demo data is saved in this browser only. No live AI provider is
                  called.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link
                    href="/reviews"
                    className={buttonStyles({ variant: "secondary" })}
                  >
                    Cancel
                  </Link>
                  <Button
                    onClick={() => void handleSubmit()}
                    disabled={extracting || analyzing}
                    className="min-w-[190px]"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    Run compliance review
                  </Button>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-4 xl:col-span-4" aria-label="Review information">
          <Card className="overflow-hidden">
            <CardHeader
              title="What we check"
              description="10 approved rules applied to this draft."
              icon={
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                </span>
              }
            />
            <div className="divide-y divide-line">
              {CHECKS.map((check) => {
                const Icon = check.icon;
                return (
                  <div key={check.category} className="flex items-start gap-3 px-5 py-3">
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                        check.tone,
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-ink-800">
                        {check.category}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-relaxed text-ink-400">
                        {check.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 border-t border-line bg-ink-50/50 px-5 py-3 text-[10px] text-ink-400">
              <BookOpen className="h-3 w-3" aria-hidden="true" />
              Aurelia Skin knowledge v2.4 · updated 12 Oct 2026
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="What happens next" />
            <CardBody className="space-y-4">
              {[
                {
                  title: "Findings are cited",
                  text: "Each issue links to the exact approved passage, or becomes a knowledge gap.",
                },
                {
                  title: "You stay in control",
                  text: "Accept, edit, dismiss or request changes. Nothing publishes automatically.",
                },
                {
                  title: "A named human decides",
                  text: "The approval screen records your checklist and sign-off in the version history.",
                },
              ].map((step, index) => (
                <div key={step.title} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line bg-white text-[10px] font-bold text-ink-500">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-[12px] font-semibold text-ink-800">
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-ink-400">
                      {step.text}
                    </p>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>

          <div className="relative overflow-hidden rounded-2xl bg-ink-950 p-5 text-white shadow-lift">
            <div className="demo-grid absolute inset-0 opacity-50" aria-hidden="true" />
            <div
              className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-brand-500/25 blur-2xl"
              aria-hidden="true"
            />
            <div className="relative">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-mint-300/20 bg-mint-300/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-mint-200">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Local demo engine
              </span>
              <p className="mt-3 text-[13px] font-semibold">
                No API key, no external AI call
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-white/50">
                The mock engine uses deterministic claim patterns and the
                synthetic Aurelia knowledge base. It demonstrates the workflow,
                not production model accuracy.
              </p>
              <DemoGuideTrigger
                variant="secondary"
                size="sm"
                className="mt-3 border-white/15 bg-white/[0.06] text-white shadow-none hover:border-white/25 hover:bg-white/[0.11]"
                label="Demo walkthrough"
              />
            </div>
          </div>
        </aside>
      </div>

      <AnalysisDialog open={analyzing} step={analysisStep} title={title} />
    </div>
  );
}
