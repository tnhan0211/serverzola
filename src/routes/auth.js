const express = require('express');
const router = express.Router();
const { 
  signOut, 
  loginWithEmailAndPassword, 
  registerWithEmail,
  forgotPassword,
  resetPassword,
  verifyEmail,
  refreshAccessToken
} = require('../controllers/auth');
const {isAuthenticated} = require('../middlewares/auth')

// Đăng ký và đăng nhập
router.post('/register', registerWithEmail);
router.post('/login', loginWithEmailAndPassword);
router.post('/signout', isAuthenticated, signOut);

// Quên mật khẩu và xác minh email
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/verify-email', verifyEmail);

// Refresh token
router.post('/refresh-token', refreshAccessToken);

module.exports = router;