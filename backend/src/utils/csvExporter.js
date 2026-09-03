class CsvExporter {
  static escapeField(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  }

  static toCsv(rows, headers) {
    if (!rows || !rows.length) {
      return headers.map(h => this.escapeField(h.label)).join(',') + '\n';
    }

    const headerLine = headers.map(h => this.escapeField(h.label)).join(',');
    const lines = rows.map(row => {
      return headers.map(h => {
        const val = typeof h.value === 'function' ? h.value(row) : row[h.key];
        return this.escapeField(val);
      }).join(',');
    });

    return [headerLine, ...lines].join('\n');
  }
}

module.exports = CsvExporter;
