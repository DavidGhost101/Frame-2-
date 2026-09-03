/**
 * Scam & Fraud Detection Service
 * Evaluates listing text and pricing anomalies to protect room seekers
 */

class ScamDetectionService {
  static evaluate(listingData) {
    const reasons = [];
    const text = `${listingData.title || ''} ${listingData.address || ''} ${(listingData.amenities || []).join(' ')}`.toLowerCase();

    // 1. Upfront Deposit / Scam Keywords
    const scamPhrases = [
      'deposit before viewing',
      'send money before',
      'e-wallet first',
      'ewallet first',
      'courier keys',
      'agent fee upfront',
      'western union',
      'moneygram',
      'bitcoin',
      'crypto',
      'pay before you see'
    ];

    for (const phrase of scamPhrases) {
      if (text.includes(phrase)) {
        reasons.push(`Suspicious payment instruction detected: "${phrase}"`);
      }
    }

    // 2. Suspicious Price / Type mismatch (e.g. 2-bedroom ensuite apartment under R500)
    const rent = Number(listingData.monthlyRent);
    if (rent > 0 && rent < 400 && (listingData.propertyType === 'Apartment' || listingData.propertyType === 'Ensuite')) {
      reasons.push('Unusually low rent for property type (potential bait listing)');
    }

    return {
      flagged: reasons.length > 0,
      reasons,
      score: reasons.length * 25
    };
  }
}

module.exports = ScamDetectionService;
