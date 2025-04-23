const express = require('express');
const router = express.Router();
const {isAuthenticated} = require('../middlewares/auth');
const postController = require('../controllers/posts');
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

// Tạo bài viết mới
router.post('/create', isAuthenticated, uploadMedia, postController.createPost);

// Xoá bài viết
router.delete('/:postId', isAuthenticated, postController.deletePost);

// Cập nhật bài viết
router.put('/:postId', isAuthenticated, uploadMedia, postController.updatePost);

// Like bài viết
router.post('/:postId/like', isAuthenticated, postController.likePost);

// Unlike bài viết
router.delete('/:postId/like', isAuthenticated, postController.unlikePost);

// Thêm comment
router.post('/:postId/comments', isAuthenticated, postController.addComment);

// Xóa comment
router.delete('/:postId/comments/:commentId', isAuthenticated, postController.deleteComment);

// Lấy danh sách comments
router.get('/:postId/comments', isAuthenticated, postController.getComments);
router.get('/me', isAuthenticated, postController.getMyPosts);
router.get('/user/:userId', isAuthenticated, postController.getUserPosts);
router.get('/friends', isAuthenticated, postController.getPostsFriends);
router.get('/newsfeed', isAuthenticated, postController.getNewsFeed);

module.exports = router;