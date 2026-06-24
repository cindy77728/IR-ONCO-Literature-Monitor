// Optional Cloudflare Worker example for automatic summaries.
// Keep OPENAI_API_KEY as a Worker secret. Do not paste it into the HTML app.
//
// The HTML app sends:
//   POST /summarize
//   { "prompt": "...", "article": { "pmid": "...", "title": "...", ... } }
//
// This worker returns:
//   { "keyMessage": "...", "summary": "..." }

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Use POST." }, 405);
    }

    const body = await request.json();
    const prompt = [
      body.prompt || "",
      "",
      "Return only JSON with exactly these keys:",
      '{ "keyMessage": "one sentence clinical takeaway, not demographics or inclusion criteria", "summary": "short clinician-facing summary with study type, population, main result, clinical relevance, and limitation" }',
      "",
      "Prioritize conclusion, outcomes, efficacy, safety, novelty, and practical relevance. Do not use patient criteria or sample-size description as the key message unless that is the main finding."
    ].join("\n");

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || "gpt-4.1-mini",
        input: prompt,
        text: { format: { type: "text" } }
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      return jsonResponse({ error: errorText }, openaiResponse.status);
    }

    const data = await openaiResponse.json();
    const text =
      data.output_text ||
      data.output?.flatMap((item) => item.content || [])
        .find((part) => part.type === "output_text")?.text ||
      "";

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { keyMessage: "", summary: text };
    }

    return jsonResponse({
      keyMessage: parsed.keyMessage || parsed.key_message || "",
      summary: parsed.summary || parsed.notes || ""
    });
  }
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders()
    }
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
