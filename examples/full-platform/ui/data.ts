"use client";

import type { MessageAttachment } from "@polymorfa/browser";
import { useCallback, useEffect, useRef, useState } from "react";

import { callApi } from "../lib/browser/api.js";
import { liveEvents, type LiveHandlers } from "../lib/browser/live-events.js";

export { callApi };

export interface Resource<T> {
  readonly data: T | undefined;
  readonly error: string | undefined;
  readonly loading: boolean;
  readonly reload: () => void;
  readonly setData: (update: (current: T | undefined) => T | undefined) => void;
}

/** Loads a GET route and keeps the result; `reload` refreshes it. */
export function useResource<T>(path: string | null): Resource<T> {
  const [state, setState] = useState<{
    data?: T;
    error?: string;
    loading: boolean;
  }>({ loading: path !== null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true }));
    callApi<T>(path, undefined, { signal: controller.signal })
      .then((data) => setState({ data, loading: false }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        }));
      });
    return () => controller.abort();
  }, [path, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const setData = useCallback(
    (update: (current: T | undefined) => T | undefined) =>
      setState((current) => {
        const data = update(current.data);
        return data === undefined
          ? { loading: current.loading }
          : { ...current, data };
      }),
    [],
  );
  return {
    data: state.data,
    error: state.error,
    loading: state.loading,
    reload,
    setData,
  };
}

/** Follows live events for the component's lifetime. */
export function useLiveEvents(handlers: LiveHandlers): void {
  const latest = useRef(handlers);
  latest.current = handlers;
  const types = Object.keys(handlers).sort().join(",");
  useEffect(() => {
    const proxy: Record<string, (event: never) => void> = {};
    for (const type of types.split(",").filter(Boolean)) {
      proxy[type] = (event: never) =>
        (
          latest.current[type as keyof LiveHandlers] as
            ((event: never) => void) | undefined
        )?.(event);
    }
    return liveEvents.subscribe(proxy as LiveHandlers);
  }, [types]);
}

/** Calls `run` at most once per `ms`, trailing the last call. */
export function useDebounced<T extends unknown[]>(
  run: (...args: T) => void,
  ms: number,
): (...args: T) => void {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback(
    (...args: T) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => latest.current(...args), ms);
    },
    [ms],
  );
}

/** Uploads a file through the JSON media route and returns the attachment. */
export async function uploadFile(
  file: Blob,
  name: string,
  onProgress: (progress: number) => void = () => undefined,
  signal?: AbortSignal,
): Promise<MessageAttachment> {
  onProgress(0.05);
  const data = await toBase64(file);
  onProgress(0.4);
  const attachment = await callApi<MessageAttachment>(
    "/api/desk/media",
    {
      name,
      contentType: file.type || "application/octet-stream",
      data,
    },
    signal === undefined ? {} : { signal },
  );
  onProgress(1);
  return absolute(attachment);
}

function toBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Read failed."));
    reader.readAsDataURL(file);
  });
}

/**
 * The SDK components only render absolute http(s) or blob URLs, so resolve
 * this app's relative media paths against the page origin.
 */
export function absolute(attachment: MessageAttachment): MessageAttachment {
  const resolve = (url: string | undefined) =>
    url === undefined ? undefined : new URL(url, window.location.origin).href;
  const url = resolve(attachment.url);
  const previewUrl = resolve(attachment.previewUrl);
  return {
    ...attachment,
    ...(url === undefined ? {} : { url }),
    ...(previewUrl === undefined ? {} : { previewUrl }),
  };
}

export function newClientId(): string {
  return crypto.randomUUID();
}
