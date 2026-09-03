const { GoogleGenAI } = require('@google/genai');
const config = require('../config');
const listingRepository = require('../repositories/ListingRepository');
const fallbackStore = require('../../../services/fallbackStore');

class AiAdvisorService {
  constructor() {
    this.ai = null;
    if (config.gemini.apiKey || process.env.GEMINI_API_KEY) {
      try {
        this.ai = new GoogleGenAI({ apiKey: config.gemini.apiKey || process.env.GEMINI_API_KEY });
      } catch (e) {
        console.warn('Gemini AI initialization notice:', e.message);
      }
    }
  }

  /**
   * Process Housing Advisor query with Soweto rental market context
   */
  async getAdvice(userQuery) {
    if (!userQuery || typeof userQuery !== 'string') {
      throw new Error('Query string is required.');
    }

    // Retrieve active listings for real context
    let listings = [];
    try {
      listings = await listingRepository.find({ status: 'active' }, 'title suburb monthlyRent propertyType amenities', { limit: 12 });
    } catch (e) {
      listings = fallbackStore.fallbackListings || [];
    }

    const listingSummaries = listings.map(l => 
      `- ${l.title} in ${l.suburb} (R${l.monthlyRent}/mo, ${l.propertyType}, Amenities: ${l.amenities ? l.amenities.join(', ') : 'None'})`
    ).join('\n');

    const systemPrompt = `You are the Soweto Township Housing & Rental Market Advisor on the "Rent A Room Soweto" platform.
You assist room seekers, students, and township tenants finding safe, affordable rooms, backrooms, flatlets, garage conversions, and student accommodation across Soweto (including Dobsonville, Orlando West, Orlando East, Pimville, Diepkloof, Protea Glen, Meadowlands, Dube, Jabavu, Jabulani, Moletsane, Zola, etc.).

Current verified listings available right now in Soweto:
${listingSummaries}

Rental market facts for Soweto:
- Standard single backroom: R1,200 - R1,700/mo.
- Ensuite room with private bathroom: R2,000 - R2,600/mo.
- Garage conversion / 1-bedroom flatlet: R1,800 - R3,200/mo.
- Student accommodation near UJ Soweto Campus / SWGC: R1,900 - R2,800/mo with WiFi & security.
- Standard safety rule: Never pay a deposit before physically viewing the property in person and meeting the landlord.

Answer user questions helpfully, politely, and accurately with practical South African context (ZAR pricing, transport options like Rea Vaya, Metrorail, taxis, safety tips). Keep answers concise, clear, and easy to read.`;

    if (this.ai) {
      try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AI generation timeout')), 3000));
        const aiPromise = this.ai.models.generateContent({
          model: 'gemini-3.7-flash',
          contents: `${systemPrompt}\n\nUser Question: ${userQuery}`
        });

        const response = await Promise.race([aiPromise, timeoutPromise]);

        return {
          answer: response.text,
          model: 'gemini-3.7-flash',
          grounded: true
        };
      } catch (err) {
        console.warn('Gemini API call notice, using contextual advisor fallback:', err.message);
      }
    }

    // Contextual local rule-based fallback if API key is not present or offline
    const q = userQuery.toLowerCase();
    let answer = '';

    if (q.includes('uj') || q.includes('student') || q.includes('campus')) {
      answer = `For students attending the **University of Johannesburg (UJ) Soweto Campus** or SWGC colleges, **Pimville (Zone 4 & 5)** and **Orlando East** are ideal locations. Student accommodation typically ranges from **R1,900 to R2,500/month**, including uncapped WiFi, study space, and prepaid electricity. Check out our verified listings in Pimville!`;
    } else if (q.includes('deposit') || q.includes('scam') || q.includes('safe') || q.includes('warning')) {
      answer = `🛡️ **Soweto Rental Safety Tips:**\n1. **Never pay upfront deposits or viewing fees** before physically inspecting the room and verifying the landlord in person.\n2. All landlords on Rent A Room Soweto undergo OTP phone verification.\n3. Make sure to confirm whether water & prepaid electricity are included in the monthly rent.\n4. Ask if the yard is gated and secured at night.`;
    } else if (q.includes('dobsonville') || q.includes('orlando') || q.includes('diepkloof') || q.includes('protea')) {
      answer = `Prices across Soweto vary by suburb:\n- **Dobsonville & Diepkloof**: High demand, ensuite backrooms range R2,000 – R2,800/mo close to shopping centres and Rea Vaya.\n- **Protea Glen**: Spacious rooms & modern flatlets from R1,500 – R2,400/mo.\n- **Orlando West/East**: Close to Vilakazi St and transport routes, from R1,600 – R2,400/mo.`;
    } else {
      answer = `Welcome to the Soweto Housing Advisor! In Soweto, standard single rooms average **R1,300 - R1,700/mo**, while modern ensuite units and flatlets with private showers range from **R2,000 - R2,800/mo**. You can use the search bar above to filter by your preferred suburb (e.g., Dobsonville, Pimville, Protea Glen) and budget, or check our Budget Calculator!`;
    }

    return {
      answer,
      model: 'contextual_advisor',
      grounded: true
    };
  }
}

module.exports = new AiAdvisorService();
