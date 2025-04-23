const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middlewares/auth');
const notificationController = require('../controllers/notifications');

// Lấy danh sách thông báo
router.get('/', isAuthenticated, notificationController.getNotifications);

// Đánh dấu thông báo đã đọc
router.put('/read', isAuthenticated, notificationController.markAsRead);

// Xóa thông báo
router.delete('/:notification_id', isAuthenticated, notificationController.deleteNotification);

module.exports = router; 