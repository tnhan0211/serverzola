const { db } = require('../config/firebase');
const { getIO } = require('../config/socket');

// Tạo thông báo mới
const createNotification = async (userId, notificationData) => {
  try {
    const notificationRef = db.ref(`notifications/${userId}`).push();
    const notification = {
      id: notificationRef.key,
      ...notificationData,
      is_read: false,
      create_at: Date.now()
    };

    await notificationRef.set(notification);

    // Gửi thông báo realtime qua socket
    try {
      const io = getIO();
      io.to(userId).emit('new_notification', notification);
    } catch (error) {
      console.error('Socket.IO error:', error);
    }

    return notification;
  } catch (error) {
    console.error('Lỗi khi tạo thông báo:', error);
    throw error;
  }
};

// Lấy danh sách thông báo
const getNotifications = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { limit = 20, startAfter } = req.query;

    let notificationsRef = db.ref(`notifications/${userId}`);
    
    // Sắp xếp theo thời gian tạo giảm dần
    notificationsRef = notificationsRef.orderByChild('create_at');
    
    if (startAfter) {
      notificationsRef = notificationsRef.endAt(parseInt(startAfter));
    }
    
    notificationsRef = notificationsRef.limitToLast(parseInt(limit));

    const snapshot = await notificationsRef.once('value');
    const notifications = [];
    
    snapshot.forEach(childSnapshot => {
      notifications.push({
        id: childSnapshot.key,
        ...childSnapshot.val()
      });
    });

    // Sắp xếp theo thời gian giảm dần
    notifications.sort((a, b) => b.create_at - a.create_at);

    let nextCursor = null;
    if (notifications.length === parseInt(limit)) {
      nextCursor = notifications[notifications.length - 1].create_at;
    }

    res.status(200).json({
      notifications,
      pagination: {
        next_cursor: nextCursor,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách thông báo:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi lấy thông báo' });
  }
};

// Đánh dấu thông báo đã đọc
const markAsRead = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { notification_ids } = req.body;

    if (!Array.isArray(notification_ids)) {
      return res.status(400).json({ error: 'notification_ids phải là một mảng' });
    }

    const updatePromises = notification_ids.map(id => 
      db.ref(`notifications/${userId}/${id}`).update({ is_read: true })
    );

    await Promise.all(updatePromises);

    res.status(200).json({ message: 'Đã cập nhật trạng thái đọc thông báo' });
  } catch (error) {
    console.error('Lỗi khi cập nhật trạng thái đọc thông báo:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi cập nhật thông báo' });
  }
};

// Xóa thông báo
const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { notification_id } = req.params;

    const notificationRef = db.ref(`notifications/${userId}/${notification_id}`);
    const snapshot = await notificationRef.once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ error: 'Không tìm thấy thông báo' });
    }

    await notificationRef.remove();

    res.status(200).json({ message: 'Đã xóa thông báo' });
  } catch (error) {
    console.error('Lỗi khi xóa thông báo:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi xóa thông báo' });
  }
};

module.exports = {
  createNotification,
  getNotifications,
  markAsRead,
  deleteNotification
}; 