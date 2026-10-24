"use client";

import { useEffect, useState } from "react";

/**
 * Debounce a value.
 *
 * Used for search boxes: without it every keystroke is a request, and a partner
 * typing "GST" would fire three queries and race the responses.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

/**
 * Offset paging state for a list screen.
 *
 * Resetting the offset whenever the filters change is the important part: staying on
 * page 4 of a 1-page result set is the classic way a filtered list appears empty.
 */
export function usePaging(pageSize = 50) {
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<Record<string, string>>({});

  function updateFilter(key: string, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
    setOffset(0);
  }

  function clearFilters() {
    setFilters({});
    setOffset(0);
  }

  const page = Math.floor(offset / pageSize) + 1;

  return {
    offset,
    setOffset,
    limit: pageSize,
    page,
    filters,
    updateFilter,
    clearFilters,
    reset: () => setOffset(0),
  };
}
