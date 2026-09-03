const EventEmitter = require('events');
const Logger = require('../utils/logger');

class AppEventEmitter extends EventEmitter {}

const appEvents = new AppEventEmitter();

// Event hooks
appEvents.on('listing:created', (listing) => {
  Logger.info(`Event: listing:created -> ID: ${listing._id}, Title: "${listing.title}" in ${listing.suburb}`);
});

appEvents.on('listing:flagged', ({ listingId, reasons }) => {
  Logger.warn(`Event: listing:flagged -> ID: ${listingId}`, { reasons });
});

appEvents.on('user:login', ({ userId, role, ipAddress }) => {
  Logger.info(`Event: user:login -> User: ${userId}, Role: ${role}, IP: ${ipAddress}`);
});

module.exports = appEvents;
