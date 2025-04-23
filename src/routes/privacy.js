const express = require('express');
const router = express.Router();
const privacyController = require('../controllers/privacy');
const { isAuthenticated } = require('../middlewares/auth');

// Lấy cài đặt quyền riêng tư
router.get('/', isAuthenticated, privacyController.getUserPrivacy);

// Cập nhật cài đặt quyền riêng tư
router.put('/', isAuthenticated, privacyController.updateUserPrivacy);

// Chặn người dùng
router.post('/block', isAuthenticated, privacyController.blockUser);

// Bỏ chặn người dùng
router.post('/unblock', isAuthenticated, privacyController.unblockUser);

// Lấy danh sách người dùng đã chặn
router.get('/blocked', isAuthenticated, privacyController.getBlockedUsers);

module.exports = router;
