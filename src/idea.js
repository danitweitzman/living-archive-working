import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { createExitSignal, staticServer } from "./shared/server.ts";
import { ask, say } from "./shared/cli.ts";
import { promptGPT } from "./shared/openai.ts";

const app = new Application();
const router = new Router();

router.post("/submit", async (context) => {
    try {
        const body = await context.request.body({ type: "json" }).value;
        const entriesText = body.journal;

        const analyze = await promptGPT(
            `Analyze the idea concept given in the following entry and provide a summary of the primary themes detected in the idea. Here is the idea:\n\n${entriesText}\n\nReturn the theme analysis in a readable format. Do not restate the idea entry or give deep explanations. Simply return the primary themes detected as a list.`,
            { max_tokens: 512, temperature: 0.5 },
        );

        context.response.body = {
            message: "Entry received and analyzed",
            emotionalAnalysis: analyze,
        };
    } catch (error) {
        console.error("Error analyzing entry:", error);
        context.response.status = 500;
        context.response.body = {
            error: "Failed to analyze the entry.",
        };
    }
});

app.use(router.routes());
app.use(router.allowedMethods());

app.use(staticServer);

console.log("\nListening on http://localhost:8000");
await app.listen({ port: 8000, signal: createExitSignal() });
