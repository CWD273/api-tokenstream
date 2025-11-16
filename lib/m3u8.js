import fetch from "node-fetch";
import { Parser } from "m3u8-parser";
import { info, warn, error } from "./logger.js";
import { isAbsolute, joinUrl } from "./url.js";
import { channels, defaultTokenTtlMs } from "./config.js";

// Fetch playlist and capture final redirected URL + text
export const fetchPlaylistWithRedirect = async (bootstrapUrl) => {
  const resp = await fetch(bootstrapUrl, { redirect: "follow" });
  if (!resp.ok) {
    throw new Error(`Bootstrap fetch failed: ${resp.status}`);
  }
  const finalUrl = resp.url;
  const text = await resp.text();

  info("bootstrap_fetch_ok", { finalUrl, status: resp.status });
  return { finalUrl, text };
};

export const parseM3U8 = (text) => {
  const parser = new Parser();
  parser.push(text);
  parser.end();
  return parser.manifest;
};

// Choose a variant (if master playlist); return { variantUri, chosenIndex }
export const selectVariant = (manifest, baseUrl, preferred = "highest") => {
  const variants = manifest.playlists || [];
  if (!variants.length) return { variantUri: null, chosenIndex: null };

  let chosenIndex = 0;
  if (preferred === "highest") {
    const maxIdx = variants.reduce(
      (best, v, i) => (v.attributes?.BANDWIDTH || 0) > (variants[best].attributes?.BANDWIDTH || 0) ? i : best,
      0
    );
    chosenIndex = maxIdx;
  } else if (preferred === "lowest") {
    const minIdx = variants.reduce(
      (best, v, i) => (v.attributes?.BANDWIDTH || Infinity) < (variants[best].attributes?.BANDWIDTH || Infinity) ? i : best,
      0
    );
    chosenIndex = minIdx;
  } else if (Number.isInteger(preferred)) {
    chosenIndex = Math.max(0, Math.min(preferred, variants.length - 1));
  }

  const uri = variants[chosenIndex].uri;
  const variantUri = isAbsolute(uri) ? uri : joinUrl(baseUrl, uri);

  info("variant_selected", { chosenIndex, variantUri });
  return { variantUri, chosenIndex };
};

// Rewrite a leaf media playlist’s segment URIs to point at our proxy
export const rewriteLeafPlaylist = (text, proxyBase, id) => {
  // A safe rewrite: replace each URI line that looks like segment refs
  // We’ll use a line-wise approach to not disturb tags.
  const lines = text.split("\n");
  const out = lines.map((line) => {
    if (!line || line.startsWith("#")) return line; // keep tags as-is
    // For URI lines, convert to /segment?id=...&u=ENCODED_ORIGINAL
    const encoded = encodeURIComponent(line);
    return `${proxyBase}/segment?id=${encodeURIComponent(id)}&u=${encoded}`;
  });
  return out.join("\n");
};

// Infer expiry if possible; otherwise default TTL
export const inferExpiry = (manifest) => {
  // Heuristic: MEDIA SEQUENCE and target duration can hint segment cadence,
  // but actual token TTL is opaque. Use conservative default.
  const ttl = defaultTokenTtlMs;
  const expiry = Date.now() + ttl;
  return { ttl, expiry };
};

// Build a ready-to-serve leaf playlist text with rewritten segment URLs
export const buildRewrittenLeaf = async ({ finalUrl, text, id, preferredVariant }) => {
  const manifest = parseM3U8(text);

  // If master, select a variant then fetch it
  if (manifest.playlists?.length) {
    const { variantUri } = selectVariant(manifest, finalUrl, preferredVariant);
    const variantResp = await fetch(variantUri, { redirect: "follow" });
    if (!variantResp.ok) throw new Error(`Variant fetch failed: ${variantResp.status}`);
    const variantText = await variantResp.text();
    const { ttl, expiry } = inferExpiry(parseM3U8(variantText));
    const rewritten = rewriteLeafPlaylist(variantText, "", id); // proxy base omitted; api path will be absolute

    return {
      tokenUrl: variantResp.url, // leaf base for segment resolution
      manifestText: variantText,
      rewrittenText: rewritten,
      expiry
    };
  }

  // Already a leaf
  const { ttl, expiry } = inferExpiry(manifest);
  const rewritten = rewriteLeafPlaylist(text, "", id);

  return {
    tokenUrl: finalUrl,
    manifestText: text,
    rewrittenText: rewritten,
    expiry
  };
};
