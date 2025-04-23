const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat');
const { isAuthenticated } = require('../middlewares/auth');
const multer = require('multer');

const storage = multer.memoryStorage();
const uploadMedia = multer({
    storage: storage,
    limits: {fileSize: 25 * 1024 * 1024},
    fileFilter: (req, file, cb)=>{
        if(file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')){
            cb(null, true);
        }else{
            cb(new Error('Chỉ chấp nhận file ảnh hoặc video!'), false);
        }
    }
}).single('media');
// Tin nhắn cá nhân
router.post('/private', isAuthenticated, uploadMedia, chatController.sendPrivateMessage);
router.get('/private/:user_id', isAuthenticated, chatController.getPrivateMessages);

// Nhóm chat
router.post('/groups', isAuthenticated, uploadMedia,chatController.createGroupChat);
router.post('/groups/message', isAuthenticated, uploadMedia,chatController.sendGroupMessage);
router.get('/groups/:group_id/messages', isAuthenticated, chatController.getGroupMessages);
router.get('/groups/sent', isAuthenticated, chatController.getRecentGroupChats);
router.get('/groups/joined', isAuthenticated, chatController.getJoinedGroups);
// Trạng thái đang nhập
router.post('/typing', isAuthenticated, chatController.updateTypingStatus);

// Lấy danh sách tin nhắn đã gửi
router.get('/sent', isAuthenticated, chatController.getFriendListMessages);

module.exports = router;