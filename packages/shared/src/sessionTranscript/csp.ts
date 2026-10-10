/**
 * CSP sources for a transcript page's inline scripts (the renderer's theme boot script):
 * the page is served with `script-src 'self'` plus exactly these hashes.
 */
import { sha256 } from "@noble/hashes/sha2";

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const match of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    const attributes = match[1] ?? "";
    // JSON payloads never execute; external scripts are covered by 'self'.
    if (/\bsrc=|\btype="application\/json"/.test(attributes)) continue;
    hashes.push(`'sha256-${base64(sha256(new TextEncoder().encode(match[2] ?? "")))}'`);
  }
  return hashes;
}
