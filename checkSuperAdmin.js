const { auth } = require('./src/config/firebase');

const checkSuperAdmin = async (uid) => {
  try {
    const userRecord = await auth.getUser(uid);
    const customClaims = userRecord.customClaims;

    if (customClaims && customClaims.isSuperAdmin === true) {
      console.log('Người dùng này là super admin');
    } else {
      console.log('Người dùng này không phải là super admin');
    }
  } catch (error) {
    console.error('Lỗi khi lấy thông tin người dùng:', error);
  }
};

checkSuperAdmin('NAlmjzflEaRZQhKWBCvduhznZh22'); // Thay YOUR_USER_ID bằng UID thực tế