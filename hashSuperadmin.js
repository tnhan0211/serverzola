// hashSuperAdminPassword.js
const { auth, db } = require('./src/config/firebase');
const bcrypt = require('bcrypt');

const hashSuperAdminPassword = async () => {
  try {
    // Thông tin tài khoản super admin
    const superAdminEmail = 'lequangnhanbrvt58@gmail.com';
    const superAdminPassword = 'superadmin1'; // Thay đổi

    // Lấy thông tin user từ Authentication
    const userRecord = await auth.getUserByEmail(superAdminEmail);
    const uid = userRecord.uid;

    // Hash mật khẩu
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(superAdminPassword, saltRounds);

    // Lưu mật khẩu hash vào Realtime Database trong bảng users
    await db.ref(`users/${uid}`).update({
      email: superAdminEmail,
      password_hash: passwordHash,
      role: "super_admin" // Thêm trường role để phân biệt
    });

    console.log('Mật khẩu super admin đã được hash và lưu thành công');
  } catch (error) {
    console.error('Lỗi khi hash mật khẩu super admin:', error);
  }
};

hashSuperAdminPassword(); // Gọi hàm để thực thi