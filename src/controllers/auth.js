const { auth, db } = require("../config/firebase");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");

//Check phone number is valid
const validatePhoneNumber = (phone_number) => {
  //slice loai bo ky tu + o dau chuoi
  const phoneDigits = phone_number.startsWith("+")
    ? phone_number.slice(1)
    : phone_number;
  if (phone_number.length > 12) {
    return { isValid: false, message: "The phone number is over 12 digits" };
  } else if (phone_number.length < 10) {
    return {
      isValid: false,
      message: "The phone number is less than 10 digits",
    };
  }
  //check is digit
  if(!/^\d+$/.test(phoneDigits)){
    return {
      isValid: false,
      message: "The phone number must be digits",
    };
  }
  return {isValid: true};
};

// Tạo refresh token và lưu vào cơ sở dữ liệu
const generateRefreshToken = async (uid) => {
  try {
    // Tạo refresh token
    const refreshToken = jwt.sign({ uid }, process.env.JWT_REFRESH_SECRET, {
      expiresIn: '30d' // Refresh token có thời hạn dài hơn
    });

    // Lưu refresh token vào cơ sở dữ liệu
    await db.ref(`user_tokens/${uid}/refresh_tokens`).push({
      token: refreshToken,
      created_at: admin.database.ServerValue.TIMESTAMP,
      expires_at: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 ngày
    });

    return refreshToken;
  } catch (error) {
    console.error("Lỗi tạo refresh token:", error);
    throw error;
  }
};

// Tạo access token
const generateAccessToken = (uid, role) => {
  return jwt.sign(
    { uid, role, iat: Math.floor(Date.now() / 1000) },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

//Sign out
const signOut = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const token = authHeader.split('Bearer ')[1];
    
    try {
      // Xác thực access token
      const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
      const uid = decodedToken.uid;
      
      // Thu hồi refresh token nếu có
      if (refreshToken) {
        const tokensSnapshot = await db.ref(`user_tokens/${uid}/refresh_tokens`).once('value');
        const tokens = tokensSnapshot.val() || {};
        
        // Tìm và xóa refresh token
        Object.entries(tokens).forEach(async ([key, value]) => {
          if (value.token === refreshToken) {
            await db.ref(`user_tokens/${uid}/refresh_tokens/${key}`).remove();
          }
        });
      } else {
        // Nếu không có refresh token cụ thể, xóa tất cả refresh token của user
        await db.ref(`user_tokens/${uid}/refresh_tokens`).remove();
      }
      
      // Thêm token vào blacklist (tùy chọn)
      const tokenExpiry = decodedToken.exp * 1000; // Chuyển từ giây sang mili giây
      await db.ref('token_blacklist').push({
        token: token,
        expires_at: tokenExpiry
      });
      
      res.status(200).json({ message: "Đăng xuất thành công" });
    } catch (error) {
      // Token không hợp lệ hoặc đã hết hạn, vẫn cho phép đăng xuất
      res.status(200).json({ message: "Đăng xuất thành công" });
    }
  } catch (error) {
    console.error("Lỗi đăng xuất:", error);
    res.status(500).json({ error: error.message });
  }
};

// Đăng ký bằng email và mật khẩu
const registerWithEmail = async (req, res) => {
  try {
    const { email, password, phone_number, first_name, last_name, role } = req.body;

    // Validate role - chỉ cho phép các giá trị hợp lệ
    const validRoles = ["user", "admin", "super_admin"];
    const userRole = role && validRoles.includes(role) ? role : "user";

    // Kiểm tra nếu là super_admin, chỉ cho phép tạo bởi super_admin hiện tại
    if (userRole === "super_admin" && (!req.user || req.user.role !== "super_admin")) {
      return res.status(403).json({ 
        error: "Chỉ super admin mới có thể tạo tài khoản super admin khác" 
      });
    }

    // Kiểm tra nếu là admin, chỉ cho phép tạo bởi super_admin
    if (userRole === "admin" && (!req.user || req.user.role !== "super_admin")) {
      return res.status(403).json({ 
        error: "Chỉ super admin mới có thể tạo tài khoản admin" 
      });
    }

    // Validate email
    if(!email) {
      return res.status(400).json({ error: "Email không được để trống" });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Email không đúng định dạng" });
    }

    // Validate password
    if(!password) {
      return res.status(400).json({ error: "Mật khẩu không được để trống" });
    }
    
    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({ error: "Mật khẩu phải có ít nhất 6 ký tự" });
    }
    
    // Validate password complexity (optional)
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ 
        error: "Mật khẩu phải chứa ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt" 
      });
    }

    // Validate first_name
    if(!first_name) {
      return res.status(400).json({ error: "Tên không được để trống" });
    }
    
    if(first_name.length > 50) {
      return res.status(400).json({ error: "Tên không được vượt quá 50 ký tự" });
    }
    
    // Validate last_name
    if(!last_name) {
      return res.status(400).json({ error: "Họ không được để trống" });
    }
    
    if(last_name.length > 50) {
      return res.status(400).json({ error: "Họ không được vượt quá 50 ký tự" });
    }
    
    // Validate name characters
    const nameRegex = /^[a-zA-ZÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼỀỀỂẾưăạảấầẩẫậắằẳẵặẹẻẽềềểếỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪễệỉịọỏốồổỗộớờởỡợụủứừỬỮỰỲỴÝỶỸửữựỳỵỷỹ\s]+$/;
    if (!nameRegex.test(first_name) || !nameRegex.test(last_name)) {
      return res.status(400).json({ error: "Tên và họ chỉ được chứa chữ cái và khoảng trắng" });
    }

    // Validate phone_number
    if(!phone_number) {
      return res.status(400).json({ error: "Số điện thoại không được để trống" });
    }
    
    const phone_number_validation = validatePhoneNumber(phone_number);
    if(!phone_number_validation.isValid){
      return res.status(400).json({ error: phone_number_validation.message });
    }
    
    // Tạo user trong Authentication
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: `${first_name} ${last_name}`,
      emailVerified: false,
    });

    const uid = userRecord.uid;

    // Hash password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Lưu thông tin user vào database
    const userData = {
      user_id: uid,
      email,
      first_name,
      last_name,
      phone_number, // Lưu số điện thoại vào database
      password_hash,
      role: userRole,
      status: "active", // Thêm trường status mặc định là active
      createdAt: admin.database.ServerValue.TIMESTAMP,
      updated_at: admin.database.ServerValue.TIMESTAMP,
    };

    // Lưu vào bảng users
    await db.ref(`users/${uid}`).set(userData);

    res.status(201).json({ 
      message: "Đăng ký thành công", 
      uid,
      role: userRole
    });
  } catch (error) {
    console.error("Lỗi đăng ký:", error);
    if (error.code === "auth/email-already-exists") {
      return res
        .status(409)
        .json({ error: "Email này đã được đăng ký trước đó" });
    }
    if (error.code === "auth/invalid-email") {
      return res.status(400).json({ error: "Email không hợp lệ" });
    }
    if (error.code === "auth/weak-password") {
      return res.status(400).json({ error: "Mật khẩu quá yếu" });
    }
    res.status(500).json({ error: error.message });
  }
};

// Đăng nhập bằng email và mật khẩu (cho admin và super admin)
const loginWithEmailAndPassword = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Tìm user theo email
    const userRecord = await auth.getUserByEmail(email);
    console.log("User record từ Authentication", userRecord);

    const uid = userRecord.uid;

    // Lấy thông tin user từ database
    const userSnapshot = await db.ref(`users/${uid}`).once('value');
    const userData = userSnapshot.val();
    console.log("User data từ Realtime Database", userData);

    if (!userData) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    }

    // Kiểm tra trạng thái người dùng
    if (userData.status === 'banned') {
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa vĩnh viễn' });
    }
    
    if (userData.status === 'suspended') {
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị tạm khóa' });
    }

    // So sánh mật khẩu
    const isPasswordValid = await bcrypt.compare(password, userData.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }

    // Cập nhật thời gian đăng nhập cuối
    await db.ref(`users/${uid}`).update({
      last_login: admin.database.ServerValue.TIMESTAMP
    });

    // Tạo access token và refresh token
    const accessToken = generateAccessToken(uid, userData.role || 'user');
    const refreshToken = await generateRefreshToken(uid);

    res.status(200).json({
      accessToken,
      refreshToken,
      user: {
        uid,
        email: userData.email,
        first_name: userData.first_name,
        last_name: userData.last_name,
        role: userData.role || 'user',
        status: userData.status || 'active'
      }
    });
  } catch (error) {
    console.error("Lỗi đăng nhập (email):", error);
    if (
      error.code === "auth/user-not-found" ||
      error.code === "auth/wrong-password"
    ) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    res.status(500).json({ error: "Có lỗi xảy ra, vui lòng thử lại sau" });
  }
};

// Gửi email đặt lại mật khẩu
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email không được để trống" });
    }

    // Kiểm tra email có tồn tại trong hệ thống không
    try {
      await auth.getUserByEmail(email);
    } catch (error) {
      // Không thông báo email không tồn tại để tránh lộ thông tin
      return res.status(200).json({ 
        message: "Nếu email tồn tại trong hệ thống, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu" 
      });
    }

    // Tạo link đặt lại mật khẩu
    const actionCodeSettings = {
      url: process.env.PASSWORD_RESET_URL || 'http://localhost:3000/reset-password',
      handleCodeInApp: true
    };

    await auth.sendPasswordResetEmail(email, actionCodeSettings);

    res.status(200).json({ 
      message: "Email hướng dẫn đặt lại mật khẩu đã được gửi" 
    });
  } catch (error) {
    console.error("Lỗi gửi email đặt lại mật khẩu:", error);
    res.status(500).json({ error: "Có lỗi xảy ra, vui lòng thử lại sau" });
  }
};

// Xác minh email
const verifyEmail = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email không được để trống" });
    }

    // Kiểm tra email có tồn tại trong hệ thống không
    try {
      await auth.getUserByEmail(email);
    } catch (error) {
      return res.status(404).json({ error: "Email không tồn tại trong hệ thống" });
    }

    // Tạo link xác minh email
    const actionCodeSettings = {
      url: process.env.EMAIL_VERIFICATION_URL || 'http://localhost:5000/verify-email',
      handleCodeInApp: true
    };

    await auth.sendEmailVerificationLink(email, actionCodeSettings);

    res.status(200).json({ 
      message: "Email xác minh đã được gửi" 
    });
  } catch (error) {
    console.error("Lỗi gửi email xác minh:", error);
    res.status(500).json({ error: "Có lỗi xảy ra, vui lòng thử lại sau" });
  }
};

// Đặt lại mật khẩu (sau khi đã xác thực token từ email)
const resetPassword = async (req, res) => {
  try {
    const { oobCode, newPassword } = req.body;
    
    if (!oobCode || !newPassword) {
      return res.status(400).json({ 
        error: "Thiếu mã xác thực hoặc mật khẩu mới" 
      });
    }
    
    // Kiểm tra độ mạnh của mật khẩu
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        error: "Mật khẩu phải có ít nhất 6 ký tự" 
      });
    }

    // Xác thực mã OOB và lấy email
    const { email } = await auth.verifyPasswordResetCode(oobCode);
    
    // Đặt lại mật khẩu
    await auth.confirmPasswordReset(oobCode, newPassword);
    
    // Lấy thông tin user từ email
    const userRecord = await auth.getUserByEmail(email);
    const uid = userRecord.uid;
    
    // Hash mật khẩu mới để lưu vào database
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(newPassword, saltRounds);
    
    // Cập nhật mật khẩu trong database
    await db.ref(`users/${uid}`).update({
      password_hash,
      updated_at: admin.database.ServerValue.TIMESTAMP
    });
    
    res.status(200).json({ 
      message: "Mật khẩu đã được đặt lại thành công" 
    });
  } catch (error) {
    console.error("Lỗi đặt lại mật khẩu:", error);
    
    if (error.code === 'auth/expired-action-code') {
      return res.status(400).json({ error: "Mã xác thực đã hết hạn" });
    }
    if (error.code === 'auth/invalid-action-code') {
      return res.status(400).json({ error: "Mã xác thực không hợp lệ" });
    }
    if (error.code === 'auth/user-disabled') {
      return res.status(400).json({ error: "Tài khoản đã bị vô hiệu hóa" });
    }
    if (error.code === 'auth/user-not-found') {
      return res.status(400).json({ error: "Không tìm thấy tài khoản" });
    }
    
    res.status(500).json({ error: "Có lỗi xảy ra, vui lòng thử lại sau" });
  }
};

// Làm mới access token bằng refresh token
const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token không được để trống" });
    }
    
    // Xác thực refresh token
    let decodedToken;
    try {
      decodedToken = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
      return res.status(401).json({ error: "Refresh token không hợp lệ hoặc đã hết hạn" });
    }
    
    const uid = decodedToken.uid;
    
    // Kiểm tra xem refresh token có tồn tại trong cơ sở dữ liệu không
    const tokensSnapshot = await db.ref(`user_tokens/${uid}/refresh_tokens`).once('value');
    const tokens = tokensSnapshot.val() || {};
    
    let validTokenFound = false;
    let tokenKey = null;
    
    // Tìm refresh token trong danh sách
    Object.entries(tokens).forEach(([key, value]) => {
      if (value.token === refreshToken && value.expires_at > Date.now()) {
        validTokenFound = true;
        tokenKey = key;
      }
    });
    
    if (!validTokenFound) {
      return res.status(401).json({ error: "Refresh token không tồn tại hoặc đã hết hạn" });
    }
    
    // Lấy thông tin user
    const userSnapshot = await db.ref(`users/${uid}`).once('value');
    const userData = userSnapshot.val();
    
    if (!userData) {
      return res.status(404).json({ error: "Không tìm thấy người dùng" });
    }
    
    // Tạo access token mới
    const newAccessToken = generateAccessToken(uid, userData.role || "user");
    
    // Tùy chọn: Tạo refresh token mới (rotation) để tăng cường bảo mật
    const newRefreshToken = await generateRefreshToken(uid);
    
    // Xóa refresh token cũ
    await db.ref(`user_tokens/${uid}/refresh_tokens/${tokenKey}`).remove();
    
    res.status(200).json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 3600 // 1 giờ tính bằng giây
    });
    
  } catch (error) {
    console.error("Lỗi làm mới token:", error);
    res.status(500).json({ error: "Có lỗi xảy ra, vui lòng thử lại sau" });
  }
};

module.exports = {
  signOut,
  loginWithEmailAndPassword,
  registerWithEmail,
  forgotPassword,
  resetPassword,
  verifyEmail,
  refreshAccessToken
};
