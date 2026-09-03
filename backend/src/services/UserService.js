const userRepository = require('../repositories/UserRepository');
const auditLogRepository = require('../repositories/AuditLogRepository');

class UserService {
  async getUsers(queryParams = {}) {
    const { role, status, page = 1, limit = 20 } = queryParams;
    const filter = {};
    if (role) filter.role = role;
    if (status) filter.status = status;

    const skip = (Math.max(1, Number(page)) - 1) * Math.min(100, Number(limit));
    const [users, total] = await Promise.all([
      userRepository.find(filter, '-password', { skip, limit: Number(limit), sort: { createdAt: -1 } }),
      userRepository.count(filter)
    ]);

    return { users, total, page: Number(page), limit: Number(limit) };
  }

  async getUserById(id) {
    const user = await userRepository.findById(id, '-password');
    if (!user) throw new Error('User not found.');
    return user;
  }

  async updateUserRole(id, role, adminUser = null) {
    const user = await userRepository.updateById(id, { role });
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
    return user;
  }

  async updateUserStatus(id, status, adminUser = null) {
    const user = await userRepository.updateById(id, { status });
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
    return user;
  }
}

module.exports = new UserService();
