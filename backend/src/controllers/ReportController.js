const reportService = require('../services/ReportService');
const auditLogRepository = require('../repositories/AuditLogRepository');
const ApiResponse = require('../utils/apiResponse');

class ReportController {
  async exportListingsCsv(req, res, next) {
    try {
      const csvData = await reportService.exportListingsCsv();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="soweto-room-listings.csv"');
      return res.status(200).send(csvData);
    } catch (err) {
      next(err);
    }
  }

  async exportRoomRequestsCsv(req, res, next) {
    try {
      const csvData = await reportService.exportRoomRequestsCsv();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="soweto-room-seekers.csv"');
      return res.status(200).send(csvData);
    } catch (err) {
      next(err);
    }
  }

  async exportAuditLogsCsv(req, res, next) {
    try {
      const csvData = await reportService.exportAuditLogsCsv();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="audit-trail-logs.csv"');
      return res.status(200).send(csvData);
    } catch (err) {
      next(err);
    }
  }

  async getRecentAuditLogs(req, res, next) {
    try {
      const logs = await auditLogRepository.findRecent(50);
      return ApiResponse.success(res, 'Audit logs retrieved', logs);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ReportController();
