class PaginationUtil {
  static parse(query, defaultLimit = 20, maxLimit = 100) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
    const skip = (page - 1) * limit;

    let sort = { createdAt: -1 };
    if (query.sortBy) {
      const order = query.order === 'asc' ? 1 : -1;
      sort = { [query.sortBy]: order };
    }

    return { page, limit, skip, sort };
  }
}

module.exports = PaginationUtil;
