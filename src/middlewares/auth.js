const { auth, db } = require('../config/firebase');
const jwt = require('jsonwebtoken');

// Middleware xác thực người dùng
const isAuthenticated = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Không tìm thấy token xác thực' });
    }

    const token = authHeader.split('Bearer ')[1];
    
    // Kiểm tra xem token có trong blacklist không
    const blacklistSnapshot = await db.ref('token_blacklist').orderByChild('token').equalTo(token).once('value');
    if (blacklistSnapshot.exists()) {
      return res.status(401).json({ error: 'Token đã bị thu hồi hoặc hết hạn' });
    }
    
    try {
      // Xác thực JWT token
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
      
      // Kiểm tra thời gian hết hạn
      const now = Math.floor(Date.now() / 1000);
      if (decodedToken.exp && decodedToken.exp < now) {
        return res.status(401).json({ error: 'Token đã hết hạn' });
      }
      
      // Lấy thông tin user từ database
      const userSnapshot = await db.ref(`users/${decodedToken.uid}`).once('value');
      const userData = userSnapshot.val();
      
      if (!userData) {
        return res.status(404).json({ error: 'Không tìm thấy người dùng' });
      }
      
      // Thêm thông tin user vào request
      req.user = {
        uid: decodedToken.uid,
        role: decodedToken.role || userData.role || 'user',
        email: userData.email,
        first_name: userData.first_name,
        last_name: userData.last_name
      };
      
      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Token không hợp lệ' });
      }
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token đã hết hạn' });
      }
      throw error;
    }
  } catch (error) {
    console.error('Lỗi xác thực:', error);
    return res.status(500).json({ error: 'Có lỗi xảy ra trong quá trình xác thực' });
  }
};

// Middleware kiểm tra quyền admin
const checkAdmin = async (req, res, next) => {
  try {
    // Kiểm tra xem đã xác thực chưa
    if (!req.user) {
      return res.status(401).json({ error: 'Chưa xác thực' });
    }
    
    // Kiểm tra quyền admin
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Không có quyền truy cập' });
    }
    
    next();
  } catch (error) {
    console.error('Lỗi kiểm tra quyền admin:', error);
    return res.status(500).json({ error: 'Có lỗi xảy ra' });
  }
};

// Middleware kiểm tra quyền super admin
const checkSuperAdmin = async (req, res, next) => {
  try {
    // Kiểm tra xem đã xác thực chưa
    if (!req.user) {
      return res.status(401).json({ error: 'Chưa xác thực' });
    }
    
    // Kiểm tra quyền super admin
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Không có quyền truy cập' });
    }
    
    next();
  } catch (error) {
    console.error('Lỗi kiểm tra quyền super admin:', error);
    return res.status(500).json({ error: 'Có lỗi xảy ra' });
  }
};

// Middleware kiểm tra quyền truy cập tài nguyên
const checkResourceAccess = (resourceType) => {
  return async (req, res, next) => {
    try {
      // Kiểm tra xem đã xác thực chưa
      if (!req.user) {
        return res.status(401).json({ error: 'Chưa xác thực' });
      }
      
      // Lấy ID của tài nguyên từ params
      const resourceId = req.params.id;
      
      // Nếu là super_admin, cho phép truy cập tất cả
      if (req.user.role === 'super_admin') {
        return next();
      }
      
      // Nếu là admin, kiểm tra quyền truy cập
      if (req.user.role === 'admin') {
        // Lấy thông tin quyền của admin
        const adminSnapshot = await db.ref(`admin_permissions/${req.user.uid}`).once('value');
        const permissions = adminSnapshot.val() || {};
        
        // Kiểm tra quyền truy cập tài nguyên
        if (permissions[resourceType] && permissions[resourceType].access === true) {
          return next();
        }
      }
      
      // Nếu là user thông thường, chỉ cho phép truy cập tài nguyên của chính họ
      if (resourceType === 'users' && resourceId === req.user.uid) {
        return next();
      }
      
      // Kiểm tra quyền truy cập tài nguyên khác (bài đăng, bình luận, v.v.)
      if (resourceType !== 'users') {
        const resourceSnapshot = await db.ref(`${resourceType}/${resourceId}`).once('value');
        const resource = resourceSnapshot.val();
        
        // Nếu tài nguyên thuộc về người dùng hiện tại
        if (resource && resource.user_id === req.user.uid) {
          return next();
        }
        
        // Kiểm tra quyền riêng tư của tài nguyên
        if (resource && resource.visibility === 'public') {
          return next();
        }
        
        // Kiểm tra xem người dùng có trong danh sách được phép truy cập không
        if (resource && resource.allowed_users && resource.allowed_users[req.user.uid]) {
          return next();
        }
      }
      
      return res.status(403).json({ error: 'Không có quyền truy cập tài nguyên này' });
    } catch (error) {
      console.error('Lỗi kiểm tra quyền truy cập tài nguyên:', error);
      return res.status(500).json({ error: 'Có lỗi xảy ra' });
    }
  };
};

module.exports = { 
  isAuthenticated, 
  checkAdmin, 
  checkSuperAdmin,
  checkResourceAccess
};