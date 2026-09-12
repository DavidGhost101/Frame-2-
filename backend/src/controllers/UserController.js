const userService = require('../services/UserService');
const ApiResponse = require('../utils/apiResponse');
const { serializeUser } = require('../utils/securitySanitizer');

class UserController {
  async getUsers(req, res, next) {
    try {
      const isPrivileged = Boolean(req.user && (req.user.admin || req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN'));
      const result = await userService.getUsers(req.query);
      const safeUsers = (result.users || []).map(u => serializeUser(u, isPrivileged));
      return ApiResponse.paginated(
        res,
        'Users retrieved successfully',
        safeUsers,
        result.page,
        result.limit,
        result.total
      );
    } catch (err) {
      next(err);
    }
  }

  async getUserById(req, res, next) {
    try {
      const isPrivileged = Boolean(req.user && (req.user.admin || req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN'));
      const user = await userService.getUserById(req.params.id);
      const safeUser = serializeUser(user, isPrivileged);
      return ApiResponse.success(res, 'User retrieved successfully', safeUser);
    } catch (err) {
      return ApiResponse.error(res, err.message, 404);
    }
  }

  async updateUserRole(req, res, next) {
    try {
      const { role } = req.body;
      const user = await userService.updateUserRole(req.params.id, role, req.user);
      const safeUser = serializeUser(user, true);
      return ApiResponse.success(res, 'User role updated successfully', safeUser);
    } catch (err) {
      next(err);
    }
  }

  async updateUserStatus(req, res, next) {
    try {
      const { status } = req.body;
      const user = await userService.updateUserStatus(req.params.id, status, req.user);
      const safeUser = serializeUser(user, true);
      return ApiResponse.success(res, 'User status updated successfully', safeUser);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new UserController();
