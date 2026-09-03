const listingRepository = require('../repositories/ListingRepository');
const roomRequestRepository = require('../repositories/RoomRequestRepository');
const auditLogRepository = require('../repositories/AuditLogRepository');
const CsvExporter = require('../utils/csvExporter');
const Landlord = require('../models/Landlord');

class ReportService {
  /**
   * Export listings as CSV
   */
  async exportListingsCsv() {
    const listings = await listingRepository.find({}, null, { sort: { createdAt: -1 } });
    const headers = [
      { label: 'Listing ID', key: '_id' },
      { label: 'Title', key: 'title' },
      { label: 'Suburb', key: 'suburb' },
      { label: 'Address', key: 'address' },
      { label: 'Monthly Rent (ZAR)', key: 'monthlyRent' },
      { label: 'Property Type', key: 'propertyType' },
      { label: 'Status', key: 'status' },
      { label: 'Source', key: 'source' },
      { label: 'Contact Inquiries', key: 'contactCount' },
      { label: 'Date Added', value: (row) => row.createdAt ? new Date(row.createdAt).toISOString() : '' }
    ];

    return CsvExporter.toCsv(listings, headers);
  }

  /**
   * Export room requests as CSV
   */
  async exportRoomRequestsCsv() {
    const requests = await roomRequestRepository.find({}, null, { sort: { createdAt: -1 } });
    const headers = [
      { label: 'Request ID', key: '_id' },
      { label: 'Seeker Name', key: 'seekerName' },
      { label: 'Phone', key: 'phone' },
      { label: 'Suburb', key: 'suburb' },
      { label: 'Max Budget (ZAR)', key: 'maxBudget' },
      { label: 'Room Type', key: 'roomType' },
      { label: 'Occupation', key: 'occupation' },
      { label: 'Status', key: 'status' },
      { label: 'Contact Count', key: 'contactCount' },
      { label: 'Date Posted', value: (row) => row.createdAt ? new Date(row.createdAt).toISOString() : '' }
    ];

    return CsvExporter.toCsv(requests, headers);
  }

  /**
   * Export audit log history as CSV
   */
  async exportAuditLogsCsv() {
    const logs = await auditLogRepository.find({}, null, { sort: { createdAt: -1 }, limit: 500 });
    const headers = [
      { label: 'Timestamp', value: (row) => row.createdAt ? new Date(row.createdAt).toISOString() : '' },
      { label: 'User Role', key: 'userRole' },
      { label: 'Action', key: 'action' },
      { label: 'Resource', key: 'resource' },
      { label: 'Resource ID', key: 'resourceId' },
      { label: 'Status', key: 'status' },
      { label: 'IP Address', key: 'ipAddress' }
    ];

    return CsvExporter.toCsv(logs, headers);
  }
}

module.exports = new ReportService();
