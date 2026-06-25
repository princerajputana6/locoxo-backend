// AI service powered by Claude (Anthropic). Dynamic import keeps the backend
// booting even before `@anthropic-ai/sdk` is installed.

let clientPromise = null;

const MODEL = process.env.AI_MODEL || 'claude-opus-4-8';

const isConfigured = () =>
    process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes('Paste');

const getClient = async () => {
    if (!clientPromise) {
        const { default: Anthropic } = await import('@anthropic-ai/sdk');
        clientPromise = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return clientPromise;
};

// Core helper: ask Claude and parse a single JSON object/array out of the reply.
const askClaudeJSON = async ({ system, prompt, maxTokens = 2000 }) => {
    if (!isConfigured()) {
        throw new Error('AI is not configured. Add ANTHROPIC_API_KEY to the backend .env');
    }
    const client = await getClient();

    const response = await client.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        system,
        messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();

    // Be tolerant of markdown fences / surrounding prose.
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    try {
        return JSON.parse(cleaned);
    } catch {
        const match = cleaned.match(/[[{][\s\S]*[\]}]/);
        if (match) return JSON.parse(match[0]);
        throw new Error('AI returned an unparseable response');
    }
};

// Personalised product recommendations for a shopper.
const getProductRecommendations = async ({ profile, catalog }) => {
    const system =
        'You are LOCOXO\'s recommendation engine for a premium streetwear/fashion brand. ' +
        'Recommend products the shopper is most likely to buy. Respond ONLY with JSON.';
    const prompt =
        `Shopper profile:\n${JSON.stringify(profile, null, 2)}\n\n` +
        `Available catalog (id, name, category, price, bestseller):\n${JSON.stringify(catalog, null, 2)}\n\n` +
        'Return JSON: {"recommendations":[{"productId":"...","reason":"short reason"}]} ' +
        'with up to 8 items, ordered by relevance. Only use productIds from the catalog.';
    return askClaudeJSON({ system, prompt });
};

// Stock / demand prediction for inventory planning (admin).
const predictStockNeeds = async ({ products }) => {
    const system =
        'You are a demand-planning analyst for a fashion e-commerce store. ' +
        'Given recent sales velocity and current stock, predict restock needs. Respond ONLY with JSON.';
    const prompt =
        `Products with metrics (id, name, currentStock, unitsSoldLast30d, unitsSoldLast7d):\n` +
        `${JSON.stringify(products, null, 2)}\n\n` +
        'Return JSON: {"predictions":[{"productId":"...","name":"...","riskLevel":"high|medium|low",' +
        '"daysUntilStockout":number,"recommendedReorderQty":number,"insight":"short note"}]} ' +
        'sorted with the most urgent first.';
    return askClaudeJSON({ system, prompt, maxTokens: 3000 });
};

// "You may also like" cross-sell suggestions for a given product.
const getProductSuggestions = async ({ product, catalog }) => {
    const system =
        'You are a fashion stylist building outfit/cross-sell suggestions for LOCOXO. Respond ONLY with JSON.';
    const prompt =
        `Current product:\n${JSON.stringify(product, null, 2)}\n\n` +
        `Catalog (id, name, category, price):\n${JSON.stringify(catalog, null, 2)}\n\n` +
        'Return JSON: {"suggestions":[{"productId":"...","reason":"why it pairs well"}]} with up to 6 items. ' +
        'Only use productIds from the catalog and never suggest the current product itself.';
    return askClaudeJSON({ system, prompt });
};

export { getProductRecommendations, predictStockNeeds, getProductSuggestions, isConfigured };
