/**
 * Getting the OpenAPI document to score: from text (JSON or YAML), a file or
 * a URL. Only the document itself is read; $refs to other documents are
 * never followed.
 */
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { importOpenApi } from "./convert.js";

export const MAX_SPEC_BYTES = 10 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 15_000;

type Json = Record<string, unknown>;

export interface LoadedSpec {
  doc?: Json;
  /** The file path or the URL the document came from (after redirects). */
  source?: string;
  /** The document as read, for writing a fixed copy in the same format. */
  text?: string;
  error?: string;
}

/** JSON or YAML text → the document, or why it isn't one. */
export function parseSpecText(text: string): { doc?: Json; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { error: "The spec is empty." };
  let doc: unknown;
  try {
    doc = trimmed.startsWith("{") ? JSON.parse(trimmed) : parseYaml(trimmed, { maxAliasCount: 100 });
  } catch (error) {
    return { error: `The spec isn't valid ${trimmed.startsWith("{") ? "JSON" : "YAML"}: ${(error as Error).message.split("\n")[0]}` };
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { error: "That isn't an OpenAPI document: expected a JSON or YAML object." };
  return { doc: doc as Json };
}

/** The document is OpenAPI 3.0 or 3.1, or why not. */
export function specProblem(doc: Json): string | null {
  try {
    // Throws its own message for Swagger 2.0 and other versions.
    importOpenApi({ ...doc, paths: {} });
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

const isUrl = (input: string) => /^https?:\/\//i.test(input);

async function readUrl(url: string, fetcher: typeof fetch): Promise<{ text?: string; source?: string; error?: string }> {
  let response: Response;
  try {
    response = await fetcher(url, {
      headers: { accept: "application/json, application/yaml, text/yaml, text/plain;q=0.8, */*;q=0.5" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    return { error: `Couldn't fetch ${url}: ${(error as Error).message}` };
  }
  if (!response.ok) return { error: `${url} answered HTTP ${response.status}.` };
  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_SPEC_BYTES) return { error: `${url} is larger than ${MAX_SPEC_BYTES} bytes.` };
  return { text, source: response.url || url };
}

async function readPath(path: string): Promise<{ text?: string; source?: string; error?: string }> {
  try {
    return { text: await readFile(path, "utf8"), source: path };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { error: code === "ENOENT" ? `No such file: ${path}` : `Couldn't read ${path}: ${(error as Error).message}` };
  }
}

/** A file path or an http(s) URL → the OpenAPI document to score. */
export async function loadSpec(input: string, fetcher: typeof fetch = fetch): Promise<LoadedSpec> {
  const read = isUrl(input) ? await readUrl(input, fetcher) : await readPath(input);
  if (read.error) return { error: read.error };
  const parsed = parseSpecText(read.text!);
  if (parsed.error) return { error: parsed.error };
  const problem = specProblem(parsed.doc!);
  return problem ? { error: problem } : { doc: parsed.doc, source: read.source, text: read.text };
}
