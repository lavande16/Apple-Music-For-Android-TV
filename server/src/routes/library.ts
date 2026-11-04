import { Hono } from "hono";
import axios from "axios";
import { getMUT, getBearerToken, ensureBearer, invalidateBearer } from "../auth";
import { logAppleStatusOnError } from "../apple-status";
import { normaliseAlbum, normaliseArtist, normaliseSong, normalisePlaylist } from "./search";

// Library songs have minimal attributes; pull real catalog data from the relationship.
function normaliseLibrarySong(s: any) {
  const cat = s.relationships?.catalog?.data?.[0];
  if (cat) {
    const song = normaliseSong(cat);
    return {
      ...song,
      artistId: song.artistId ?? s.relationships?.artists?.data?.[0]?.id ?? null,
      albumId:  song.albumId  ?? s.relationships?.albums?.data?.[0]?.id  ?? null,
    };
  }
  return normaliseSong(s);
}

function normaliseLibraryPlaylist(p: any) {
  const attr = p.attributes ?? {};
  // Artwork: prefer direct, then catalog relationship, then catalog attributes
  const cat = p.relationships?.catalog?.data?.[0];
  const artworkUrl =
    attr.artwork?.url?.replace("{w}", "500").replace("{h}", "500").replace("{f}", "jpg")
    ?? cat?.attributes?.artwork?.url?.replace("{w}", "500").replace("{h}", "500").replace("{f}", "jpg")
    ?? null;
  return {
    id:          p.id,
    name:        attr.name ?? cat?.attributes?.name ?? "Unknown",
    curatorName: attr.curatorName ?? cat?.attributes?.curatorName ?? "",
    artworkUrl,
    artworkBgColor: attr.artwork?.bgColor ?? cat?.attributes?.artwork?.bgColor ?? null,
    description: attr.description?.short ?? cat?.attributes?.description?.short ?? null,
    playlistType: attr.playlistType ?? null,
  };
}

/** axios.get wrapper: on 401/403, invalidate bearer, re-scrape, then retry once. On 500, logs Apple status. */
async function appleGet(url: string, params: any, mut: string): Promise<any> {
  await ensureBearer();
  try {
    return await axios.get(url, { params, headers: appleHeaders(mut) });
  } catch (e: any) {
    const status = e?.response?.status;
    if (status === 401 || status === 403) {
      console.warn(`[library] Apple returned ${status} — refreshing bearer and retrying`);
      invalidateBearer();
      await ensureBearer();
      return axios.get(url, { params, headers: appleHeaders(mut) });
    }
    if (status === 500) logAppleStatusOnError().catch(() => {});
    throw e;
  }
}

const library = new Hono();

const appleHeaders = (mut: string) => ({
  Authorization: `Bearer ${getBearerToken()}`,
  "Media-User-Token": mut,
  Origin: "https://music.apple.com",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
});

// Prefer the per-request header sent by the Android app, fall back to stored MUT
const resolveMUT = (c: any): string => c.req.header("X-Music-User-Token") || getMUT();

const guard = (c: any): string | null => {
  const mut = resolveMUT(c);
  if (!mut) { c.json({ error: "Music-User-Token not set" }, 401); return null; }
  return mut;
};

// The web library advertises its supported sorts instead of requiring per-song dates.
async function newestLibrarySongs(mut: string) {
  const base = "https://amp-api.music.apple.com/v1/me/library/songs";
  const params = (offset: number, sort?: string) => ({
    platform: "web", limit: 100, offset, meta: "sorts",
    "include[library-songs]": "catalog", "format[resources]": "map", ...(sort ? { sort } : {}),
  });
  const probe = (await appleGet(base, params(0), mut)).data;
  const advertised = probe.meta?.sorts ?? [];
  const hasDateField = advertised.some((s: any) => s.name === "dateAdded" || s.name === "-dateAdded");
  const sort = hasDateField ? "-dateAdded" : advertised.find((s: any) => {
    const key = String(s.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return (key === "dateadded" && s.name.startsWith("-")) ||
      (key === "recentlyadded" && !s.name.startsWith("-")) ||
      ["dateaddeddesc", "dateaddeddescending", "recentlyaddeddesc", "recentlyaddeddescending"].includes(key);
  })?.name;
  if (!sort) throw new Error("No supported newest-addition sort");
  let page = probe.meta?.currentSort === sort ? probe : (await appleGet(base, params(0, sort), mut)).data;
  if (page.meta?.currentSort !== sort) throw new Error("Unconfirmed web library sort");
  const all: any[] = [], seen = new Set<string>(), visited = new Set<string>();
  let received = 0;
  while (true) {
    if (page.meta?.currentSort && page.meta.currentSort !== sort) throw new Error("Changed web library sort");
    const batch = page.data ?? [];
    let fresh = 0;
    for (const ref of batch) {
      const song = page.resources?.["library-songs"]?.[ref.id] ?? page.resources?.songs?.[ref.id] ?? ref;
      if (!ref.id || !song.attributes) throw new Error("Missing web library song resource");
      if (seen.has(ref.id)) continue;
      seen.add(ref.id); fresh++;
      all.push(normaliseSong({ ...song, id: ref.id, type: ref.type || "library-songs" }));
    }
    if (batch.length && !fresh) throw new Error("Repeated web library page");
    received += batch.length;
    if (!page.next) break;
    const next = new URL(page.next, base);
    const offset = Number(next.searchParams.get("offset") ?? received);
    if (!batch.length || next.origin !== new URL(base).origin || next.pathname !== new URL(base).pathname ||
        offset !== received || visited.has(page.next)) throw new Error("Invalid web library continuation");
    visited.add(page.next);
    page = (await appleGet(base, params(offset, sort), mut)).data;
  }
  if (probe.meta?.total != null && all.length < probe.meta.total) throw new Error("Incomplete web library list");
  return { songs: all, songsNewestFirst: true };
}

library.get("/songs", async (c) => {
  const mut = guard(c); if (!mut) return;
  try {
    return c.json(await newestLibrarySongs(mut));
  } catch {
    // A private web API failure must not hide the otherwise readable library.
  }
  try {
    const all: any[] = [];
    let url: string | null = "https://amp-api-edge.music.apple.com/v1/me/library/songs";
    while (url) {
      const res = await (all.length === 0
        ? appleGet(url, { limit: 100, include: "catalog" }, mut)
        : axios.get(url, { headers: appleHeaders(mut) }));
      all.push(...(res.data?.data ?? []));
      url = res.data?.next ? `https://amp-api-edge.music.apple.com${res.data.next}` : null;
    }
    return c.json({ songs: all.map((s: any) => normaliseSong(s)), songsNewestFirst: false });
  } catch (e: any) {
    console.error("[library/songs]", e?.response?.data ?? e.message);
    return c.json({ error: e.message }, 500);
  }
});

library.get("/albums", async (c) => {
  const mut = guard(c); if (!mut) return;
  try {
    const all: any[] = [];
    let url: string | null = "https://amp-api-edge.music.apple.com/v1/me/library/albums";
    while (url && all.length < 2000) {
      const res = await (all.length === 0
        ? appleGet(url, { limit: 100, include: "catalog" }, mut)
        : axios.get(url, { headers: appleHeaders(mut) }));
      all.push(...(res.data?.data ?? []));
      url = res.data?.next ? `https://amp-api-edge.music.apple.com${res.data.next}` : null;
    }
    return c.json({ albums: all.map((a: any) => normaliseAlbum(a)) });
  } catch (e: any) {
    console.error("[library/albums]", e?.response?.data ?? e.message);
    return c.json({ error: e.message }, 500);
  }
});

library.get("/playlists", async (c) => {
  const mut = guard(c); if (!mut) return;
  const limit = Number(c.req.query("limit") ?? "100");
  try {
    const all: any[] = [];
    let url: string | null = "https://amp-api-edge.music.apple.com/v1/me/library/playlists";
    while (url && all.length < 500) {
      const res = await (all.length === 0
        ? appleGet(url, { limit: Math.min(limit, 100), include: "catalog" }, mut)
        : axios.get(url, { headers: appleHeaders(mut) }));
      all.push(...(res.data?.data ?? []));
      url = res.data?.next ? `https://amp-api-edge.music.apple.com${res.data.next}` : null;
    }
    const playlists = all.map((p: any) => normaliseLibraryPlaylist(p));
    return c.json({ playlists });
  } catch (e: any) {
    console.error("[library/playlists]", e?.response?.data ?? e.message);
    return c.json({ error: e.message }, 500);
  }
});

library.get("/artists", async (c) => {
  const mut = guard(c); if (!mut) return;
  try {
    const all: any[] = [];
    let url: string | null = "https://amp-api-edge.music.apple.com/v1/me/library/artists";
    while (url && all.length < 2000) {
      const res = await (all.length === 0
        ? appleGet(url, { limit: 100 }, mut)
        : axios.get(url, { headers: appleHeaders(mut) }));
      all.push(...(res.data?.data ?? []));
      url = res.data?.next ? `https://amp-api-edge.music.apple.com${res.data.next}` : null;
    }
    return c.json({ artists: all.map((a: any) => normaliseArtist(a)) });
  } catch (e: any) {
    console.error("[library/artists]", e?.response?.data ?? e.message);
    return c.json({ error: e.message }, 500);
  }
});

library.get("/recent", async (c) => {
  const mut = guard(c); if (!mut) return;
  try {
    const res = await appleGet("https://amp-api-edge.music.apple.com/v1/me/recent/played", { limit: 20 }, mut);
    const items = (res.data?.data ?? []).map((item: any) => {
      if (item.type === "albums") return { type: "album", ...normaliseAlbum(item) };
      if (item.type === "playlists") return { type: "playlist", ...normalisePlaylist(item) };
      return { type: "song", ...normaliseSong(item) };
    });
    return c.json({ items });
  } catch (e: any) {
    console.error("[library/recent]", e?.response?.data ?? e.message);
    return c.json({ error: e.message }, 500);
  }
});

library.get("/playlists/:id/tracks", async (c) => {
  const mut = guard(c); if (!mut) return;
  const id = c.req.param("id");
  try {
    const { normaliseSong } = await import("./search");
    const { getStorefront } = await import("../auth");
    const songs: any[] = [];

    if (id.startsWith("pl.")) {
      // Catalog/editorial and personal playlists — no include, artistId/albumId fetched lazily by client
      const sf = getStorefront() || "us";
      let offset = 0;
      while (songs.length < 2000) {
        // Do NOT add include=artists,albums here — Apple's catalog playlist-tracks
        // endpoint HANGS (never responds) for editorial playlists when that include is
        // present (verified: 0.7s without, 20s+ timeout with). It made the whole playlist
        // show "no songs". Artist/album ids are resolved lazily by the client instead.
        const res = await axios.get(`https://amp-api-edge.music.apple.com/v1/catalog/${sf}/playlists/${id}/tracks`, {
          params: { limit: 100, offset },
          headers: appleHeaders(mut),
          timeout: 15000,
        });
        const batch = res.data?.data ?? [];
        songs.push(...batch.map((s: any) => normaliseSong(s)));
        if (!res.data?.next || batch.length === 0) break;
        offset += 100;
      }
    } else {
      // User/personal/library playlists — library endpoint with catalog lookup
      let offset = 0;
      while (songs.length < 2000) {
        const res = await axios.get(`https://amp-api-edge.music.apple.com/v1/me/library/playlists/${id}/tracks`, {
          params: { limit: 100, offset, include: "catalog" },
          headers: appleHeaders(mut),
        });
        const batch = res.data?.data ?? [];
        songs.push(...batch.map((s: any) => normaliseLibrarySong(s)));
        if (!res.data?.next || batch.length === 0) break;
        offset += 100;
      }
    }

    return c.json({ songs });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

// ── Writes ────────────────────────────────────────────────────────────────
// Add a catalog item (song / album / music-video / playlist) to the user's library.
// Apple: POST /v1/me/library?ids[<type>]=<id>  (empty body, 202 on success).
library.post("/add", async (c) => {
  const mut = resolveMUT(c);
  const { id, type } = await c.req.json().catch(() => ({} as any));
  if (!mut) return c.json({ error: "no MUT" }, 401);
  if (!id || !type) return c.json({ error: "id and type required" }, 400);
  try {
    await ensureBearer();
    const res = await axios.post(
      `https://amp-api-edge.music.apple.com/v1/me/library`,
      null,
      { params: { [`ids[${type}]`]: id }, headers: appleHeaders(mut) },
    );
    return c.json({ ok: true, status: res.status });
  } catch (e: any) {
    if (e?.response?.status === 401 || e?.response?.status === 403) invalidateBearer();
    console.warn("[library/add] failed:", e?.response?.status, e?.message);
    return c.json({ error: e?.response?.data ?? e.message }, e?.response?.status ?? 500);
  }
});

// Append a song to one of the user's editable library playlists.
// Apple: POST /v1/me/library/playlists/{id}/tracks  body { data:[{ id, type }] }.
library.post("/playlists/:id/tracks/add", async (c) => {
  const mut = resolveMUT(c);
  const playlistId = c.req.param("id");
  const { id, type } = await c.req.json().catch(() => ({} as any));
  if (!mut) return c.json({ error: "no MUT" }, 401);
  if (!id) return c.json({ error: "song id required" }, 400);
  try {
    await ensureBearer();
    const res = await axios.post(
      `https://amp-api-edge.music.apple.com/v1/me/library/playlists/${playlistId}/tracks`,
      { data: [{ id, type: type ?? "songs" }] },
      { headers: { ...appleHeaders(mut), "Content-Type": "application/json" } },
    );
    return c.json({ ok: true, status: res.status });
  } catch (e: any) {
    if (e?.response?.status === 401 || e?.response?.status === 403) invalidateBearer();
    console.warn("[library/playlist-add] failed:", e?.response?.status, e?.message);
    return c.json({ error: e?.response?.data ?? e.message }, e?.response?.status ?? 500);
  }
});

export default library;
