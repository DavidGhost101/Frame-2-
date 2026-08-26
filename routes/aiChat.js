const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Listing = require('../models/Listing');
const fallbackStore = require('../services/fallbackStore');

let genAIClient = null;

function getGenAI() {
  if (!genAIClient && process.env.GEMINI_API_KEY) {
    const { GoogleGenAI } = require('@google/genai');
    genAIClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return genAIClient;
}

// Helper to get active listings summary for grounding the AI with real platform data
async function getActiveListingsContext() {
  try {
    let listings = [];
    if (mongoose.connection.readyState === 1) {
      listings = await Listing.find({ status: 'approved' }).sort({ createdAt: -1 }).limit(15);
    } else {
      listings = fallbackStore.getListings().filter(l => l.status === 'approved').slice(0, 15);
    }
    
    if (!listings || listings.length === 0) return 'Currently, there are newly seeded verified rooms in Soweto.';

    return listings.map(l => 
      `- [ID: ${l._id}] ${l.title} in ${l.suburb} | Rent: R${l.monthlyRent}/mo | Type: ${l.propertyType || 'Room'} | Amenities: ${(l.amenities || []).join(', ') || 'Standard'}`
    ).join('\n');
  } catch (err) {
    return 'Available listings in Soweto (Diepkloof, Orlando, Meadowlands, Dobsonville, Protea Glen, Pimville, etc.).';
  }
}

// POST /api/ai/chat - Multi-turn chat with Google Search grounding
router.post('/chat', async (req, res) => {
  try {
    const { message, history = [], modelType = 'general', enableSearch = true } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'A message prompt is required.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const ai = getGenAI();

    // Select model based on task requirement
    // gemini-3.5-flash for general tasks + search grounding
    // gemini-3.1-pro-preview for complex legal/contract queries
    // gemini-3.1-flash-lite for ultra-fast queries
    let selectedModel = 'gemini-3.5-flash';
    if (modelType === 'complex') {
      selectedModel = 'gemini-3.1-pro-preview';
    } else if (modelType === 'fast') {
      selectedModel = 'gemini-3.1-flash-lite';
    }

    // Get current platform listings context
    const platformListingsContext = await getActiveListingsContext();

    const systemInstruction = `You are the Rent A Room Soweto Housing & Rental AI Advisor, a knowledgeable, empathetic, and culturally aware South African rental expert.
You assist room seekers and landlords in Soweto and Gauteng townships (including Diepkloof, Orlando East/West, Meadowlands, Dobsonville, Protea Glen, Jabulani, Pimville, Dube, Jabavu, Chiawelo, Zola, Naledi, Eldorado Park, Alexandra, Tembisa, etc.).

Your Core Responsibilities:
1. Provide accurate room hunting, pricing (in ZAR / Rands), and neighbourhood advice across Soweto zones.
2. Help users navigate rental safety, spotting scams (e.g. never pay a deposit before physically viewing inside a room, verifying landlord ownership, avoiding suspicious e-wallets).
3. Offer guidance on South African rental law (Rental Housing Act, deposits, notice periods, utilities/prepaid electricity meters, fair wear and tear).
4. Provide local transport advice (Rea Vaya Bus Rapid Transit routes/stations, Metrorail train lines, Metrobus, local taxi ranks like Bree, Noord, Bara Taxi Rank).
5. Ground answers with real-time Google Search data when asked about current municipal updates, transport fares, or general township market trends.
6. Reference real available listings on the Rent A Room platform when helpful.

Current Active Rooms on Rent A Room Platform:
${platformListingsContext}

Style and Tone:
- Professional, welcoming, direct, and conversational.
- Use clear bullet points and bold highlights for readability.
- When quoting currency, always use South African Rand format: "R1,500/month".
- When Google Search is used, synthesize the results naturally and provide actionable takeaways.`;

    if (!apiKey || !ai) {
      // Graceful fallback response when API key is pending configuration in Settings
      const lower = message.toLowerCase();
      let fallbackReply = `Hello! I am the Rent A Room Soweto Housing & Rental AI Advisor.\n\n`;

      if (lower.includes('price') || lower.includes('cost') || lower.includes('average') || lower.includes('rent')) {
        fallbackReply += `### Typical Room Rental Rates in Soweto:\n` +
          `• **Standard Backroom (shared bathroom):** R800 - R1,400 / month\n` +
          `• **Modern Backroom with En-suite (Shower & Toilet):** R1,500 - R2,500 / month\n` +
          `• **Bachelor Flat / Cottage (with kitchenette & private parking):** R2,200 - R3,500 / month\n` +
          `• **Popular Suburbs:** Diepkloof, Orlando East/West, Protea Glen, Meadowlands, Dobsonville, and Pimville.\n\n` +
          `*Tip: Rooms near Rea Vaya routes or Bara Taxi Rank typically carry a slight premium for convenience.*`;
      } else if (lower.includes('scam') || lower.includes('safety') || lower.includes('deposit')) {
        fallbackReply += `### Safety & Scam Protection Rules in South Africa:\n` +
          `1. **Never Pay Upfront:** Never send a deposit via Instant EFT or e-Wallet before viewing the actual room with the landlord.\n` +
          `2. **Verify the Landlord:** Always ask to meet the owner on-site and confirm prepaid meter access.\n` +
          `3. **Demand a Written Lease:** Under the SA Rental Housing Act, you are entitled to a written lease agreement and receipts for all payments.\n` +
          `4. **Rent A Room Verification:** On this platform, landlords verify their cell numbers with SMS OTP to ensure authentic communication.`;
      } else if (lower.includes('transport') || lower.includes('rea vaya') || lower.includes('taxi') || lower.includes('bus')) {
        fallbackReply += `### Transport Connections from Soweto:\n` +
          `• **Rea Vaya BRT:** Trunk routes (T1, T2, T3) connect Thokoza Park, Ellis Park, Joburg CBD, and UJ Kingsway.\n` +
          `• **Bara Taxi Rank (Chris Hani Baragwanath):** Major hub for local taxis to all Soweto zones and Joburg inner city.\n` +
          `• **Metrorail Trains:** Naledi - Johannesburg corridor servicing New Canada, Inhlazane, and Dube stations.\n` +
          `• **Highways:** Easy access via the N12, N1, and Soweto Highway (M1).`;
      } else {
        fallbackReply += `I can help you with:\n` +
          `• Finding available rooms and backrooms in Soweto\n` +
          `• Average rental prices across Diepkloof, Orlando, Protea Glen, and surrounding areas\n` +
          `• Transport routes (Rea Vaya, local taxi ranks, trains)\n` +
          `• Safety tips, lease agreements, and tenant rights under South African law\n\n` +
          `How can I assist your search today?`;
      }

      return res.json({
        reply: fallbackReply,
        sources: [
          { title: "Rental Housing Act - South African Government", uri: "https://www.gov.za" },
          { title: "City of Johannesburg - Rea Vaya BRT", uri: "https://www.joburg.org.za" }
        ],
        searchQueries: ["Soweto room rentals", "Rea Vaya routes Joburg"]
      });
    }

    // Build multi-turn contents array for @google/genai
    const contents = [];

    // Map conversation history
    if (Array.isArray(history) && history.length > 0) {
      for (const turn of history) {
        if (turn && turn.role && turn.content) {
          const geminiRole = (turn.role === 'assistant' || turn.role === 'model') ? 'model' : 'user';
          contents.push({
            role: geminiRole,
            parts: [{ text: String(turn.content) }]
          });
        }
      }
    }

    // Add current user prompt
    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const config = {
      systemInstruction
    };

    // Add Google Search grounding if requested
    if (enableSearch) {
      config.tools = [{ googleSearch: {} }];
    }

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents,
      config
    });

    const reply = response.text || "I'm here to help you find and evaluate rooms in Soweto. Please ask any question about neighbourhoods, pricing, safety, or transport!";

    // Extract Grounding Sources & Search Queries if available
    const sources = [];
    const searchQueries = [];

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (Array.isArray(groundingChunks)) {
      for (const chunk of groundingChunks) {
        if (chunk.web && chunk.web.uri) {
          sources.push({
            title: chunk.web.title || chunk.web.uri.replace(/^https?:\/\//, '').split('/')[0],
            uri: chunk.web.uri
          });
        }
      }
    }

    const webSearchQueries = response.candidates?.[0]?.groundingMetadata?.webSearchQueries;
    if (Array.isArray(webSearchQueries)) {
      searchQueries.push(...webSearchQueries);
    }

    return res.json({
      reply,
      sources,
      searchQueries,
      modelUsed: selectedModel
    });

  } catch (err) {
    console.error('AI Chat Error:', err && err.message ? err.message : err);
    return res.status(500).json({
      error: 'Failed to generate AI response. Please try again.',
      details: err && err.message ? err.message : 'Unknown error'
    });
  }
});

module.exports = router;
