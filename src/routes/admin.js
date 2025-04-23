const express = require("express");
const router = express.Router();
const jwt = require('jsonwebtoken');
const adminController = require("../controllers/admin");
const { isAuthenticated } = require("../middlewares/auth");


// Middleware để kiểm tra quyền super admin
const checkSuperAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  try {

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized token' });
    }
    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await jwt.verify(token, process.env.JWT_SECRET);
    if (decodedToken.role !== 'super_admin') {
      return res.status(403).json({ error: "Không có quyền truy cập" });
    }
    next(); // Cho phép tiếp tục nếu là super admin
  } catch (error) {
    console.error("Lỗi xác thực super admin:", error);
    return res.status(401).json({ error: "Unauthorized" }); // Hoặc 403 Forbidden
  }
};

// Super admin thiết lập custom claims cho người dùng khác (chỉ super admin mới được phép)
router.post("/set-claims", isAuthenticated, checkSuperAdmin, adminController.setAdminClaim);

//Super admin xem danh sách người dùng
router.get('/users', isAuthenticated, checkSuperAdmin, adminController.getAllUsers);

// Cập nhật trạng thái người dùng (admin và super_admin)
router.put('/users/:id/status', isAuthenticated, adminController.updateUserStatus);

// Route thiết lập quyền admin (chỉ super_admin)
router.post('/set-claims', isAuthenticated, adminController.setAdminClaim);

// Route lấy danh sách người dùng (chỉ super_admin)
router.get('/users', isAuthenticated, adminController.getAllUsers);

// Route cập nhật trạng thái người dùng (admin và super_admin)
router.put('/users/:uid/status', isAuthenticated, adminController.updateUserStatus);

// Route xóa mềm người dùng (admin và super_admin)
router.delete('/users/:uid', isAuthenticated, adminController.softDeleteUser);

// Route tạo tài khoản admin nội bộ (chỉ super_admin)
router.post('/internal-admin', isAuthenticated, checkSuperAdmin, adminController.createInternalAdmin);

module.exports = router;