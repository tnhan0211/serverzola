const express = require('express');
const router = express.Router();
const activityController = require('../controllers/activity');
const { isAuthenticated } = require('../middlewares/auth');

// Cập nhật trạng thái trực tuyến
router.put('/online', isAuthenticated, activityController.updateOnlineStatus);

// Lấy trạng thái hoạt động của một người dùng
router.get('/:user_id', isAuthenticated, activityController.getUserActivity);

// Lấy trạng thái hoạt động của nhiều người dùng
router.post('/batch', isAuthenticated, activityController.getBatchUserActivity);

module.exports = router;
