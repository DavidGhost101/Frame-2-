/**
 * Structured Logger
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const currentLevel = process.env.NODE_ENV === 'production' ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG;

class Logger {
  static formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    return {
      timestamp,
      level,
      message,
      ...(Object.keys(meta).length ? { meta } : {})
    };
  }

  static debug(message, meta = {}) {
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      console.debug(JSON.stringify(this.formatMessage('DEBUG', message, meta)));
    }
  }

  static info(message, meta = {}) {
    if (currentLevel <= LOG_LEVELS.INFO) {
      console.log(JSON.stringify(this.formatMessage('INFO', message, meta)));
    }
  }

  static warn(message, meta = {}) {
    if (currentLevel <= LOG_LEVELS.WARN) {
      console.warn(JSON.stringify(this.formatMessage('WARN', message, meta)));
    }
  }

  static error(message, meta = {}) {
    if (currentLevel <= LOG_LEVELS.ERROR) {
      console.error(JSON.stringify(this.formatMessage('ERROR', message, meta)));
    }
  }
}

module.exports = Logger;
