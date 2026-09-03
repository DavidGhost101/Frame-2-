const userService = require('../services/UserService');
const ApiResponse = require('../utils/apiResponse');

class UserController {
  async getUsers(req, res, next) {
    try {
      const result = await userService.getUsers(req.query);
      return ApiResponse.paginated(
        res,
        'Users retrieved successfully',
        result.users,
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
      const user = await userService.getUserById(req.params.id);
      return ApiResponse.success(res, 'User retrieved successfully', user);
    } catch (err) {
      return ApiResponse.error(res, err.message, 404);
    }
  }

  async updateUserRole(req, res, next) {
    try {
      const { role } = req.body;
      const user = await userService.updateUserRole(req.params.id, role, req.user);
      return ApiResponse.success(res, 'User role updated successfully', user);
    } catch (err) {
      next(err);
    }
  }

  async updateUserStatus(req, res, next) {
    try {
      const { status } = req.body;
      const user = await userService.updateUserStatus(req.params.id, status, req.user);
      return ApiResponse.success(res, 'User status updated successfully', user);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new UserController();
