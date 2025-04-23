const { db } = require('../config/firebase');

/**
 * Cập nhật trạng thái trực tuyến của người dùng
 */
const updateOnlineStatus = async (req, res) => {
  try {
    const user_id = req.user.uid;
    const { is_online } = req.body;
    
    await db.ref(`user_activity/${user_id}`).update({
      is_online: !!is_online,
      last_active: Date.now()
    });
    
    res.status(200).json({ message: 'Trạng thái trực tuyến đã được cập nhật' });
  } catch (error) {
    console.error('Lỗi khi cập nhật trạng thái trực tuyến:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi cập nhật trạng thái trực tuyến' });
  }
};

/**
 * Lấy trạng thái hoạt động của người dùng
 */
const getUserActivity = async (req, res) => {
  try {
    const { user_id } = req.params;
    
    // Kiểm tra người dùng có tồn tại không
    const userSnapshot = await db.ref(`users/${user_id}`).once('value');
    if (!userSnapshot.exists()) {
      return res.status(404).json({ error: 'Người dùng không tồn tại' });
    }
    
    // Lấy trạng thái hoạt động
    const activitySnapshot = await db.ref(`user_activity/${user_id}`).once('value');
    const activity = activitySnapshot.val() || {
      is_online: false,
      last_active: null,
      typing_in: null
    };
    
    res.status(200).json(activity);
  } catch (error) {
    console.error('Lỗi khi lấy trạng thái hoạt động:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi lấy trạng thái hoạt động' });
  }
};

/**
 * Lấy trạng thái hoạt động của nhiều người dùng
 */
const getBatchUserActivity = async (req, res) => {
  try {
    const { user_ids } = req.body;
    
    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'Danh sách người dùng không hợp lệ' });
    }
    
    // Lấy trạng thái hoạt động của nhiều người dùng
    const activityPromises = user_ids.map(id => 
      db.ref(`user_activity/${id}`).once('value')
    );
    
    const activitySnapshots = await Promise.all(activityPromises);
    
    const activities = {};
    activitySnapshots.forEach((snapshot, index) => {
      const user_id = user_ids[index];
      activities[user_id] = snapshot.val() || {
        is_online: false,
        last_active: null,
        typing_in: null
      };
    });
    
    res.status(200).json(activities);
  } catch (error) {
    console.error('Lỗi khi lấy trạng thái hoạt động của nhiều người dùng:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi lấy trạng thái hoạt động của nhiều người dùng' });
  }
};

module.exports = {
  updateOnlineStatus,
  getUserActivity,
  getBatchUserActivity
};
