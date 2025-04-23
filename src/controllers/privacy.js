const { db } = require('../config/firebase');

/**
 * Lấy cài đặt quyền riêng tư của người dùng
 */
const getUserPrivacy = async (req, res) => {
  try {
    const user_id = req.user.uid;
    
    const privacySnapshot = await db.ref(`user_privacy/${user_id}`).once('value');
    const privacy = privacySnapshot.val() || {
      user_id,
      blocked_users: [],
      allow_messages_from: 'everyone', // everyone, friends, nobody
      read_receipts: true,
      show_changes_message: true
    };
    
    res.status(200).json(privacy);
  } catch (error) {
    console.error('Lỗi khi lấy cài đặt quyền riêng tư:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi lấy cài đặt quyền riêng tư' });
  }
};

/**
 * Cập nhật cài đặt quyền riêng tư của người dùng
 */
const updateUserPrivacy = async (req, res) => {
  try {
    const user_id = req.user.uid;
    const { allow_messages_from, read_receipts, show_changes_message } = req.body;
    
    const updates = {};
    
    if (allow_messages_from) {
      if (!['everyone', 'friends', 'nobody'].includes(allow_messages_from)) {
        return res.status(400).json({ error: 'Giá trị allow_messages_from không hợp lệ' });
      }
      updates.allow_messages_from = allow_messages_from;
    }
    
    if (read_receipts !== undefined) {
      updates.read_receipts = !!read_receipts;
    }
    
    if (show_changes_message !== undefined) {
      updates.show_changes_message = !!show_changes_message;
    }
    
    await db.ref(`user_privacy/${user_id}`).update(updates);
    
    res.status(200).json({ message: 'Cài đặt quyền riêng tư đã được cập nhật' });
  } catch (error) {
    console.error('Lỗi khi cập nhật cài đặt quyền riêng tư:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi cập nhật cài đặt quyền riêng tư' });
  }
};

/**
 * Chặn người dùng
 */
const blockUser = async (req, res) => {
  try {
    const user_id = req.user.uid;
    const { blocked_user_id } = req.body;
    
    // Kiểm tra người dùng bị chặn có tồn tại không
    const userSnapshot = await db.ref(`users/${blocked_user_id}`).once('value');
    if (!userSnapshot.exists()) {
      return res.status(404).json({ error: 'Người dùng không tồn tại' });
    }
    
    // Lấy danh sách người dùng đã chặn
    const privacySnapshot = await db.ref(`user_privacy/${user_id}`).once('value');
    const privacy = privacySnapshot.val() || { blocked_users: [] };
    const blockedUsers = privacy.blocked_users || [];
    
    // Kiểm tra người dùng đã bị chặn chưa
    if (blockedUsers.includes(blocked_user_id)) {
      return res.status(400).json({ error: 'Người dùng này đã bị chặn' });
    }
    
    // Thêm người dùng vào danh sách chặn
    blockedUsers.push(blocked_user_id);
    await db.ref(`user_privacy/${user_id}`).update({ blocked_users: blockedUsers });

    // Xóa mối quan hệ bạn bè nếu có
    const friendshipRef = db.ref(`friendships/${user_id}/${blocked_user_id}`);
    const friendshipSnapshot = await friendshipRef.once('value');
    if (friendshipSnapshot.exists()) {
      await db.ref(`friendships/${user_id}/${blocked_user_id}`).remove();
      await db.ref(`friendships/${blocked_user_id}/${user_id}`).remove();
    }

    // Xóa lời mời kết bạn nếu có
    const sentRequestRef = db.ref(`friend_requests/${blocked_user_id}/${user_id}`);
    const receivedRequestRef = db.ref(`friend_requests/${user_id}/${blocked_user_id}`);
    await Promise.all([
      sentRequestRef.remove(),
      receivedRequestRef.remove()
    ]);
    
    res.status(200).json({ message: 'Đã chặn người dùng thành công' });
  } catch (error) {
    console.error('Lỗi khi chặn người dùng:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi chặn người dùng' });
  }
};

/**
 * Bỏ chặn người dùng
 */
const unblockUser = async (req, res) => {
  try {
    const user_id = req.user.uid;
    const { blocked_user_id } = req.body;
    
    // Lấy danh sách người dùng đã chặn
    const privacySnapshot = await db.ref(`user_privacy/${user_id}`).once('value');
    const privacy = privacySnapshot.val() || { blocked_users: [] };
    const blockedUsers = privacy.blocked_users || [];
    
    // Kiểm tra người dùng có trong danh sách chặn không
    if (!blockedUsers.includes(blocked_user_id)) {
      return res.status(400).json({ error: 'Người dùng này chưa bị chặn' });
    }
    
    // Xóa người dùng khỏi danh sách chặn
    const updatedBlockedUsers = blockedUsers.filter(id => id !== blocked_user_id);
    await db.ref(`user_privacy/${user_id}`).update({ blocked_users: updatedBlockedUsers });
    
    res.status(200).json({ message: 'Đã bỏ chặn người dùng thành công' });
  } catch (error) {
    console.error('Lỗi khi bỏ chặn người dùng:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi bỏ chặn người dùng' });
  }
};

/**
 * Lấy danh sách người dùng đã chặn
 */
const getBlockedUsers = async (req, res) => {
  try {
    const user_id = req.user.uid;
    
    // Lấy danh sách người dùng đã chặn
    const privacySnapshot = await db.ref(`user_privacy/${user_id}`).once('value');
    const privacy = privacySnapshot.val() || { blocked_users: [] };
    const blockedUsers = privacy.blocked_users || [];
    
    if (blockedUsers.length === 0) {
      return res.status(200).json([]);
    }
    
    // Lấy thông tin chi tiết của người dùng bị chặn
    const userPromises = blockedUsers.map(id => 
      db.ref(`users/${id}`).once('value')
    );
    
    const userSnapshots = await Promise.all(userPromises);
    const blockedUserDetails = userSnapshots.map(snapshot => {
      const user = snapshot.val();
      if (!user) return null;
      
      return {
        user_id: user.user_id,
        first_name: user.first_name,
        last_name: user.last_name,
        avatar: user.avatar
      };
    }).filter(user => user !== null);
    
    res.status(200).json(blockedUserDetails);
  } catch (error) {
    console.error('Lỗi khi lấy danh sách người dùng đã chặn:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi lấy danh sách người dùng đã chặn' });
  }
};

module.exports = {
  getUserPrivacy,
  updateUserPrivacy,
  blockUser,
  unblockUser,
  getBlockedUsers
};
