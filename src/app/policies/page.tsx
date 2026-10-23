"use client";

import { useMemo, useState } from "react";
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
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, DemoBadge, SeverityBadge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  approvedFacts,
  knowledgeSources,
  policyRules,
  sourceSnippets,
  workspace,
} from "@/lib/mock/policy-data";
import { formatDate } from "@/lib/format";
import { cn, pluralize } from "@/lib/utils";
import type { FindingCategory } from "@/lib/types";

const CATEGORY_ICONS = {
  Claims: FlaskConical,
  Disclosure: Megaphone,
  Terminology: BookOpen,
  Tone: MessageCircle,
  Regulatory: Scale,
  Accessibility: Accessibility,
} as const;

const SOURCE_ICONS = {
  Policy: ShieldCheck,
  Playbook: Compass,
  "Fact sheet": FlaskConical,
  Guide: BookOpen,
} as const;

const SOURCE_TONES = {
  Policy: "bg-brand-50 text-brand-600",
  Playbook: "bg-amber-50 text-amber-700",
  "Fact sheet": "bg-violet-50 text-violet-600",
  Guide: "bg-sky-50 text-sky-600",
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

export default function PoliciesPage() {
  const [tab, setTab] = useState<Tab>("rules");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");

  const sourceMap = useMemo(
    () => new Map(knowledgeSources.map((source) => [source.id, source])),
    [],
  );

  const rulesBySource = useMemo(() => {
    const counts = new Map<string, number>();
    policyRules.forEach((rule) => {
      counts.set(rule.sourceId, (counts.get(rule.sourceId) ?? 0) + 1);
    });
    return counts;
  }, []);

  const filteredRules = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return policyRules.filter((rule) => {
      if (category !== "all" && rule.category !== category) return false;
      if (!normalized) return true;
      const haystack = [
        rule.code,
        rule.title,
        rule.category,
        rule.description,
        rule.requirement,
        rule.approvedExample,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [query, category]);

  const tabs: Array<{ value: Tab; label: string; count: number }> = [
    { value: "rules", label: "Rule library", count: policyRules.length },
    { value: "sources", label: "Knowledge sources", count: knowledgeSources.length },
    { value: "facts", label: "Approved facts", count: approvedFacts.length },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <>
            <DemoBadge />
            <span className="text-[11px] font-medium text-ink-400">
              Knowledge {workspace.knowledgeVersion} · updated{" "}
              {formatDate(workspace.knowledgeUpdatedAt)}
            </span>
          </>
        }
        title="Brand knowledge"
        description="The approved rules, sources and facts behind every finding. If the library has no answer, BrandLens says so instead of guessing."
        actions={
          <>
            <Link href="/insights" className={buttonStyles({ variant: "secondary" })}>
              View insights
            </Link>
            <Link href="/submit" className={buttonStyles({ variant: "primary" })}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Check content
            </Link>
          </>
        }
      />

      <section
        aria-label="Knowledge summary"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {[
          {
            label: "Approved sources",
            value: knowledgeSources.length,
            note: "All currently in force",
            icon: Layers,
            tone: "bg-brand-50 text-brand-600",
          },
          {
            label: "Policy rules",
            value: policyRules.length,
            note: "Applied on every review",
            icon: ShieldCheck,
            tone: "bg-emerald-50 text-emerald-600",
          },
          {
            label: "Approved facts",
            value: approvedFacts.length,
            note: "Study-backed product wording",
            icon: BadgeCheck,
            tone: "bg-violet-50 text-violet-600",
          },
          {
            label: "Source coverage",
            value: "100%",
            note: "Every rule cites a source",
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
                  item.tone,
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
                    : "text-ink-500 hover:bg-ink-100 hover:text-ink-800",
                )}
              >
                {item.label}
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] tabular-nums",
                    active
                      ? "bg-white/15 text-white/80"
                      : "bg-ink-100 text-ink-400",
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
                  placeholder="Search rules, codes or examples…"
                  aria-label="Search policy rules"
                  className="h-9 w-full rounded-lg border border-line bg-white pr-3 text-xs text-ink-900 shadow-sm outline-none transition placeholder:text-ink-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 sm:w-[280px]"
                  style={{ paddingLeft: "2.15rem" }}
                />
              </div>
              <p className="text-[11px] text-ink-400">
                {filteredRules.length} of {policyRules.length} rules
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
                    : "border-line bg-white text-ink-500 hover:border-ink-200 hover:text-ink-800",
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
                        : "border-line bg-white text-ink-500 hover:border-brand-200 hover:text-brand-700",
                    )}
                  >
                    {item}
                  </button>
                );
              })}
            </div>

            {filteredRules.length === 0 ? (
              <div className="p-5 sm:p-6">
                <EmptyState
                  icon={Search}
                  title="No rules match that search"
                  description="Try a different code, category or plain-language phrase."
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
                  const source = sourceMap.get(rule.sourceId);
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
                              {rule.category}
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
                                Requirement
                              </p>
                              <p className="mt-1 text-[12px] leading-relaxed text-ink-700">
                                {rule.requirement}
                              </p>
                            </div>
                            <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                              <p className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                Approved example
                              </p>
                              <p className="mt-1 text-[11px] leading-relaxed text-emerald-950">
                                “{rule.approvedExample}”
                              </p>
                            </div>
                          </div>

                          <div className="rounded-xl border border-line bg-white p-3">
                            <p className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink-400">
                              <ShieldCheck className="h-3 w-3 text-mint-600" aria-hidden="true" />
                              Cited source
                            </p>
                            <p className="mt-1.5 text-[11px] font-semibold text-ink-800">
                              {source?.title ?? "Approved guidance"}
                            </p>
                            <p className="mt-0.5 text-[10px] text-ink-400">
                              v{source?.version} · {source?.owner}
                            </p>
                            <p className="mt-2 border-t border-line pt-2 text-[10px] leading-relaxed text-ink-500">
                              {sourceSnippets[rule.sourceId]}
                            </p>
                            <p className="mt-2 flex items-center gap-1 text-[9px] text-ink-400">
                              <BadgeCheck
                                className="h-3 w-3 text-mint-600"
                                aria-hidden="true"
                              />
                              Approved by {source?.approvedBy}
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
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
            {knowledgeSources.map((source) => {
              const Icon = SOURCE_ICONS[source.type];
              const ruleCount = rulesBySource.get(source.id) ?? 0;
              return (
                <article
                  key={source.id}
                  className="rounded-xl border border-line bg-white p-4 transition hover:border-ink-200 hover:shadow-card"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                        SOURCE_TONES[source.type],
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge className="border-line bg-ink-50 text-ink-500 normal-case tracking-normal">
                          {source.type}
                        </Badge>
                        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 normal-case tracking-normal">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          v{source.version}
                        </Badge>
                      </div>
                      <h3 className="mt-1.5 text-[13px] font-semibold leading-snug text-ink-900">
                        {source.title}
                      </h3>
                      <p className="mt-1 text-[11px] leading-relaxed text-ink-500">
                        {source.description}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-[10px] text-ink-400">
                    <span>{source.owner}</span>
                    <span aria-hidden="true">·</span>
                    <span>{pluralize(source.sections, "section")}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {ruleCount} {ruleCount === 1 ? "rule" : "rules"}
                    </span>
                  </div>
                  <p className="mt-1.5 flex items-center gap-1 text-[9px] text-ink-400">
                    <ShieldCheck className="h-3 w-3 text-mint-600" aria-hidden="true" />
                    Approved {formatDate(source.approvedAt)} by {source.approvedBy}
                  </p>
                </article>
              );
            })}
          </div>
        )}

        {tab === "facts" && (
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-[11px] leading-relaxed text-brand-900">
              <Sparkles
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600"
                aria-hidden="true"
              />
              Only use these exact formulations externally. Percentages, sample
              sizes and study conditions cannot be changed without approval.
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {approvedFacts.map((fact) => (
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
                  <p className="mt-2.5 text-[12px] leading-relaxed text-ink-700">
                    “{fact.claim}”
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2.5 text-[10px] text-ink-400">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2
                        className="h-3 w-3 text-mint-600"
                        aria-hidden="true"
                      />
                      Approved {formatDate(fact.approvedOn)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{sourceMap.get(fact.sourceId)?.title}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </Card>

      <section className="relative overflow-hidden rounded-2xl bg-ink-950 p-5 text-white shadow-lift sm:p-6">
        <div className="demo-grid absolute inset-0 opacity-50" aria-hidden="true" />
        <div
          className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-brand-500/25 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-mint-300/20 bg-mint-300/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-mint-200">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            Evidence-linked by design
          </span>
          <h2 className="mt-3 text-lg font-semibold tracking-tight">
            How this library becomes a finding
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              {
                step: "1",
                title: "Match the rule",
                text: "The draft is checked against all 10 approved rules for its channel and context.",
              },
              {
                step: "2",
                title: "Cite the exact passage",
                text: "Every finding shows the source, version, section and quoted requirement a reviewer can verify.",
              },
              {
                step: "3",
                title: "Admit the gap",
                text: "If no approved source answers the question, BrandLens raises a knowledge gap for a human instead of inventing support.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-xl border border-white/10 bg-white/[0.05] p-3.5"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-mint-300/15 text-[10px] font-bold text-mint-200">
                  {item.step}
                </span>
                <p className="mt-2 text-[12px] font-semibold text-white/90">
                  {item.title}
                </p>
                <p className="mt-1 text-[10px] leading-relaxed text-white/45">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link
              href="/submit"
              className={buttonStyles({
                variant: "secondary",
                size: "sm",
                className:
                  "border-white/15 bg-white/[0.06] text-white shadow-none hover:border-white/25 hover:bg-white/[0.11]",
              })}
            >
              Run a review
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
            <span className="text-[10px] text-white/35">
              Synthetic sources for the Aurelia Skin demo workspace
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
