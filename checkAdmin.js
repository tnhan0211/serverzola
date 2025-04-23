const { auth } = require('./src/config/firebase');

const checkAdmin = async (uid) => {
  try {
    const userRecord = await auth.getUser(uid);
    const customClaims = userRecord.customClaims;

    if (customClaims && customClaims.isAdmin === true) {
      console.log('Người dùng này là admin');
    } else {
      console.log('Người dùng này không phải là admin');
    }
  } catch (error) {
    console.error('Lỗi khi lấy thông tin người dùng:', error);
  }
};

checkAdmin('9i3cPhfYn5PnS1ppcqjbSQhfmfl1'); // Thay YOUR_USER_ID bằng UID thực tế