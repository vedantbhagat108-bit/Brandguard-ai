"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  CheckCircle2,
  CloudUpload,
  FileWarning,
  History,
  Image as ImageIcon,
  Lock,
  Plus,
  RefreshCw,
  ScanEye,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, SeverityBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { ScoreRing } from "@/components/ui/score-ring";
import { useAuth } from "@/components/providers/auth-provider";
import { useToast } from "@/components/providers/toast-provider";
import { cn } from "@/lib/utils";
import type {
  PublicVisualAsset,
  VisualAssetCategory,
  VisualAssetApprovalStatus,
  VisualReviewReport,
  VisualSearchResult,
  ExplainableVisualFinding,
} from "@/backend/visualAssetsRag";

const CATEGORY_LABELS: Record<VisualAssetCategory, string> = {
  logo_primary: "Primary Logo (Full Color / Monochrome / Reversed)",
  logo_secondary: "Secondary Logo / Badge",
  product_image: "Product Photograph / 3D Render",
  campaign_banner: "Marketing Banner / Campaign Artwork",
  illustration_icon: "Brand Illustration / Icon System",
  color_palette: "Brand Color Palette Swatch",
  template_graphic: "Approved Template / Promotional Graphic",
  other: "Other Approved Visual Asset",
};

const TONE_CLASSES: Record<
  "mint" | "amber" | "rose" | "neutral" | "brand",
  string
> = {
  mint: "border-mint-200 bg-mint-50 text-mint-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  neutral: "border-ink-200 bg-ink-50 text-ink-700",
  brand: "border-brand-200 bg-brand-50 text-brand-700",
};

const STATUS_BADGES: Record<
  VisualAssetApprovalStatus,
  { label: string; tone: "mint" | "amber" | "rose" | "neutral" | "brand" }
> = {
  approved: { label: "Approved (Active RAG)", tone: "mint" },
  pending_review: { label: "Pending Review", tone: "amber" },
  rejected: { label: "Rejected", tone: "rose" },
  archived: { label: "Archived / Superseded", tone: "neutral" },
  expired: { label: "Expired", tone: "rose" },
};

const DEFAULT_ORG_ID = "b0000001-0000-4000-8000-000000000001";

export default function VisualAssetsPage() {
  const { user, isAuthenticated, setLoginModalOpen } = useAuth();
  const { toast } = useToast();

  const organizationId = user?.brand_id || DEFAULT_ORG_ID;
  const isManagerOrAdmin =
    user?.role === "manager" ||
    user?.securityRole === "SUPER_ADMIN" ||
    user?.securityRole === "ADMIN" ||
    user?.securityRole === "REVIEWER";

  const [activeTab, setActiveTab] = useState<"library" | "review" | "search">("library");

  // Library State
  const [assets, setAssets] = useState<PublicVisualAsset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<VisualAssetCategory | "all">("all");
  const [statusFilter, setStatusFilter] = useState<VisualAssetApprovalStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<PublicVisualAsset | null>(null);

  // Upload / Version Replacement Modal State
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [supersedeTarget, setSupersedeTarget] = useState<PublicVisualAsset | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState<VisualAssetCategory>("logo_primary");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadTags, setUploadTags] = useState("logo, 2026, official");
  const [uploadCampaignId, setUploadCampaignId] = useState("EVERGREEN-BRAND-2026");
  const [uploadOcrHint, setUploadOcrHint] = useState("");
  const [uploadColors, setUploadColors] = useState("#19AD73, #0C0F20");
  const [uploadAutoApprove, setUploadAutoApprove] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Visual Creative Governance Review State
  const [reviewFile, setReviewFile] = useState<File | null>(null);
  const [reviewPreset, setReviewPreset] = useState<string>("outdated_2025_campaign");
  const [reviewTitle, setReviewTitle] = useState("Spring 2026 Herbal Drops Campaign Creative");
  const [reviewCampaignId, setReviewCampaignId] = useState("CAMP-SPRING-2026");
  const [reviewAltText, setReviewAltText] = useState("");
  const [reviewRequireLogo, setReviewRequireLogo] = useState(true);
  const [runningReview, setRunningReview] = useState(false);
  const [currentReport, setCurrentReport] = useState<VisualReviewReport | null>(null);
  const [overrideNoteMap, setOverrideNoteMap] = useState<Record<string, string>>({});

  // Authoritative RAG Search State
  const [ragQuery, setRagQuery] = useState("EcoFresh primary logo wordmark mint");
  const [ragCategory, setRagCategory] = useState<VisualAssetCategory | "all">("all");
  const [ragColorHex, setRagColorHex] = useState("#19AD73");
  const [ragResults, setRagResults] = useState<VisualSearchResult[]>([]);
  const [searchingRag, setSearchingRag] = useState(false);

  const authHeaders = useMemo(
    () => ({
      "X-Organization-Id": organizationId,
      "X-Brand-Id": organizationId,
      "X-User-Name": user?.name || "",
      "X-User-Email": user?.email || "",
      "X-User-Role": user?.role || "content_creator",
      "X-Security-Role": user?.securityRole || "CREATOR",
    }),
    [organizationId, user]
  );

  const fetchAssets = useCallback(async () => {
    setLoadingAssets(true);
    try {
      const params = new URLSearchParams({
        organization_id: organizationId,
        category: categoryFilter,
        status: statusFilter,
        q: searchQuery,
      });
      const res = await fetch(`/api/visual-assets?${params.toString()}`, {
        headers: authHeaders,
      });
      const data = await res.json();
      if (data.assets) {
        setAssets(data.assets);
      }
    } catch {
      toast({
        title: "Could not load visual assets",
        description: "Please verify your network connection and try again.",
        variant: "error",
      });
    } finally {
      setLoadingAssets(false);
    }
  }, [organizationId, categoryFilter, statusFilter, searchQuery, authHeaders, toast]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const stats = useMemo(() => {
    const approvedCount = assets.filter((a) => a.approval_status === "approved").length;
    const pendingCount = assets.filter((a) => a.approval_status === "pending_review").length;
    const archivedCount = assets.filter(
      (a) => a.approval_status === "archived" || a.approval_status === "expired"
    ).length;
    return {
      total: assets.length,
      approved: approvedCount,
      pending: pendingCount,
      archived: archivedCount,
    };
  }, [assets]);

  const handleOpenUploadModal = (replaceAsset?: PublicVisualAsset) => {
    if (replaceAsset) {
      setSupersedeTarget(replaceAsset);
      setUploadName(
        `${replaceAsset.asset_name.replace(/\s*\(v\d+.*\)$/i, "")} (v${replaceAsset.version + 1})`
      );
      setUploadCategory(replaceAsset.asset_category);
      setUploadDescription(replaceAsset.asset_description);
      setUploadTags(replaceAsset.tags.join(", "));
      setUploadCampaignId(replaceAsset.campaign_id || "CAMP-SPRING-2026");
      setUploadOcrHint(replaceAsset.ocr_text);
      setUploadColors(replaceAsset.dominant_colors.join(", "));
    } else {
      setSupersedeTarget(null);
      setUploadName("");
      setUploadCategory("logo_primary");
      setUploadDescription("");
      setUploadTags("logo, brand, 2026");
      setUploadCampaignId("EVERGREEN-BRAND-2026");
      setUploadOcrHint("");
      setUploadColors("#19AD73, #0C0F20");
    }
    setUploadFiles([]);
    setUploadModalOpen(true);
  };

  const handleUploadSubmit = async () => {
    if (!uploadName.trim() && uploadFiles.length === 0) {
      toast({
        title: "Asset name required",
        description: "Provide an asset title or select one or more image files.",
        variant: "info",
      });
      return;
    }

    setUploading(true);
    try {
      if (uploadFiles.length > 0 && !supersedeTarget) {
        let uploadedCount = 0;
        for (const file of uploadFiles) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append(
            "asset_name",
            uploadFiles.length === 1 && uploadName.trim()
              ? uploadName.trim()
              : file.name.replace(/\.[^.]+$/, "")
          );
          formData.append("asset_category", uploadCategory);
          formData.append("asset_description", uploadDescription);
          formData.append("tags", uploadTags);
          formData.append("campaign_id", uploadCampaignId);
          formData.append("ocr_text_hint", uploadOcrHint);
          formData.append("auto_approve", String(uploadAutoApprove && isManagerOrAdmin));
          formData.append("organization_id", organizationId);

          const res = await fetch("/api/visual-assets", {
            method: "POST",
            headers: authHeaders,
            body: formData,
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || `Failed to upload ${file.name}`);
          }
          uploadedCount += 1;
        }
        toast({
          title: `Indexed ${uploadedCount} visual asset${uploadedCount > 1 ? "s" : ""}`,
          description:
            uploadAutoApprove && isManagerOrAdmin
              ? "Assets validated, embedded (768-dim), and added to the authoritative Visual Assets RAG index."
              : "Assets validated and queued in pending_review until approved by a Brand Manager.",
          variant: "success",
        });
      } else {
        let imageBase64: string | undefined;
        if (uploadFiles[0]) {
          const buf = await uploadFiles[0].arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          imageBase64 = btoa(binary);
        }

        const colorArray = uploadColors
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);

        const endpoint = supersedeTarget
          ? `/api/visual-assets/${supersedeTarget.id}`
          : "/api/visual-assets";
        const method = supersedeTarget ? "PATCH" : "POST";

        const res = await fetch(endpoint, {
          method,
          headers: {
            ...authHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organization_id: organizationId,
            asset_name: uploadName.trim() || "Brand Visual Reference Asset",
            asset_category: uploadCategory,
            asset_description: uploadDescription,
            tags: uploadTags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            campaign_id: uploadCampaignId,
            ocr_text_hint: uploadOcrHint,
            dominant_colors_hint: colorArray,
            generate_swatch_colors: !imageBase64 ? colorArray : undefined,
            image_base64: imageBase64,
            auto_approve: uploadAutoApprove && isManagerOrAdmin,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to index visual asset.");
        }

        toast({
          title: supersedeTarget
            ? `Created Version v${data.asset.version}`
            : "Visual Asset Indexed",
          description: data.message,
          variant: "success",
        });
      }

      setUploadModalOpen(false);
      setSelectedAsset(null);
      await fetchAssets();
    } catch (err: any) {
      toast({
        title: "Visual asset ingestion failed",
        description: err.message || "Validation error.",
        variant: "error",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleApprovalAction = async (
    asset: PublicVisualAsset,
    decision: "approved" | "rejected"
  ) => {
    try {
      const res = await fetch(`/api/visual-assets/${asset.id}/approve`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organization_id: organizationId,
          decision,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({
        title: decision === "approved" ? "Visual Asset Approved" : "Visual Asset Rejected",
        description: data.message,
        variant: decision === "approved" ? "success" : "info",
      });
      setSelectedAsset(data.asset);
      await fetchAssets();
    } catch (err: any) {
      toast({
        title: "Action denied",
        description: err.message,
        variant: "error",
      });
    }
  };

  const handleArchiveAsset = async (asset: PublicVisualAsset) => {
    try {
      const res = await fetch(`/api/visual-assets/${asset.id}/archive`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organization_id: organizationId,
          reason: "Archived from active Visual Assets RAG reference library.",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({
        title: "Visual Asset Archived",
        description: data.message,
        variant: "info",
      });
      setSelectedAsset(data.asset);
      await fetchAssets();
    } catch (err: any) {
      toast({
        title: "Archive failed",
        description: err.message,
        variant: "error",
      });
    }
  };

  const handleDeleteAsset = async (asset: PublicVisualAsset) => {
    try {
      const res = await fetch(
        `/api/visual-assets/${asset.id}?organization_id=${encodeURIComponent(organizationId)}`,
        {
          method: "DELETE",
          headers: authHeaders,
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      toast({
        title: "Visual Asset Deleted",
        description: "Removed private image blob and vector index entry.",
        variant: "info",
      });
      setSelectedAsset(null);
      await fetchAssets();
    } catch (err: any) {
      toast({
        title: "Deletion failed",
        description: err.message,
        variant: "error",
      });
    }
  };

  const handleRunVisualReview = async () => {
    setRunningReview(true);
    try {
      let res: Response;
      if (reviewFile) {
        const formData = new FormData();
        formData.append("file", reviewFile);
        formData.append("title", reviewTitle);
        formData.append("campaign_id", reviewCampaignId);
        formData.append("alt_text", reviewAltText);
        formData.append("require_logo", String(reviewRequireLogo));
        formData.append("organization_id", organizationId);

        res = await fetch("/api/visual-review", {
          method: "POST",
          headers: authHeaders,
          body: formData,
        });
      } else {
        res = await fetch("/api/visual-review", {
          method: "POST",
          headers: {
            ...authHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organization_id: organizationId,
            sample_preset: reviewPreset,
            title: reviewTitle,
            campaign_id: reviewCampaignId,
            alt_text: reviewAltText || undefined,
            require_logo: reviewRequireLogo,
          }),
        });
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Visual review failed.");

      setCurrentReport(data.report);
      toast({
        title: "Visual Governance Review Complete",
        description: data.report.summary,
        variant: data.report.findings.length === 0 ? "success" : "info",
      });
    } catch (err: any) {
      toast({
        title: "Visual Review Failed",
        description: err.message,
        variant: "error",
      });
    } finally {
      setRunningReview(false);
    }
  };

  const handleResolveFinding = async (
    finding: ExplainableVisualFinding,
    status: "accepted" | "overridden" | "dismissed"
  ) => {
    if (!currentReport) return;
    const note =
      overrideNoteMap[finding.finding_id] ||
      (status === "accepted"
        ? "Confirmed by human reviewer for artwork revision."
        : "Approved campaign exception verified by brand reviewer.");

    try {
      const res = await fetch("/api/visual-review", {
        method: "PATCH",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organization_id: organizationId,
          review_id: currentReport.review_id,
          finding_id: finding.finding_id,
          status,
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCurrentReport(data.report);
      toast({
        title: `Finding ${status}`,
        description: `Updated advisory score: ${data.report.advisory_score}/100`,
        variant: "success",
      });
    } catch (err: any) {
      toast({
        title: "Could not update finding",
        description: err.message,
        variant: "error",
      });
    }
  };

  const handleSearchRag = async () => {
    setSearchingRag(true);
    try {
      const res = await fetch("/api/visual-assets/search", {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organization_id: organizationId,
          query_text: ragQuery,
          category: ragCategory,
          color_hex: ragColorHex,
          top_k: 6,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRagResults(data.results || []);
    } catch (err: any) {
      toast({
        title: "Visual RAG Search Failed",
        description: err.message,
        variant: "error",
      });
    } finally {
      setSearchingRag(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <Card className="p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="mt-4 font-display text-xl font-semibold text-ink-950">
            Sign in to access Visual Assets & Creative Audits
          </h1>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-ink-500">
            Sign in to your organization workspace to browse approved brand logos, upload visual references, or run creative governance audits on demand.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button variant="primary" size="md" onClick={() => setLoginModalOpen(true)}>
              Sign in
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Visual Assets & Creative Governance"
        description="Manage approved brand visual references and run on-demand creative audits."
        actions={
          <>
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                setActiveTab("review");
              }}
            >
              <ScanEye className="h-4 w-4 text-brand-600" />
              Audit Creative Image
            </Button>
            <Button variant="primary" size="md" onClick={() => handleOpenUploadModal()}>
              <Plus className="h-4 w-4" />
              Upload Visual Asset
            </Button>
          </>
        }
      />

      {/* Mode Switch Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-ink-200/80 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("library")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all",
              activeTab === "library"
                ? "bg-ink-900 text-white shadow-xs"
                : "bg-white text-ink-600 hover:bg-ink-100/70"
            )}
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Visual Library ({assets.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("review")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all",
              activeTab === "review"
                ? "bg-ink-900 text-white shadow-xs"
                : "bg-white text-ink-600 hover:bg-ink-100/70"
            )}
          >
            <ScanEye className="h-3.5 w-3.5" />
            Run Visual Audit
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("search");
              if (ragResults.length === 0) handleSearchRag();
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all",
              activeTab === "search"
                ? "bg-ink-900 text-white shadow-xs"
                : "bg-white text-ink-600 hover:bg-ink-100/70"
            )}
          >
            <Search className="h-3.5 w-3.5" />
            Search Approved References
          </button>
        </div>
      </div>

      {/* TAB 1: VISUAL ASSET LIBRARY */}
      {activeTab === "library" && (
        <div className="space-y-5">
          <Card className="p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="relative md:col-span-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by asset name, OCR text, campaign ID, or tag..."
                  className="h-9 w-full rounded-lg border border-ink-200 bg-white pl-9 pr-3 text-xs text-ink-900 focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as any)}
                  className="h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-xs text-ink-800 focus:border-brand-500 focus:outline-none"
                >
                  <option value="all">All Asset Categories</option>
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-xs text-ink-800 focus:border-brand-500 focus:outline-none"
                >
                  <option value="all">All Governance States</option>
                  <option value="approved">Approved (Active in RAG)</option>
                  <option value="pending_review">Pending Review</option>
                  <option value="archived">Archived / Superseded</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>
          </Card>

          {loadingAssets ? (
            <Card className="p-12 text-center text-sm text-ink-500">
              Loading organization-isolated visual assets...
            </Card>
          ) : assets.length === 0 ? (
            <EmptyState
              icon={ImageIcon}
              title="No matching visual assets found"
              description="Upload an approved logo, product render, campaign banner, or color palette swatch to populate your organization's Visual Assets RAG library."
              action={
                <Button variant="primary" size="sm" onClick={() => handleOpenUploadModal()}>
                  <Plus className="h-4 w-4" />
                  Upload Visual Asset
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {assets.map((asset) => {
                const statusMeta = STATUS_BADGES[asset.approval_status];
                return (
                  <Card
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    className="flex cursor-pointer flex-col overflow-hidden p-0 transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
                  >
                    <div className="relative flex h-44 items-center justify-center overflow-hidden border-b border-ink-100 bg-ink-900/5 p-4">
                      <img
                        src={asset.preview_url}
                        alt={asset.asset_name}
                        referrerPolicy="no-referrer"
                        className="max-h-full max-w-full rounded-md object-contain shadow-xs"
                      />
                      <div className="absolute left-3 top-3 flex items-center gap-1.5">
                        <Badge className={TONE_CLASSES[statusMeta.tone]}>
                          {statusMeta.label}
                        </Badge>
                      </div>
                      <div className="absolute right-3 top-3">
                        <Badge className={TONE_CLASSES.neutral}>v{asset.version}</Badge>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col justify-between p-4">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">
                            {CATEGORY_LABELS[asset.asset_category] || asset.asset_category}
                          </span>
                          <span className="font-mono text-[11px] text-ink-400">
                            {asset.width}×{asset.height}px
                          </span>
                        </div>

                        <h3 className="mt-1 font-display text-sm font-semibold text-ink-900">
                          {asset.asset_name}
                        </h3>

                        <p className="mt-1 line-clamp-2 text-xs text-ink-600">
                          {asset.asset_description}
                        </p>
                      </div>

                      <div className="mt-4 space-y-3 border-t border-ink-100 pt-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {asset.dominant_colors.map((hex) => (
                              <div
                                key={hex}
                                className="flex items-center gap-1 rounded border border-ink-200 bg-white px-1.5 py-0.5"
                                title={`Dominant Color: ${hex}`}
                              >
                                <span
                                  className="h-2.5 w-2.5 rounded-xs border border-ink-300"
                                  style={{ backgroundColor: hex }}
                                />
                                <span className="font-mono text-[10px] text-ink-700">{hex}</span>
                              </div>
                            ))}
                          </div>
                          <span className="font-mono text-[10px] text-ink-400">
                            SHA:{asset.content_hash.slice(0, 8)}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-500">
                          <span>By {asset.uploaded_by}</span>
                          {asset.campaign_id && (
                            <span className="font-mono text-[10px] text-ink-600">
                              {asset.campaign_id}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: VISUAL CREATIVE GOVERNANCE REVIEW */}
      {activeTab === "review" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Submission Controls */}
          <div className="space-y-5 lg:col-span-5">
            <Card className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-base font-semibold text-ink-900">
                    Submit Creative for Visual RAG Audit
                  </h2>
                  <p className="text-xs text-ink-500">
                    Compare a campaign image against approved logos, brand color palettes, superseded versions, and OCR claim policies.
                  </p>
                </div>
                <ScanEye className="h-5 w-5 text-brand-600" />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-ink-700">
                  1. Select Scenario Preset or Upload Custom Image (PNG/JPEG/WebP)
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    {
                      id: "outdated_2025_campaign",
                      label: "Scenario A: Outdated 2025 Superseded Campaign Banner",
                      desc: "Triggers deterministic SHA-256 match against archived v1 banner & cites v2 FDA-compliant replacement",
                    },
                    {
                      id: "off_brand_prohibited_claim",
                      label: "Scenario B: Off-Brand Neon Banner + Prohibited '100% Cure' OCR",
                      desc: "Triggers CIE76 ΔE color deviation, missing logo warning, and critical OCR claim violation",
                    },
                    {
                      id: "compliant_2026_banner",
                      label: "Scenario C: Compliant 2026 EcoFresh Spring Banner",
                      desc: "Matches approved Botanical Mint palette (#19AD73), primary logo lockup, and FDA disclaimer",
                    },
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setReviewFile(null);
                        setReviewPreset(preset.id);
                        if (preset.id === "compliant_2026_banner") {
                          setReviewTitle("EcoFresh Spring 2026 Herbal Drops Compliant Banner");
                          setReviewAltText(
                            "EcoFresh Botanicals Spring 2026 Herbal Drops banner with primary leaf logo and FDA disclaimer"
                          );
                        } else if (preset.id === "outdated_2025_campaign") {
                          setReviewTitle("EcoFresh Spring Herbal Drops Legacy 2025 Graphic");
                          setReviewAltText("");
                        } else {
                          setReviewTitle("Unapproved Neon Promo Banner — Miracle Cure Ad");
                          setReviewAltText("");
                        }
                      }}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-all",
                        !reviewFile && reviewPreset === preset.id
                          ? "border-brand-600 bg-brand-50/50 ring-1 ring-brand-500/30"
                          : "border-ink-200 bg-white hover:bg-ink-50"
                      )}
                    >
                      <div className="text-xs font-semibold text-ink-900">{preset.label}</div>
                      <div className="mt-0.5 text-[11px] text-ink-500">{preset.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-dashed border-ink-300 bg-ink-50/50 p-3.5">
                <label className="flex cursor-pointer flex-col items-center justify-center gap-1 text-center">
                  <Upload className="h-4 w-4 text-ink-500" />
                  <span className="text-xs font-medium text-ink-800">
                    {reviewFile
                      ? `Selected file: ${reviewFile.name} (${Math.round(reviewFile.size / 1024)} KB)`
                      : "Or click to upload your own PNG, JPEG, or WebP creative"}
                  </span>
                  <span className="text-[11px] text-ink-500">
                    Binary header validated · Max 8 MB
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setReviewFile(f);
                      if (f) setReviewTitle(f.name.replace(/\.[^.]+$/, ""));
                    }}
                  />
                </label>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-ink-700">Creative Title</label>
                  <input
                    type="text"
                    value={reviewTitle}
                    onChange={(e) => setReviewTitle(e.target.value)}
                    className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-xs text-ink-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-ink-700">
                    Accessibility Alt Text (Optional — leave blank to test accessibility check)
                  </label>
                  <input
                    type="text"
                    value={reviewAltText}
                    onChange={(e) => setReviewAltText(e.target.value)}
                    placeholder="Descriptive alt text for screen readers..."
                    className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-xs text-ink-900"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 text-xs text-ink-700">
                    <input
                      type="checkbox"
                      checked={reviewRequireLogo}
                      onChange={(e) => setReviewRequireLogo(e.target.checked)}
                      className="rounded border-ink-300"
                    />
                    Verify Primary Brand Logo Presence
                  </label>

                  <Button
                    variant="primary"
                    size="md"
                    onClick={handleRunVisualReview}
                    disabled={runningReview}
                  >
                    <Sparkles className="h-4 w-4" />
                    {runningReview ? "Running Multimodal RAG..." : "Run Visual Governance Audit"}
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column: Visual Governance Report */}
          <div className="space-y-5 lg:col-span-7">
            {!currentReport ? (
              <Card className="flex min-h-[420px] flex-col items-center justify-center p-8 text-center">
                <ScanEye className="h-10 w-10 text-brand-500" />
                <h3 className="mt-3 font-display text-base font-semibold text-ink-900">
                  Ready for Explainable Visual Governance Review
                </h3>
                <p className="mt-1 max-w-md text-xs text-ink-500">
                  Select one of the test presets on the left or upload a PNG/JPEG/WebP creative to compare against your organization&apos;s approved Visual Assets RAG index.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  className="mt-4"
                  onClick={handleRunVisualReview}
                >
                  Run Audit on Selected Scenario
                </Button>
              </Card>
            ) : (
              <div className="space-y-5">
                <Card className="p-5">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge
                          className={
                            currentReport.overall_status === "compliant"
                              ? TONE_CLASSES.mint
                              : currentReport.overall_status === "critical_issues_detected"
                              ? TONE_CLASSES.rose
                              : TONE_CLASSES.amber
                          }
                        >
                          {currentReport.overall_status === "compliant"
                            ? "Compliant Creative"
                            : currentReport.overall_status === "critical_issues_detected"
                            ? "Critical Governance Issues"
                            : "Requires Human Verification"}
                        </Badge>
                        <span className="font-mono text-[11px] text-ink-400">
                          ID: {currentReport.review_id}
                        </span>
                      </div>
                      <h3 className="font-display text-lg font-semibold text-ink-900">
                        {currentReport.title}
                      </h3>
                      <p className="text-xs text-ink-600">{currentReport.summary}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <ScoreRing score={currentReport.advisory_score} size={68} />
                    </div>
                  </div>

                  {/* Side-by-Side Comparison */}
                  <div className="mt-5 grid grid-cols-1 gap-4 border-t border-ink-100 pt-4 md:grid-cols-2">
                    <div className="rounded-lg border border-ink-200 bg-ink-50/40 p-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-ink-800">
                        <span>Submitted Creative Under Review</span>
                        <span className="font-mono text-[10px] text-ink-500">
                          {currentReport.submitted_image.width}×
                          {currentReport.submitted_image.height}px
                        </span>
                      </div>
                      <div className="mt-2 flex h-36 items-center justify-center rounded border border-ink-200 bg-white p-2">
                        <img
                          src={currentReport.submitted_image.preview_data_url}
                          alt={currentReport.title}
                          className="max-h-full max-w-full object-contain"
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {currentReport.submitted_image.dominant_colors.map((hex) => (
                          <span
                            key={hex}
                            className="inline-flex items-center gap-1 rounded border border-ink-200 bg-white px-1.5 py-0.5 font-mono text-[10px]"
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-xs"
                              style={{ backgroundColor: hex }}
                            />
                            {hex}
                          </span>
                        ))}
                      </div>
                      {currentReport.submitted_image.extracted_ocr_text && (
                        <p className="mt-2 rounded bg-white p-2 font-mono text-[10px] text-ink-600">
                          OCR: &ldquo;{currentReport.submitted_image.extracted_ocr_text}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="rounded-lg border border-ink-200 bg-ink-50/40 p-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-ink-800">
                        <span>Retrieved Approved Reference Assets</span>
                        <Badge className={TONE_CLASSES.mint}>
                          Top {currentReport.retrieved_references.length} Active
                        </Badge>
                      </div>
                      <div className="mt-2 space-y-2">
                        {currentReport.retrieved_references.slice(0, 3).map((ref) => (
                          <div
                            key={ref.asset.id}
                            className="flex items-center gap-2.5 rounded border border-ink-200 bg-white p-2"
                          >
                            <img
                              src={ref.asset.preview_url}
                              alt={ref.asset.asset_name}
                              referrerPolicy="no-referrer"
                              className="h-10 w-14 rounded object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-semibold text-ink-900">
                                {ref.asset.asset_name} (v{ref.asset.version})
                              </div>
                              <div className="truncate text-[10px] text-ink-500">
                                {ref.matched_signals.join(" · ")}
                              </div>
                            </div>
                            <Badge className={TONE_CLASSES.brand}>
                              {Math.round(ref.similarity_score * 100)}%
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>

                {/* Explainable Visual Findings */}
                <div className="space-y-3">
                  <h4 className="font-display text-sm font-semibold text-ink-900">
                    Explainable Visual Governance Findings ({currentReport.findings.length})
                  </h4>

                  {currentReport.findings.length === 0 ? (
                    <Card className="p-6 text-center">
                      <CheckCircle2 className="mx-auto h-7 w-7 text-mint-600" />
                      <p className="mt-2 text-sm font-semibold text-ink-900">
                        All Visual & Multimodal Checks Passed
                      </p>
                      <p className="mt-1 text-xs text-ink-500">
                        No outdated assets, palette deviations, prohibited OCR claims, or accessibility gaps detected.
                      </p>
                    </Card>
                  ) : (
                    currentReport.findings.map((finding) => (
                      <Card key={finding.finding_id} className="space-y-3 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <SeverityBadge severity={finding.severity} />
                            <Badge
                              className={
                                finding.is_deterministic
                                  ? TONE_CLASSES.brand
                                  : TONE_CLASSES.amber
                              }
                            >
                              {finding.is_deterministic
                                ? "Deterministic Check"
                                : `Advisory Similarity (${Math.round(
                                    (finding.confidence ?? 0.8) * 100
                                  )}%)`}
                            </Badge>
                            <span className="font-mono text-[11px] text-ink-500">
                              {finding.evidence_type}
                            </span>
                          </div>

                          <Badge
                            className={
                              finding.review_status === "overridden" ||
                              finding.review_status === "dismissed"
                                ? TONE_CLASSES.neutral
                                : finding.review_status === "accepted"
                                ? TONE_CLASSES.mint
                                : TONE_CLASSES.amber
                            }
                          >
                            {finding.review_status.replace(/_/g, " ")}
                          </Badge>
                        </div>

                        <div>
                          <h5 className="font-display text-sm font-semibold text-ink-900">
                            {finding.title}
                          </h5>
                          <p className="mt-1 text-xs text-ink-700">{finding.description}</p>
                          <p className="mt-1 text-[11px] text-ink-500">
                            <strong>Governance Rationale:</strong> {finding.reason}
                          </p>
                        </div>

                        {finding.measured_value && (
                          <div className="rounded bg-ink-50 px-3 py-1.5 font-mono text-[11px] text-ink-700">
                            Measured Evidence: {finding.measured_value}
                          </div>
                        )}

                        {finding.reference_assets_summary.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[11px] font-semibold text-ink-600">
                              Cited Reference Visual Asset(s):
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {finding.reference_assets_summary.map((ref) => (
                                <div
                                  key={ref.id}
                                  className="flex items-center gap-2 rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-xs"
                                >
                                  <img
                                    src={ref.preview_url}
                                    alt={ref.asset_name}
                                    referrerPolicy="no-referrer"
                                    className="h-6 w-8 rounded object-cover"
                                  />
                                  <span>
                                    {ref.asset_name} (v{ref.version} · {ref.approval_status})
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="rounded-lg border border-brand-200/70 bg-brand-50/40 p-2.5 text-xs text-ink-800">
                          <strong>Recommended Action:</strong> {finding.suggested_action}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3">
                          <input
                            type="text"
                            placeholder="Optional reviewer note or exception reason..."
                            value={overrideNoteMap[finding.finding_id] || ""}
                            onChange={(e) =>
                              setOverrideNoteMap((prev) => ({
                                ...prev,
                                [finding.finding_id]: e.target.value,
                              }))
                            }
                            className="h-8 flex-1 rounded border border-ink-200 px-2.5 text-xs"
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleResolveFinding(finding, "accepted")}
                            >
                              Accept Finding
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleResolveFinding(finding, "overridden")}
                            >
                              Override with Reason
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: AUTHORITATIVE VISUAL RAG SEARCH */}
      {activeTab === "search" && (
        <div className="space-y-5">
          <Card className="p-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
              <div className="md:col-span-5">
                <label className="block text-xs font-medium text-ink-700">
                  Visual Description, OCR Keyword, or Tag Query
                </label>
                <input
                  type="text"
                  value={ragQuery}
                  onChange={(e) => setRagQuery(e.target.value)}
                  placeholder="e.g., primary leaf wordmark logo or FDA compliant spring banner"
                  className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-xs"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-ink-700">Category</label>
                <select
                  value={ragCategory}
                  onChange={(e) => setRagCategory(e.target.value as any)}
                  className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-3 text-xs"
                >
                  <option value="all">All Categories</option>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-ink-700">
                  Target Hex Color
                </label>
                <input
                  type="text"
                  value={ragColorHex}
                  onChange={(e) => setRagColorHex(e.target.value)}
                  placeholder="#19AD73"
                  className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-3 font-mono text-xs"
                />
              </div>

              <div className="flex items-end md:col-span-2">
                <Button
                  variant="primary"
                  size="md"
                  className="w-full"
                  onClick={handleSearchRag}
                  disabled={searchingRag}
                >
                  <Search className="h-4 w-4" />
                  {searchingRag ? "Searching..." : "Retrieve"}
                </Button>
              </div>
            </div>
            <p className="mt-2.5 text-[11px] text-ink-500">
              Note: Authoritative Visual RAG retrieval strictly pre-filters by{" "}
              <code>organization_id</code> and returns only <code>approved</code>, currently effective visual assets. Pending, rejected, and archived assets are never returned as authoritative references.
            </p>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {ragResults.map((res) => (
              <Card key={res.asset.id} className="space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <Badge className={TONE_CLASSES.mint}>
                    Approved v{res.asset.version}
                  </Badge>
                  <Badge className={TONE_CLASSES.brand}>
                    Score: {Math.round(res.similarity_score * 100)}%
                  </Badge>
                </div>

                <div className="flex h-36 items-center justify-center rounded border border-ink-100 bg-ink-50/50 p-2">
                  <img
                    src={res.asset.preview_url}
                    alt={res.asset.asset_name}
                    referrerPolicy="no-referrer"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>

                <div>
                  <h4 className="font-display text-sm font-semibold text-ink-900">
                    {res.asset.asset_name}
                  </h4>
                  <p className="mt-1 text-xs text-ink-600">{res.asset.asset_description}</p>
                </div>

                <div className="space-y-1 border-t border-ink-100 pt-2 text-[11px] text-ink-500">
                  <div className="font-semibold text-ink-700">Matched Retrieval Signals:</div>
                  <ul className="list-disc pl-4">
                    {res.matched_signals.map((sig, i) => (
                      <li key={i}>{sig}</li>
                    ))}
                  </ul>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ASSET DETAILS & VERSION LIFECYCLE MODAL */}
      <Modal
        open={Boolean(selectedAsset)}
        onClose={() => setSelectedAsset(null)}
        title={selectedAsset?.asset_name || "Visual Asset Details"}
        description={
          selectedAsset
            ? `${CATEGORY_LABELS[selectedAsset.asset_category]} · Version v${selectedAsset.version} · SHA-256 ${selectedAsset.content_hash.slice(0, 16)}...`
            : ""
        }
        size="lg"
        footer={
          selectedAsset ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {isManagerOrAdmin && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeleteAsset(selectedAsset)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                )}
                {isManagerOrAdmin && selectedAsset.approval_status === "approved" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleArchiveAsset(selectedAsset)}
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive Asset
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const target = selectedAsset;
                    setSelectedAsset(null);
                    handleOpenUploadModal(target);
                  }}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Upload New Version (v{selectedAsset.version + 1})
                </Button>

                {isManagerOrAdmin && selectedAsset.approval_status !== "approved" && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleApprovalAction(selectedAsset, "approved")}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve for RAG Index
                  </Button>
                )}

                {isManagerOrAdmin && selectedAsset.approval_status === "pending_review" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleApprovalAction(selectedAsset, "rejected")}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Reject
                  </Button>
                )}
              </div>
            </div>
          ) : null
        }
      >
        {selectedAsset && (
          <div className="space-y-4">
            <div className="flex h-56 items-center justify-center rounded-xl border border-ink-200 bg-ink-900/5 p-4">
              <img
                src={selectedAsset.preview_url}
                alt={selectedAsset.asset_name}
                referrerPolicy="no-referrer"
                className="max-h-full max-w-full rounded object-contain"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              <div className="rounded-lg border border-ink-200 p-2.5">
                <span className="text-[11px] text-ink-500">Approval Status</span>
                <div className="mt-1 font-semibold text-ink-900">
                  {STATUS_BADGES[selectedAsset.approval_status].label}
                </div>
              </div>
              <div className="rounded-lg border border-ink-200 p-2.5">
                <span className="text-[11px] text-ink-500">Dimensions & MIME</span>
                <div className="mt-1 font-mono font-semibold text-ink-900">
                  {selectedAsset.width}×{selectedAsset.height} ({selectedAsset.mime_type})
                </div>
              </div>
              <div className="rounded-lg border border-ink-200 p-2.5">
                <span className="text-[11px] text-ink-500">Campaign Scope</span>
                <div className="mt-1 font-mono font-semibold text-ink-900">
                  {selectedAsset.campaign_id || "Evergreen"}
                </div>
              </div>
              <div className="rounded-lg border border-ink-200 p-2.5">
                <span className="text-[11px] text-ink-500">Approved By</span>
                <div className="mt-1 font-semibold text-ink-900">
                  {selectedAsset.approved_by || "Awaiting Sign-Off"}
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-ink-200 bg-ink-50/50 p-3 text-xs">
              <div>
                <strong className="text-ink-800">Visual Description:</strong>{" "}
                <span className="text-ink-600">{selectedAsset.visual_description}</span>
              </div>
              {selectedAsset.ocr_text && (
                <div>
                  <strong className="text-ink-800">Sanitized OCR Text:</strong>{" "}
                  <code className="font-mono text-[11px] text-ink-700">
                    {selectedAsset.ocr_text}
                  </code>
                </div>
              )}
              <div>
                <strong className="text-ink-800">Embedding Model:</strong>{" "}
                <span className="font-mono text-[11px] text-ink-600">
                  {selectedAsset.embedding_model}
                </span>
              </div>
              {selectedAsset.supersedes_asset_id && (
                <div className="text-brand-700">
                  <strong>Supersedes Previous Asset ID:</strong>{" "}
                  <code>{selectedAsset.supersedes_asset_id}</code>
                </div>
              )}
              {selectedAsset.superseded_by_asset_id && (
                <div className="text-amber-700">
                  <strong>Superseded By Newer Version ID:</strong>{" "}
                  <code>{selectedAsset.superseded_by_asset_id}</code>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* UPLOAD / NEW VERSION MODAL */}
      <Modal
        open={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        title={
          supersedeTarget
            ? `Upload New Version for "${supersedeTarget.asset_name}"`
            : "Upload & Index Official Brand Visual Asset"
        }
        description="Binary magic-byte validation (PNG, JPEG, WebP), SHA-256 deduplication, OCR sanitization, and 768-dim hybrid visual embedding."
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setUploadModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleUploadSubmit}
              disabled={uploading}
            >
              <CloudUpload className="h-4 w-4" />
              {uploading
                ? "Validating & Indexing..."
                : supersedeTarget
                ? `Publish Version v${supersedeTarget.version + 1}`
                : "Upload & Index Visual Asset"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50/60 p-4 text-center">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5">
              <CloudUpload className="h-6 w-6 text-brand-600" />
              <span className="font-semibold text-ink-900">
                {uploadFiles.length > 0
                  ? `${uploadFiles.length} file(s) selected: ${uploadFiles.map((f) => f.name).join(", ")}`
                  : "Select PNG, JPEG, or WebP file(s) — or leave empty to generate an official swatch PNG"}
              </span>
              <span className="text-[11px] text-ink-500">
                Supports single or multi-file upload · Max 8 MB per image
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple={!supersedeTarget}
                className="hidden"
                onChange={(e) => {
                  const list = e.target.files ? Array.from(e.target.files) : [];
                  setUploadFiles(list);
                  if (list.length === 1 && !uploadName) {
                    setUploadName(list[0].name.replace(/\.[^.]+$/, ""));
                  }
                }}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block font-medium text-ink-700">Asset Title</label>
              <input
                type="text"
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="e.g., EcoFresh Primary Leaf Logo (2026)"
                className="mt-1 h-9 w-full rounded-lg border border-ink-200 px-3"
              />
            </div>

            <div>
              <label className="block font-medium text-ink-700">Visual Asset Category</label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value as VisualAssetCategory)}
                className="mt-1 h-9 w-full rounded-lg border border-ink-200 bg-white px-3"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-ink-700">
              Visual Brand Governance Description
            </label>
            <textarea
              rows={2}
              value={uploadDescription}
              onChange={(e) => setUploadDescription(e.target.value)}
              placeholder="Describe approved usage rules, required clear-space, or campaign context..."
              className="mt-1 w-full rounded-lg border border-ink-200 p-2.5"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block font-medium text-ink-700">Tags (comma-separated)</label>
              <input
                type="text"
                value={uploadTags}
                onChange={(e) => setUploadTags(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-ink-200 px-3"
              />
            </div>

            <div>
              <label className="block font-medium text-ink-700">Campaign ID</label>
              <input
                type="text"
                value={uploadCampaignId}
                onChange={(e) => setUploadCampaignId(e.target.value)}
                className="mt-1 h-9 w-full rounded-lg border border-ink-200 px-3 font-mono"
              />
            </div>

            <div>
              <label className="block font-medium text-ink-700">
                Brand Swatch Hex Colors
              </label>
              <input
                type="text"
                value={uploadColors}
                onChange={(e) => setUploadColors(e.target.value)}
                placeholder="#19AD73, #0C0F20"
                className="mt-1 h-9 w-full rounded-lg border border-ink-200 px-3 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-ink-700">
              Embedded OCR Text Hint (Optional — auto-extracted if Gemini Vision key is active)
            </label>
            <input
              type="text"
              value={uploadOcrHint}
              onChange={(e) => setUploadOcrHint(e.target.value)}
              placeholder="Visible text inside logo or banner..."
              className="mt-1 h-9 w-full rounded-lg border border-ink-200 px-3"
            />
          </div>

          {isManagerOrAdmin && (
            <label className="flex items-center gap-2 pt-1 font-medium text-ink-800">
              <input
                type="checkbox"
                checked={uploadAutoApprove}
                onChange={(e) => setUploadAutoApprove(e.target.checked)}
                className="rounded border-ink-300"
              />
              Approve immediately for authoritative Visual Assets RAG retrieval
            </label>
          )}
        </div>
      </Modal>
    </div>
  );
}
