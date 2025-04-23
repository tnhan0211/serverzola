const express = require('express');
const router = express.Router();
const { getUserProfile, updateUserProfile, deleteUser, searchUsersByEmail, getProfilePage, getProfileByToken } = require('../controllers/users');
const { isAuthenticated } = require('../middlewares/auth');
const multer = require('multer');

// Tìm kiếm người dùng bằng email (cần đăng nhập)
router.get('/search/email', isAuthenticated, searchUsersByEmail);

// Lấy thông tin người dùng (public)
router.get('/:id', getUserProfile);
router.get('/profile/:id', isAuthenticated, getProfilePage);

// Lấy thông tin trang cá nhân thông qua token
router.get('/profile/me', isAuthenticated, getProfileByToken);

// Cấu hình multer cho avatar (ví dụ: chỉ nhận file ảnh, giới hạn kích thước)
const storage = multer.memoryStorage();
const uploadAvatar = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Giới hạn 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Chỉ chấp nhận file ảnh!'), false);
        }
    }
}).single('avatar'); // Field name trong form-data là 'avatar'

// Cập nhật thông tin người dùng (cần đăng nhập và chỉ người dùng đó mới được sửa)
router.put('/:id', isAuthenticated, uploadAvatar, async (req, res, next) => {
    try {
        const uid = req.params.id;
        const currentUser = req.user; // Lấy thông tin user từ middleware isAuthenticated
        
        // Kiểm tra quyền: chỉ cho phép cập nhật thông tin của chính mình hoặc là admin
        if (currentUser.uid !== uid && currentUser.role !== 'admin' && currentUser.role !== 'super_admin') {
            return res.status(403).json({ error: 'Không có quyền cập nhật thông tin của người dùng khác' });
        }
        
        await updateUserProfile(req, res);
    } catch(error) {
        console.error("Lỗi khi cập nhật thông tin người dùng:", error);
        next(error);
    }
});

// Xóa người dùng (chỉ admin mới có quyền)
router.delete('/:id', isAuthenticated, deleteUser);

module.exports = router;