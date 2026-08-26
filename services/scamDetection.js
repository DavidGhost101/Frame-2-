// Lightweight heuristics to catch obvious rental scam patterns. This is not
// a substitute for admin review — it just surfaces likely-risky listings
// into the flagged queue in the admin dashboard instead of trying to block
// them outright, since heuristics like this produce false positives.

const SCAM_KEYWORDS = [
  'wire transfer', 'western union', 'moneygram', 'money gram',
  'pay before viewing', 'deposit before viewing', 'pay a deposit to secure',
  'no viewing necessary', 'i am currently out of the country',
  'send money to hold', 'send deposit to reserve', 'agent overseas',
  'crypto', 'bitcoin', 'ethereum', 'send gift card'
];

function scanTextForScamSignals(text) {
  const lower = String(text || '').toLowerCase();
  return SCAM_KEYWORDS.filter((kw) => lower.includes(kw));
}

// Checks a candidate listing against existing listings for signals worth a
// human admin's attention. Returns { flagged, reasons }.
async function evaluateListingForScamSignals(Listing, { title, address, amenities, image, monthlyRent, landlordId }) {
  const reasons = [];

  const textBlob = [title, address, ...(amenities || [])].join(' ');
  const keywordHits = scanTextForScamSignals(textBlob);
  if (keywordHits.length) {
    reasons.push(`Contains suspicious phrase: "${keywordHits[0]}"`);
  }

  if (Number(monthlyRent) > 0 && Number(monthlyRent) < 400) {
    reasons.push('Rent is unusually low for the area, common in bait listings.');
  }

  if (image) {
    const reusedElsewhere = await Listing.findOne({
      image,
      landlordId: { $ne: landlordId }
    }).select('_id').lean();
    if (reusedElsewhere) {
      reasons.push('This exact photo is already used by a different landlord account.');
    }
  }

  return { flagged: reasons.length > 0, reasons };
}

module.exports = { scanTextForScamSignals, evaluateListingForScamSignals };
