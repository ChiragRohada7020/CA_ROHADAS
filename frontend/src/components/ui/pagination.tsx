"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  offset: number;
  onOffsetChange: (offset: number) => void;
}

export function Pagination({
  page,
  limit,
  total,
  hasMore,
  offset,
  onOffsetChange,
}: PaginationProps) {
  const totalPages = Math.ceil(total / limit);
  const canGoBack = offset > 0;
  const canGoForward = hasMore;

  return (
    <div className="flex items-center justify-between gap-4 p-4 border-t border-border">
      <div className="text-xs text-muted-foreground">
        Showing {offset + 1} to {Math.min(offset + limit, total)} of {total}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!canGoBack}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={!canGoForward}
          onClick={() => onOffsetChange(offset + limit)}
        >
          Next <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
