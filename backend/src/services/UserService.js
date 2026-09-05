const userRepository = require('../repositories/UserRepository');
const auditLogRepository = require('../repositories/AuditLogRepository');
const fallbackStore = require('../../../services/fallbackStore');
const appEvents = require('../events/eventEmitter');

class UserService {
  async getUsers(queryParams = {}) {
    const { role, status, keyword, page = 1, limit = 50 } = queryParams;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    try {
      const filter = { isDeleted: { $ne: true } };
      if (role && role !== 'all') filter.role = role;
      if (status && status !== 'all') filter.status = status;
      if (keyword && keyword.trim()) {
        const regex = new RegExp(keyword.trim(), 'i');
        filter.$or = [{ fullName: regex }, { email: regex }, { phone: regex }];
      }

      const [users, total] = await Promise.all([
        userRepository.find(filter, '-password', { skip, limit: limitNum, sort: { createdAt: -1 } }),
        userRepository.count(filter)
      ]);

      if (users && users.length > 0) {
        return { users, total, page: pageNum, limit: limitNum };
      }
    } catch (err) {
      console.warn('DB getUsers notice, falling back to in-memory store:', err.message);
    }

    // Fallback store handling
    let fbList = [...(fallbackStore.fallbackUsers || [])];
    if (role && role !== 'all') {
      fbList = fbList.filter(u => u.role === role);
    }
    if (status && status !== 'all') {
      fbList = fbList.filter(u => u.status === status);
    }
    if (keyword && keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      fbList = fbList.filter(u =>
        (u.fullName && u.fullName.toLowerCase().includes(kw)) ||
        (u.email && u.email.toLowerCase().includes(kw)) ||
        (u.phone && u.phone.includes(kw))
      );
    }

    const total = fbList.length;
    const paginated = fbList.slice(skip, skip + limitNum);
    return { users: paginated, total, page: pageNum, limit: limitNum };
  }

  async getUserById(id) {
    try {
      const user = await userRepository.findById(id, '-password');
      if (user) return user;
    } catch (_) {}

    const fbUser = fallbackStore.getUserById ? fallbackStore.getUserById(id) : null;
    if (fbUser) return fbUser;
    throw new Error('User not found.');
  }

  async updateUserRole(id, role, adminUser = null) {
    let user = null;
    try {
      user = await userRepository.updateById(id, { role });
    } catch (err) {
      console.warn('DB updateUserRole error:', err.message);
    }

    if (!user && fallbackStore.updateUser) {
      user = fallbackStore.updateUser(id, { role });
    }

    if (!user) {
      throw new Error('User not found.');
    }

    if (adminUser) {
      await auditLogRepository.logAction({
        userId: adminUser.userId,
        userRole: adminUser.role || 'ADMIN',
        action: 'UPDATE_USER_ROLE',
        resource: 'User',
        resourceId: id,
        newValue: { role }
      });
    }

    try {
      appEvents.emit('user:updated', { user, userId: String(id), role });
    } catch (_) {}

    return user;
  }

  async updateUserStatus(id, status, adminUser = null) {
    let user = null;
    try {
      user = await userRepository.updateById(id, { status });
    } catch (err) {
      console.warn('DB updateUserStatus error:', err.message);
    }

    if (!user && fallbackStore.updateUser) {
      user = fallbackStore.updateUser(id, { status });
    }

    if (!user) {
      throw new Error('User not found.');
    }

    if (adminUser) {
      await auditLogRepository.logAction({
        userId: adminUser.userId,
        userRole: adminUser.role || 'ADMIN',
        action: 'UPDATE_USER_STATUS',
        resource: 'User',
        resourceId: id,
        newValue: { status }
      });
    }

    try {
      appEvents.emit('user:updated', { user, userId: String(id), status });
    } catch (_) {}

    return user;
  }
}

module.exports = new UserService();
