// idea.ts (cleaned + enhanced)
import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { createExitSignal, staticServer } from "./shared/server.ts";
import { promptGPT } from "./shared/openai.ts";
import { load } from "https://deno.land/std@0.224.0/dotenv/mod.ts";
import { kmeans } from "./shared/kmeans.ts";

const { OPENAI_API_KEY } = await load();

const app = new Application();
const router = new Router();

interface Cluster {
    id: string;
    title: string;
    ideas: string[];
}

let kv = await Deno.openKv(); // no path!

// Middleware
app.use(async (ctx, next) => {
    try {
        await ctx.request.body({ type: "json" }).value;
    } catch {}
    await next();
});

// Routes
router.get("/clusters", async (ctx) => {
    const clusters = await getAllClusters();
    ctx.response.body = { clusters };
});

router.post("/submit", async (ctx) => {
    const body = await ctx.request.body({ type: "json" }).value;
    const journal = body?.journal?.trim();
    if (!journal) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Missing journal input" };
        return;
    }

    const clusters = await getAllClusters();
    const related = await findIdeaConnections(journal, clusters);

    if (related.length > 0) {
        for (const cluster of related) {
            cluster.ideas.push(journal);
            if (cluster.title.startsWith("cluster ")) {
                cluster.title = await generateClusterTitle(cluster.ideas);
            }
            await saveCluster(cluster.id, cluster);
        }
    } else {
        const id = crypto.randomUUID();
        const title = await generateClusterTitle([journal]);
        await saveCluster(id, { id, title, ideas: [journal] });
    }

    const updated = await getAllClusters();
    ctx.response.body = { message: "Idea saved", clusters: updated };
});

router.post("/clear", async (ctx) => {
    for await (const entry of kv.list({ prefix: ["clusters"] })) {
        await kv.delete(entry.key);
    }
    ctx.response.body = { message: "Cleared" };
});

router.post("/embed-cluster", async (ctx) => {
    const { text } = await ctx.request.body({ type: "json" }).value;
    if (!text || typeof text !== "string") {
        ctx.response.status = 400;
        ctx.response.body = { error: "No text provided" };
        return;
    }

    const chunks = text
        .split(/\n{2,}/)
        .map((s) => s.trim())
        .filter((s) => s.length > 30);

    const embeddings = await Promise.all(
        chunks.map(async (chunk) => {
            const res = await fetch("https://api.openai.com/v1/embeddings", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${OPENAI_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    input: chunk,
                    model: "text-embedding-3-small",
                }),
            });
            const json = await res.json();
            return json.data[0].embedding;
        }),
    );

    const k = Math.min(4, chunks.length);
    const result = kmeans(embeddings, k);

    const clusterMap: Record<number, string[]> = {};
    result.clusters.forEach((cid, i) => {
        if (!clusterMap[cid]) clusterMap[cid] = [];
        clusterMap[cid].push(chunks[i]);
    });

    const allClusters = await getAllClusters();

    for (const ideas of Object.values(clusterMap)) {
        const related = await findIdeaConnections(ideas.join(" "), allClusters);

        if (related.length > 0) {
            for (const cluster of related) {
                cluster.ideas.push(...ideas);
                cluster.title = await generateClusterTitle(cluster.ideas);
                await saveCluster(cluster.id, cluster);
            }
        } else {
            const id = crypto.randomUUID();
            const title = await generateClusterTitle(ideas);
            await saveCluster(id, { id, title, ideas });
        }
    }

    const updated = await getAllClusters();
    ctx.response.body = { clusters: updated };
});

app.use(router.routes());
app.use(router.allowedMethods());
app.use(staticServer); // moved here so it doesn't hijack routes

const port = 8000;
console.log(`🚀 Running at http://localhost:${port}`);
await app.listen({ port, signal: createExitSignal() });

// --- UTILITIES ---
async function getAllClusters(): Promise<Cluster[]> {
    const clusters: Cluster[] = [];
    for await (const entry of kv.list({ prefix: ["clusters"] })) {
        const value = entry.value as Cluster;
        clusters.push({
            id: value.id,
            title: value.title || "untitled",
            ideas: value.ideas,
        });
    }
    return clusters;
}

async function saveCluster(id: string, cluster: Cluster): Promise<void> {
    await kv.set(["clusters", id], cluster);
}

async function generateClusterTitle(ideas: string[]): Promise<string> {
    const prompt =
        `Create a short, simple, lowercase title (max 3 words) that summarizes these ideas:\n\n${
            ideas.join(". ")
        }\n\nRules:\n- No punctuation\n- Max 3 words\n- lowercase`;
    const response = await promptGPT(prompt, {
        max_tokens: 10,
        temperature: 0.7,
    });
    return response.trim().toLowerCase();
}

async function findIdeaConnections(
    newIdea: string,
    clusters: Cluster[],
): Promise<Cluster[]> {
    if (clusters.length === 0) return [];
    const prompt =
        `Compare this idea to the following clusters. If related, return matching cluster numbers:\n\nIdea: ${newIdea}\n\n${
            clusters.map((c, i) => `Cluster ${i + 1}: ${c.ideas.join(". ")}`)
                .join("\n\n")
        }\n\nRespond with comma-separated numbers like: 1, 2 or "none".`;
    const response = await promptGPT(prompt, {
        max_tokens: 10,
        temperature: 0.2,
    });
    if (response.toLowerCase().includes("none")) return [];
    const indices = response.split(",").map((n) => parseInt(n.trim()) - 1)
        .filter((i) => !isNaN(i) && i >= 0 && i < clusters.length);
    return indices.map((i) => clusters[i]);
}
