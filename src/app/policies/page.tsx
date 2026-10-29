"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Accessibility,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Compass,
  FileText,
  FlaskConical,
  Layers,
  Megaphone,
  MessageCircle,
  Plus,
  Scale,
  Search,
  ShieldCheck,
  Sparkles,
  CloudUpload,
  FileCheck2,
  Paperclip,
  UploadCloud,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, SeverityBadge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/providers/toast-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, pluralize } from "@/lib/utils";
import type { FindingCategory, Severity } from "@/lib/types";

const CATEGORY_ICONS = {
  Claims: FlaskConical,
  Disclosure: Megaphone,
  Terminology: BookOpen,
  Tone: MessageCircle,
  Regulatory: Scale,
  Accessibility: Accessibility,
} as const;

type Tab = "rules" | "sources" | "facts";
type CategoryFilter = FindingCategory | "all";

const CATEGORIES: FindingCategory[] = [
  "Claims",
  "Disclosure",
  "Terminology",
  "Tone",
  "Regulatory",
  "Accessibility",
];

interface IngestedDocumentSummary {
  document_name: string;
  doc_type: "style_rule" | "approved_fact";
  version: string;
  department: string;
  confidentiality: string;
  chunks_count: number;
}

interface IngestedChunkRecord {
  chunk_id: string;
  document_name: string;
  doc_type: "style_rule" | "approved_fact";
  text: string;
  section: string;
  page?: number | null;
  version: string;
  department: string;
}

function inferCategoryFromText(text: string): FindingCategory {
  const lower = text.toLowerCase();
  if (lower.includes("#ad") || lower.includes("disclos") || lower.includes("sponsor")) {
    return "Disclosure";
  }
  if (
    lower.includes("claim") ||
    lower.includes("study") ||
    lower.includes("cure") ||
    lower.includes("100%") ||
    lower.includes("proven")
  ) {
    return "Claims";
  }
  if (lower.includes("tone") || lower.includes("voice") || lower.includes("warm")) {
    return "Tone";
  }
  if (lower.includes("alt text") || lower.includes("emoji") || lower.includes("accessib")) {
    return "Accessibility";
  }
  if (lower.includes("legal") || lower.includes("regulat") || lower.includes("competitor")) {
    return "Regulatory";
  }
  return "Terminology";
}

function inferSeverityFromText(text: string): Severity {
  const lower = text.toLowerCase();
  if (lower.includes("never") || lower.includes("prohibited") || lower.includes("critical") || lower.includes("must not")) {
    return "critical";
  }
  if (lower.includes("must") || lower.includes("required") || lower.includes("always")) {
    return "high";
  }
  return "medium";
}

export default function PoliciesPage() {
  const [tab, setTab] = useState<Tab>("rules");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");

  const { toast } = useToast();
  const { user } = useAuth();

  const [documents, setDocuments] = useState<IngestedDocumentSummary[]>([]);
  const [chunks, setChunks] = useState<IngestedChunkRecord[]>([]);
  const [loadingKnowledge, setLoadingKnowledge] = useState(true);

  const [ingestModalOpen, setIngestModalOpen] = useState(false);
  const [ingestMode, setIngestMode] = useState<"upload" | "paste">("upload");
  const [ingestTitle, setIngestTitle] = useState("");
  const [ingestText, setIngestText] = useState("");
  const [ingestDocType, setIngestDocType] = useState<"style_rule" | "approved_fact">("style_rule");
  const [ingestDepartment, setIngestDepartment] = useState("marketing");
  const [ingestFileName, setIngestFileName] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchBrandKnowledge = useCallback(async () => {
    setLoadingKnowledge(true);
    try {
      const res = await fetch("/api/ingest", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setDocuments(Array.isArray(data.documents) ? data.documents : []);
        setChunks(Array.isArray(data.chunks) ? data.chunks : []);
      }
    } catch (e) {
      console.error("Failed to load brand knowledge:", e);
    } finally {
      setLoadingKnowledge(false);
    }
  }, []);

  useEffect(() => {
    fetchBrandKnowledge();
  }, [fetchBrandKnowledge]);

  async function processIngestFile(file: File) {
    setExtracting(true);
    try {
      const data = new FormData();
      data.append("file", file);
      const res = await fetch("/api/extract", { method: "POST", body: data });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Extraction failed" }));
        throw new Error(err.error || "Extraction failed");
      }
      const json = await res.json();
      setIngestText(json.text);
      setIngestFileName(file.name);
      if (!ingestTitle) setIngestTitle(file.name.replace(/\.[^/.]+$/, ""));
      toast({
        title: "File extracted",
        description: `Extracted ${json.text.length.toLocaleString()} characters from ${file.name}.`,
        variant: "success",
      });
    } catch (e: any) {
      toast({ title: "Failed to read file", description: e.message, variant: "error" });
    } finally {
      setExtracting(false);
    }
  }

  async function handleIngestSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (ingestText.trim().length < 20) {
      toast({
        title: "Text required",
        description: "Add at least 20 characters of brand knowledge.",
        variant: "error",
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_name: ingestFileName || `${ingestTitle || "Brand_Policy"}.md`,
          text: ingestText.trim(),
          doc_type: ingestDocType,
          department: ingestDepartment,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Ingestion failed" }));
        throw new Error(err.error || "Ingestion failed");
      }

      const json = await res.json();
      toast({
        title: "Brand Knowledge Uploaded",
        description: `Indexed ${json.chunks_ingested} passage(s) from "${json.document_name}".`,
        variant: "success",
      });
      setIngestModalOpen(false);
      setIngestText("");
      setIngestTitle("");
      setIngestFileName("");
      await fetchBrandKnowledge();
    } catch (e: any) {
      toast({ title: "Ingestion failed", description: e.message, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteDocument(documentName: string) {
    try {
      const res = await fetch(
        `/api/ingest?document_name=${encodeURIComponent(documentName)}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        toast({
          title: "Document Removed",
          description: `Removed "${documentName}" from Brand Knowledge.`,
          variant: "info",
        });
        await fetchBrandKnowledge();
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    }
  }

  async function handleClearAllKnowledge() {
    try {
      const res = await fetch("/api/ingest?clear_all=true", { method: "DELETE" });
      if (res.ok) {
        toast({
          title: "Brand Knowledge Cleared",
          description: "All uploaded rules, sources, and facts have been cleared.",
          variant: "info",
        });
        await fetchBrandKnowledge();
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "error" });
    }
  }

  const dynamicRules = useMemo(() => {
    const ruleChunks = chunks.filter((c) => c.doc_type === "style_rule" || !c.doc_type);
    return ruleChunks.map((chunk, idx) => {
      const cat = inferCategoryFromText(chunk.text);
      const firstLine = chunk.text.split("\n")[0].replace(/^[#\-*\d.)\s]+/, "").trim();
      const title =
        firstLine.length > 8 && firstLine.length <= 95
          ? firstLine
          : `${chunk.document_name} — ${chunk.section || `Rule ${idx + 1}`}`;
      return {
        id: chunk.chunk_id,
        code: `RULE-${String(idx + 1).padStart(2, "0")}`,
        title,
        category: cat,
        defaultSeverity: inferSeverityFromText(chunk.text),
        description: chunk.text,
        requirement: chunk.text,
        documentName: chunk.document_name,
        section: chunk.section || `Section ${idx + 1}`,
        version: chunk.version || "1.0",
        department: chunk.department || "marketing",
      };
    });
  }, [chunks]);

  const dynamicFacts = useMemo(() => {
    return chunks
      .filter((c) => c.doc_type === "approved_fact")
      .map((chunk, idx) => ({
        id: chunk.chunk_id,
        product: chunk.document_name.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " "),
        claim: chunk.text,
        studyId: `FACT-${String(idx + 1).padStart(2, "0")}`,
        documentName: chunk.document_name,
        section: chunk.section || `Fact ${idx + 1}`,
      }));
  }, [chunks]);

  const filteredRules = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return dynamicRules.filter((rule) => {
      if (category !== "all" && rule.category !== category) return false;
      if (!normalized) return true;
      const haystack = [
        rule.code,
        rule.title,
        rule.category,
        rule.description,
        rule.documentName,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [dynamicRules, query, category]);

  const tabs: Array<{ value: Tab; label: string; count: number }> = [
    { value: "rules", label: "Rule library", count: dynamicRules.length },
    { value: "sources", label: "Knowledge sources", count: documents.length },
    { value: "facts", label: "Approved facts", count: dynamicFacts.length },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-1 text-[11px] font-semibold text-purple-700 border border-purple-200">
            <BookOpen className="h-3.5 w-3.5" />
            {user.brand_name || "Workspace"} · Live Brand Knowledge Repository
          </span>
        }
        title="Brand knowledge"
        description="Upload your brand guidelines, compliance policies, and approved product facts. Every content review and lobby room audits directly against the documents uploaded here."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              onClick={() => setIngestModalOpen(true)}
              className="flex items-center gap-1.5"
            >
              <UploadCloud className="h-4 w-4" />
              Upload Brand Document
            </Button>
            {documents.length > 0 && (
              <Button
                variant="secondary"
                onClick={handleClearAllKnowledge}
                className="flex items-center gap-1.5 text-rose-700 hover:text-rose-800"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear All
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={fetchBrandKnowledge}
              disabled={loadingKnowledge}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loadingKnowledge && "animate-spin")} />
            </Button>
            <Link href="/submit" className={buttonStyles({ variant: "secondary" })}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Check content
            </Link>
          </div>
        }
      />

      <section
        aria-label="Knowledge summary"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {[
          {
            label: "Uploaded sources",
            value: documents.length,
            note: documents.length > 0 ? "Active in repository" : "Upload a document to begin",
            icon: Layers,
            tone: "bg-brand-50 text-brand-600",
          },
          {
            label: "Policy rules",
            value: dynamicRules.length,
            note: "Extracted from style guides",
            icon: ShieldCheck,
            tone: "bg-emerald-50 text-emerald-600",
          },
          {
            label: "Approved facts",
            value: dynamicFacts.length,
            note: "Verified product claims",
            icon: BadgeCheck,
            tone: "bg-violet-50 text-violet-600",
          },
          {
            label: "Total indexed chunks",
            value: chunks.length,
            note: "Used across Reviews & Lobby",
            icon: FileText,
            tone: "bg-amber-50 text-amber-700",
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card
              key={item.label}
              className="flex items-start gap-3 p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift"
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                  item.tone
                )}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[22px] font-semibold leading-none tracking-tight tabular-nums text-ink-950">
                  {item.value}
                </p>
                <p className="mt-1.5 text-[12px] font-medium text-ink-700">
                  {item.label}
                </p>
                <p className="mt-0.5 text-[10px] text-ink-400">{item.note}</p>
              </div>
            </Card>
          );
        })}
      </section>

      <Card className="overflow-hidden">
        <div
          className="scrollbar-slim flex gap-1 overflow-x-auto border-b border-line p-3"
          role="tablist"
          aria-label="Knowledge library sections"
        >
          {tabs.map((item) => {
            const active = tab === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.value)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                  active
                    ? "bg-ink-900 text-white shadow-sm"
                    : "text-ink-500 hover:bg-ink-100 hover:text-ink-800"
                )}
              >
                {item.label}
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] tabular-nums",
                    active
                      ? "bg-white/15 text-white/80"
                      : "bg-ink-100 text-ink-400"
                  )}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>

        {tab === "rules" && (
          <>
            <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search uploaded rules or documents…"
                  aria-label="Search policy rules"
                  className="h-9 w-full rounded-lg border border-line bg-white pr-3 text-xs text-ink-900 shadow-sm outline-none transition placeholder:text-ink-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 sm:w-[280px]"
                  style={{ paddingLeft: "2.15rem" }}
                />
              </div>
              <p className="text-[11px] text-ink-400">
                {filteredRules.length} of {dynamicRules.length} rules
              </p>
            </div>

            <div className="scrollbar-slim flex gap-1.5 overflow-x-auto border-b border-line bg-ink-50/35 px-4 py-2.5">
              <button
                type="button"
                onClick={() => setCategory("all")}
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                  category === "all"
                    ? "border-ink-900 bg-ink-900 text-white"
                    : "border-line bg-white text-ink-500 hover:border-ink-200 hover:text-ink-800"
                )}
              >
                All categories
              </button>
              {CATEGORIES.map((item) => {
                const active = category === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(item)}
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                      active
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-line bg-white text-ink-500 hover:border-brand-200 hover:text-brand-700"
                    )}
                  >
                    {item}
                  </button>
                );
              })}
            </div>

            {dynamicRules.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={UploadCloud}
                  title="No Brand Knowledge rules uploaded yet"
                  description="Upload a brand style guide, policy document, or paste your rules to populate the Brand Knowledge repository across the app."
                  compact
                  action={
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setIngestDocType("style_rule");
                        setIngestModalOpen(true);
                      }}
                    >
                      <UploadCloud className="h-3.5 w-3.5" />
                      Upload Brand Document
                    </Button>
                  }
                />
              </div>
            ) : filteredRules.length === 0 ? (
              <div className="p-5 sm:p-6">
                <EmptyState
                  icon={Search}
                  title="No rules match that search"
                  description="Try a different keyword or category filter."
                  compact
                  action={
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setQuery("");
                        setCategory("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="divide-y divide-line">
                {filteredRules.map((rule) => {
                  const Icon = CATEGORY_ICONS[rule.category];
                  return (
                    <details key={rule.id} className="group">
                      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-4 transition hover:bg-ink-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:px-5 [&::-webkit-details-marker]:hidden">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-50 text-ink-500">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge className="border-line bg-ink-50 font-mono text-[10px] tracking-normal text-ink-500">
                              {rule.code}
                            </Badge>
                            <span className="text-[10px] font-medium text-ink-400">
                              {rule.category} · {rule.documentName}
                            </span>
                          </div>
                          <p className="mt-1 text-[13px] font-semibold leading-snug text-ink-900">
                            {rule.title}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-ink-400 sm:line-clamp-1">
                            {rule.description}
                          </p>
                        </div>
                        <div className="hidden shrink-0 items-center gap-2 sm:flex">
                          <SeverityBadge severity={rule.defaultSeverity} />
                        </div>
                        <ChevronDown
                          className="mt-1 h-4 w-4 shrink-0 text-ink-300 transition group-open:rotate-180"
                          aria-hidden="true"
                        />
                      </summary>
                      <div className="border-t border-line bg-ink-50/25 px-4 py-4 sm:px-5 sm:pl-16">
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
                          <div className="space-y-3">
                            <div>
                              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400">
                                Uploaded Passage / Rule
                              </p>
                              <p className="mt-1 text-[12px] leading-relaxed text-ink-800 whitespace-pre-wrap">
                                {rule.requirement}
                              </p>
                            </div>
                          </div>

                          <div className="rounded-xl border border-line bg-white p-3">
                            <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400">
                              <ShieldCheck className="h-3 w-3 text-mint-600" aria-hidden="true" />
                              Source Document
                            </p>
                            <p className="mt-1.5 text-[11px] font-semibold text-ink-800">
                              {rule.documentName}
                            </p>
                            <p className="mt-0.5 text-[10px] text-ink-400">
                              {rule.section} · v{rule.version} · {rule.department}
                            </p>
                          </div>
                        </div>
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === "sources" && (
          <div className="p-4 sm:p-5">
            {documents.length === 0 ? (
              <EmptyState
                icon={Layers}
                title="No Knowledge Sources uploaded"
                description="Upload a PDF, DOCX, TXT, or Markdown brand document to add it as an authoritative source."
                compact
                action={
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => setIngestModalOpen(true)}
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    Upload Brand Document
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {documents.map((doc) => (
                  <article
                    key={doc.document_name}
                    className="rounded-xl border border-line bg-white p-4 transition hover:border-ink-200 hover:shadow-card flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                          <Compass className="h-[18px] w-[18px]" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge className="border-line bg-ink-50 text-ink-600 normal-case tracking-normal">
                              {doc.doc_type === "approved_fact" ? "Fact sheet" : "Policy / Style Guide"}
                            </Badge>
                            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 normal-case tracking-normal">
                              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                              v{doc.version}
                            </Badge>
                          </div>
                          <h3 className="mt-1.5 text-[13px] font-semibold leading-snug text-ink-900 truncate">
                            {doc.document_name}
                          </h3>
                          <p className="mt-1 text-[11px] text-ink-500">
                            Department: {doc.department} · {pluralize(doc.chunks_count, "passage")} indexed
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteDocument(doc.document_name)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 transition shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "facts" && (
          <div className="space-y-3 p-4 sm:p-5">
            {dynamicFacts.length === 0 ? (
              <EmptyState
                icon={BadgeCheck}
                title="No Approved Facts uploaded yet"
                description="Upload or paste verified product claims and select 'Approved Product Fact / Claim' as the Knowledge Type."
                compact
                action={
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setIngestDocType("approved_fact");
                      setIngestModalOpen(true);
                    }}
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    Add Approved Product Facts
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {dynamicFacts.map((fact) => (
                  <article
                    key={fact.id}
                    className="rounded-xl border border-line bg-white p-4"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge className="border-line bg-ink-50 text-ink-600 normal-case tracking-normal">
                        {fact.product}
                      </Badge>
                      <Badge className="border-violet-200 bg-violet-50 font-mono text-[10px] tracking-normal text-violet-700">
                        {fact.studyId}
                      </Badge>
                    </div>
                    <p className="mt-2.5 text-[12px] leading-relaxed text-ink-700 whitespace-pre-wrap">
                      “{fact.claim}”
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2.5 text-[10px] text-ink-400">
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2
                          className="h-3 w-3 text-mint-600"
                          aria-hidden="true"
                        />
                        Source: {fact.documentName}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Modal
        open={ingestModalOpen}
        onClose={() => setIngestModalOpen(false)}
        title="Upload or Paste Brand Knowledge"
        description="Index custom brand policies, style guides, or approved product facts into the Two-RAG vector repository."
        size="lg"
      >
        <form onSubmit={handleIngestSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-800">
                Document Title
              </label>
              <input
                type="text"
                placeholder="e.g., Brand_Style_Guide"
                value={ingestTitle}
                onChange={(e) => setIngestTitle(e.target.value)}
                className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-800">
                Knowledge Type
              </label>
              <select
                value={ingestDocType}
                onChange={(e) => setIngestDocType(e.target.value as "style_rule" | "approved_fact")}
                className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="style_rule">Style Guideline / Policy Rule</option>
                <option value="approved_fact">Approved Product Fact / Claim</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-800">
                Department
              </label>
              <select
                value={ingestDepartment}
                onChange={(e) => setIngestDepartment(e.target.value)}
                className="w-full rounded-lg border border-line px-3 py-2 text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="marketing">Marketing</option>
                <option value="sales">Sales</option>
                <option value="legal">Legal &amp; Governance</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between border-b border-line pb-2">
            <span className="text-xs font-semibold text-ink-800">Input Method</span>
            <div className="inline-flex rounded-lg bg-ink-100 p-1">
              <button
                type="button"
                onClick={() => setIngestMode("upload")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition",
                  ingestMode === "upload"
                    ? "bg-white text-ink-900 shadow-sm"
                    : "text-ink-500 hover:text-ink-800"
                )}
              >
                <Paperclip className="h-3.5 w-3.5" />
                Upload File
              </button>
              <button
                type="button"
                onClick={() => setIngestMode("paste")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition",
                  ingestMode === "paste"
                    ? "bg-white text-ink-900 shadow-sm"
                    : "text-ink-500 hover:text-ink-800"
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                Paste Text
              </button>
            </div>
          </div>

          {ingestMode === "upload" ? (
            <div className="space-y-2.5">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-purple-200 bg-purple-50/30 p-6 text-center transition hover:border-purple-400 hover:bg-purple-50/60">
                <CloudUpload className="h-8 w-8 text-purple-600" />
                <span className="mt-2 text-xs font-semibold text-ink-900">
                  {extracting ? "Extracting document..." : "Click to upload brand document (PDF, DOCX, TXT, MD)"}
                </span>
                <span className="mt-0.5 text-[11px] text-ink-400">
                  Automatically parsed and indexed across Brand Knowledge, Reviews &amp; Lobby
                </span>
                <input
                  type="file"
                  accept=".txt,.md,.docx,.pdf"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void processIngestFile(file);
                  }}
                />
              </label>

              {ingestFileName && (
                <div className="flex items-center justify-between rounded-xl border border-purple-200 bg-purple-50/50 p-3 text-xs">
                  <div className="flex items-center gap-2 font-medium text-purple-950">
                    <FileCheck2 className="h-4 w-4 text-purple-600" />
                    <span>{ingestFileName} ({ingestText.length.toLocaleString()} chars extracted)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIngestFileName("");
                      setIngestText("");
                    }}
                    className="font-semibold text-rose-600 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-800">
              Brand Knowledge Content {ingestFileName ? "(Extracted & Editable)" : ""}
            </label>
            <textarea
              rows={5}
              required
              value={ingestText}
              onChange={(e) => setIngestText(e.target.value)}
              placeholder="Paste brand tone guidelines, terminology rules, or verified product facts here..."
              className="w-full rounded-xl border border-line p-3 font-mono text-xs text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIngestModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting || extracting}>
              {submitting ? "Ingesting & Embedding..." : "Save to Brand Knowledge"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
