const express = require('express');
const router = express.Router();
const { 
  sendFriendRequest, 
  acceptFriendRequest, 
  rejectFriendRequest, 
  unfriend, 
  getFriendsList, 
  getFriendRequests,
  checkFriendshipStatus,
  deleteFriendRequest,
} = require('../controllers/friend');
const { isAuthenticated } = require('../middlewares/auth');

// Tất cả các routes đều yêu cầu xác thực
router.use(isAuthenticated);

// Gửi, chấp nhận, từ chối lời mời kết bạn và hủy kết bạn
router.post('/request', sendFriendRequest);
router.post('/accept', acceptFriendRequest);
router.post('/reject', rejectFriendRequest);
router.post('/unfriend', unfriend);
router.post('/delete', deleteFriendRequest);

// Lấy danh sách bạn bè và lời mời kết bạn
router.get('/list', getFriendsList);
router.get('/list/:userId', getFriendsList);
router.get('/requests', getFriendRequests);

// Kiểm tra trạng thái kết bạn
router.get('/status/:targetUserId', checkFriendshipStatus);

module.exports = router;
