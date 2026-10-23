"use client";

import { useState, type FormEvent } from "react";
import {
  MessageSquare,
  Send,
  ShieldCheck,
  Stamp,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Textarea } from "@/components/ui/form";
import { useReviews } from "@/components/providers/review-provider";
import { useToast } from "@/components/providers/toast-provider";
import { formatRelative } from "@/lib/format";
import { DEMO_USER } from "@/lib/review-config";
import type { Review } from "@/lib/types";
import { cn } from "@/lib/utils";

export function DiscussionCard({
  review,
  locked,
}: {
  review: Review;
  locked: boolean;
}) {
  const { addComment } = useReviews();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const comments = [...review.comments].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const decisions = comments.filter((comment) => comment.type === "decision").length;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = body.trim();
    if (trimmed.length < 2) {
      setError("Write a comment before posting.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addComment(review.id, trimmed);
      setBody("");
      toast({
        title: "Comment posted",
        description: "Your note is now part of the review discussion and audit trail.",
        variant: "success",
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The comment could not be posted.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Discussion"
        description="Reviewer notes, creator replies and recorded decisions."
        icon={
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
          </span>
        }
        action={
          <div className="flex items-center gap-1.5">
            {decisions > 0 && (
              <Badge className="border-ink-200 bg-ink-50 text-ink-600 normal-case tracking-normal">
                <Stamp className="h-3 w-3" aria-hidden="true" />
                {decisions} {decisions === 1 ? "decision" : "decisions"}
              </Badge>
            )}
            <Badge className="border-line bg-white text-ink-500 normal-case tracking-normal">
              {comments.length} {comments.length === 1 ? "message" : "messages"}
            </Badge>
          </div>
        }
      />

      {comments.length === 0 ? (
        <div className="px-5 py-8 text-center sm:px-6">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-ink-50 text-ink-400">
            <MessageSquare className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <p className="mt-3 text-[13px] font-semibold text-ink-800">
            No messages yet
          </p>
          <p className="mx-auto mt-1 max-w-sm text-[11px] leading-relaxed text-ink-400">
            Add context for the creator or leave a note for the next reviewer.
            Everything here is retained in the audit trail.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line" aria-label="Review discussion">
          {comments.map((comment) => {
            const isDecision = comment.type === "decision";
            return (
              <li
                key={comment.id}
                className={cn(
                  "flex gap-3 px-5 py-4 sm:px-6",
                  isDecision && "bg-ink-50/50",
                )}
              >
                <Avatar name={comment.author} size="sm" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-[12px] font-semibold text-ink-900">
                      {comment.author}
                    </p>
                    <span className="text-[10px] text-ink-400">
                      {comment.role}
                    </span>
                    {isDecision && (
                      <Badge className="border-ink-200 bg-white text-ink-600 normal-case tracking-normal">
                        <Stamp className="h-2.5 w-2.5" aria-hidden="true" />
                        Decision
                      </Badge>
                    )}
                    <span className="ml-auto shrink-0 text-[10px] text-ink-400">
                      {formatRelative(comment.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-ink-600">
                    {comment.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={handleSubmit}
        className="border-t border-line bg-ink-50/30 px-5 py-4 sm:px-6"
      >
        {error && (
          <InlineAlert variant="danger" className="mb-3">
            {error}
          </InlineAlert>
        )}
        <label htmlFor="review-comment" className="sr-only">
          Add a comment
        </label>
        <Textarea
          id="review-comment"
          value={body}
          onChange={(event) => {
            setBody(event.target.value);
            if (error) setError(null);
          }}
          maxLength={2000}
          placeholder={
            locked
              ? "Add a follow-up note for the audit trail…"
              : "Ask the creator a question or explain your decision…"
          }
          className="min-h-[88px] bg-white text-[12px]"
        />
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-[10px] leading-relaxed text-ink-400">
            <ShieldCheck className="h-3 w-3 shrink-0 text-mint-600" aria-hidden="true" />
            {locked
              ? "The decision is final, but follow-up notes are still recorded."
              : `Saved as ${DEMO_USER.name} · ${body.length} / 2,000 characters`}
          </p>
          <Button
            type="submit"
            size="sm"
            loading={busy}
            loadingLabel="Posting…"
            disabled={body.trim().length < 2}
            className="shrink-0 self-end"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            Post comment
          </Button>
        </div>
      </form>
    </Card>
  );
}
