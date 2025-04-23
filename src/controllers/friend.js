const { db } = require('../config/firebase');
const { createNotification } = require('./notifications');

// Hàm kiểm tra người dùng có bị chặn không
const checkIfBlocked = async (userId, targetUserId) => {
  const privacySnapshot = await db.ref(`user_privacy/${targetUserId}`).once('value');
  const privacy = privacySnapshot.val() || { blocked_users: [] };
  return privacy.blocked_users?.includes(userId) || false;
};

const sendFriendRequest = async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const currentUserId = req.user.uid;

    // Kiểm tra người dùng không thể gửi lời mời kết bạn cho chính mình
    if (currentUserId === targetUserId) {
      return res.status(400).json({ error: 'Không thể gửi lời mời kết bạn cho chính mình' });
    }

    // Kiểm tra người dùng đích có tồn tại không
    const targetUserRef = db.ref(`users/${targetUserId}`);
    const targetUserSnapshot = await targetUserRef.once('value');
    
    if (!targetUserSnapshot.exists()) {
      return res.status(404).json({ error: 'Người dùng không tồn tại' });
    }

    // Kiểm tra xem có bị chặn không
    const isBlocked = await checkIfBlocked(currentUserId, targetUserId);
    if (isBlocked) {
      return res.status(403).json({ error: 'Bạn không thể gửi lời mời kết bạn cho người này' });
    }

    // Kiểm tra xem đã là bạn bè chưa
    const friendshipRef = db.ref(`friendships/${currentUserId}/${targetUserId}`);
    const friendshipSnapshot = await friendshipRef.once('value');
    
    if (friendshipSnapshot.exists() && friendshipSnapshot.val().status === 'accepted') {
      return res.status(400).json({ error: 'Đã là bạn bè' });
    }

    // Kiểm tra xem đã gửi lời mời kết bạn chưa
    const pendingRequestRef = db.ref(`friend_requests/${targetUserId}/${currentUserId}`);
    const pendingRequestSnapshot = await pendingRequestRef.once('value');
    
    if (pendingRequestSnapshot.exists()) {
      return res.status(400).json({ error: 'Đã gửi lời mời kết bạn trước đó' });
    }

    // Kiểm tra xem có lời mời kết bạn từ người dùng đích không
    const incomingRequestRef = db.ref(`friend_requests/${currentUserId}/${targetUserId}`);
    const incomingRequestSnapshot = await incomingRequestRef.once('value');
    
    if (incomingRequestSnapshot.exists()) {
      // Nếu có lời mời từ người dùng đích, tự động chấp nhận
      await acceptFriendRequestInternal(currentUserId, targetUserId);
      return res.status(200).json({ message: 'Đã chấp nhận lời mời kết bạn' });
    }

    // Tạo lời mời kết bạn mới
    const friendRequestData = {
      sender_id: currentUserId,
      receiver_id: targetUserId,
      status: 'pending',
      createdAt: Date.now()
    };

    // Lưu lời mời kết bạn
    await db.ref(`friend_requests/${targetUserId}/${currentUserId}`).set(friendRequestData);

    // Lấy thông tin người gửi
    const currentUserRef = db.ref(`users/${currentUserId}`);
    const currentUserSnapshot = await currentUserRef.once('value');
    const currentUserData = currentUserSnapshot.val();

    // Tạo thông báo cho người nhận
    const notificationData = {
      type: 'friend_request',
      actor_id: currentUserId,
      actor_name: currentUserData.first_name + currentUserData.last_name,
      actor_avatar: currentUserData.photoURL || null,
      content: 'đã gửi cho bạn lời mời kết bạn'
    };
    
    await createNotification(targetUserId, notificationData);

    res.status(200).json({ message: 'Đã gửi lời mời kết bạn' });
  } catch (error) {
    console.error('Lỗi khi gửi lời mời kết bạn:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi gửi lời mời kết bạn' });
  }
};

/**
 * Chấp nhận lời mời kết bạn
 */
const acceptFriendRequest = async (req, res) => {
  try {
    const { user_id } = req.body;
    const currentUserId = req.user.uid;

    if (!user_id) {
      return res.status(400).json({ error: 'Thiếu thông tin người gửi lời mời' });
    }

    // Kiểm tra người gửi có tồn tại không
    const senderRef = db.ref(`users/${user_id}`);
    const senderSnapshot = await senderRef.once('value');
    
    if (!senderSnapshot.exists()) {
      return res.status(404).json({ error: 'Người gửi lời mời không tồn tại' });
    }

    // Kiểm tra xem có bị chặn không
    const isBlocked = await checkIfBlocked(currentUserId, user_id);
    if (isBlocked) {
      return res.status(403).json({ error: 'Bạn không thể chấp nhận lời mời kết bạn từ người này' });
    }

    // Kiểm tra lời mời kết bạn có tồn tại không
    const friendRequestRef = db.ref(`friend_requests/${currentUserId}/${user_id}`);
    const friendRequestSnapshot = await friendRequestRef.once('value');
    
    if (!friendRequestSnapshot.exists()) {
      return res.status(404).json({ error: 'Không tìm thấy lời mời kết bạn' });
    }

    // Kiểm tra xem đã là bạn bè chưa
    const friendshipRef = db.ref(`friendships/${currentUserId}/${user_id}`);
    const friendshipSnapshot = await friendshipRef.once('value');
    
    if (friendshipSnapshot.exists() && friendshipSnapshot.val().status === 'accepted') {
      // Nếu đã là bạn bè, xóa lời mời kết bạn nếu có
      await friendRequestRef.remove();
      return res.status(400).json({ error: 'Đã là bạn bè' });
    }

    await acceptFriendRequestInternal(currentUserId, user_id);
    
    res.status(200).json({ message: 'Đã chấp nhận lời mời kết bạn' });
  } catch (error) {
    console.error('Lỗi khi chấp nhận lời mời kết bạn:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi chấp nhận lời mời kết bạn' });
  }
};

/**
 * Hàm nội bộ để chấp nhận lời mời kết bạn
 */
const acceptFriendRequestInternal = async (currentUserId, user_id) => {
  try {
    // Kiểm tra người gửi có tồn tại không
    const senderRef = db.ref(`users/${user_id}`);
    const senderSnapshot = await senderRef.once('value');
    
    if (!senderSnapshot.exists()) {
      throw new Error('Người gửi lời mời không tồn tại');
    }
    
    // Kiểm tra xem có bị chặn không
    const isBlocked = await checkIfBlocked(currentUserId, user_id);
    if (isBlocked) {
      throw new Error('Không thể kết bạn với người đã chặn bạn');
    }
    
    const now = Date.now();
    
    // Cập nhật trạng thái kết bạn cho cả hai người dùng
    const friendship = {
      status: 'accepted',
      createdAt: now,
      updatedAt: now
    };
    
    // Tạo mối quan hệ bạn bè hai chiều
    await db.ref(`friendships/${currentUserId}/${user_id}`).set(friendship);
    await db.ref(`friendships/${user_id}/${currentUserId}`).set(friendship);
    
    // Xóa lời mời kết bạn
    await db.ref(`friend_requests/${currentUserId}/${user_id}`).remove();
    
    // Lấy thông tin người chấp nhận
    const currentUserRef = db.ref(`users/${currentUserId}`);
    const currentUserSnapshot = await currentUserRef.once('value');
    const currentUserData = currentUserSnapshot.val();
    
    // Thêm thông báo cho người gửi lời mời
    const notificationData = {
      type: 'friend_request_accepted',
      actor_id: currentUserId,
      actor_name: currentUserData.first_name + currentUserData.last_name,
      actor_avatar: currentUserData.photoURL || null,
      content: 'đã chấp nhận lời mời kết bạn của bạn'
    };
    
    await createNotification(user_id, notificationData);
  } catch (error) {
    console.error('Lỗi trong hàm acceptFriendRequestInternal:', error);
    throw error;
  }
};

/**
 * Từ chối lời mời kết bạn
 */
const rejectFriendRequest = async (req, res) => {
  try {
    const { user_id } = req.body;
    const currentUserId = req.user.uid;

    if (!user_id) {
      return res.status(400).json({ error: 'Thiếu thông tin người gửi lời mời' });
    }

    // Kiểm tra lời mời kết bạn có tồn tại không
    const friendRequestRef = db.ref(`friend_requests/${currentUserId}/${user_id}`);
    const friendRequestSnapshot = await friendRequestRef.once('value');
    
    if (!friendRequestSnapshot.exists()) {
      return res.status(404).json({ error: 'Không tìm thấy lời mời kết bạn' });
    }

    // Xóa lời mời kết bạn
    await friendRequestRef.remove();

    res.status(200).json({ message: 'Đã từ chối lời mời kết bạn' });
  } catch (error) {
    console.error('Lỗi khi từ chối lời mời kết bạn:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi từ chối lời mời kết bạn' });
  }
};

/**
 * Hủy kết bạn
 */
const unfriend = async (req, res) => {
  try {
    const { friendId } = req.body;
    const currentUserId = req.user.uid;

    // Kiểm tra mối quan hệ bạn bè có tồn tại không
    const friendshipRef = db.ref(`friendships/${currentUserId}/${friendId}`);
    const friendshipSnapshot = await friendshipRef.once('value');
    
    if (!friendshipSnapshot.exists() || friendshipSnapshot.val().status !== 'accepted') {
      return res.status(404).json({ error: 'Không phải là bạn bè' });
    }

    // Xóa mối quan hệ bạn bè ở cả hai phía
    await db.ref(`friendships/${currentUserId}/${friendId}`).remove();
    await db.ref(`friendships/${friendId}/${currentUserId}`).remove();

    res.status(200).json({ message: 'Đã hủy kết bạn' });
  } catch (error) {
    console.error('Lỗi khi hủy kết bạn:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi hủy kết bạn' });
  }
};

//Xoa loi moi ket ban
const deleteFriendRequest = async(req, res)=>{
  try {
    const { friendId} = req.body;
    const currentUserId = req.user.uid;
    
    //kiem tra moi quan he
    const friendshipsRef = db.ref(`friend_requests/${friendId}/${currentUserId}`);
    const friendshipsSnapshot = await friendshipsRef.once('value');

    if(!friendshipsSnapshot.exists() || friendshipsSnapshot.val().status !== 'pending'){
      return res.status(404).json({ error: 'Không tìm thấy lời mời kết bạn' });
    }
    //xoa loi moi
    await friendshipsRef.remove();
    res.status(200).json({ message: 'Đã xóa lời mời kết bạn' });
  } catch (error) {
    console.error('Lỗi khi xóa lời mời kết bạn:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi xóa lời mời kết bạn' });
  }

};

/**
 * Lấy danh sách bạn bè
 */
const getFriendsList = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.uid;
    const currentUserId = req.user.uid;

    // Kiểm tra xem người dùng có bị chặn không nếu đang xem danh sách bạn bè của người khác
    if (userId !== currentUserId) {
      const isBlocked = await checkIfBlocked(currentUserId, userId);
      if (isBlocked) {
        return res.status(403).json({ error: 'Bạn không thể xem danh sách bạn bè của người này' });
      }
    }

    // Lấy danh sách ID bạn bè
    const friendshipsRef = db.ref(`friendships/${userId}`);
    const friendshipsSnapshot = await friendshipsRef.once('value');
    
    if (!friendshipsSnapshot.exists()) {
      return res.status(200).json({ friends: [] });
    }

    const friendships = friendshipsSnapshot.val();
    const friendIds = Object.keys(friendships).filter(id => friendships[id].status === 'accepted');

    // Nếu không có bạn bè
    if (friendIds.length === 0) {
      return res.status(200).json({ friends: [] });
    }

    // Lấy thông tin chi tiết của từng người bạn
    const friendsPromises = friendIds.map(async (friendId) => {
      const userRef = db.ref(`users/${friendId}`);
      const userSnapshot = await userRef.once('value');
      const userData = userSnapshot.val();
      
      if (!userData) return null;
      
      // Loại bỏ thông tin nhạy cảm
      const { password_hash, ...safeUserData } = userData;
      return {
        ...safeUserData,
        uid: friendId
      };
    });

    const friendsData = await Promise.all(friendsPromises);
    const validFriends = friendsData.filter(friend => friend !== null);

    res.status(200).json({ friends: validFriends });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách bạn bè:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi lấy danh sách bạn bè' });
  }
};


//Lấy danh sách lời mời kết bạn

const getFriendRequests = async (req, res) => {
  try {
    const currentUserId = req.user.uid;

    // Lấy danh sách lời mời kết bạn
    const friendRequestsRef = db.ref(`friend_requests/${currentUserId}`);
    const friendRequestsSnapshot = await friendRequestsRef.once('value');
    
    if (!friendRequestsSnapshot.exists()) {
      return res.status(200).json({ requests: [] });
    }

    const requests = friendRequestsSnapshot.val();
    const senderIds = Object.keys(requests);

    // Nếu không có lời mời kết bạn
    if (senderIds.length === 0) {
      return res.status(200).json({ requests: [] });
    }

    // Lấy thông tin chi tiết của người gửi lời mời
    const requestsPromises = senderIds.map(async (senderId) => {
      // Kiểm tra xem người gửi có chặn mình không
      const isBlocked = await checkIfBlocked(currentUserId, senderId);
      if (isBlocked) {
        return null;
      }

      const userRef = db.ref(`users/${senderId}`);
      const userSnapshot = await userRef.once('value');
      const userData = userSnapshot.val();
      
      if (!userData) return null;
      
      // Loại bỏ thông tin nhạy cảm
      const { password_hash, ...safeUserData } = userData;
      
      return {
        ...requests[senderId],
        sender: {
          ...safeUserData,
          uid: senderId
        }
      };
    });

    const requestsData = await Promise.all(requestsPromises);
    const validRequests = requestsData.filter(request => request !== null);

    res.status(200).json({ requests: validRequests });
  } catch (error) {
    console.error('Lỗi khi lấy danh sách lời mời kết bạn:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi lấy danh sách lời mời kết bạn' });
  }
};

/**
 * Kiểm tra trạng thái kết bạn
 */
const checkFriendshipStatus = async (req, res) => {
  try {
    const { targetUserId } = req.params;
    const currentUserId = req.user.uid;

    if (currentUserId === targetUserId) {
      return res.status(400).json({ error: 'Không thể kiểm tra trạng thái kết bạn với chính mình' });
    }

    // Kiểm tra xem có bị chặn không
    const isBlocked = await checkIfBlocked(currentUserId, targetUserId);
    if (isBlocked) {
      return res.status(200).json({ status: 'blocked' });
    }

    // Kiểm tra xem đã là bạn bè chưa
    const friendshipRef = db.ref(`friendships/${currentUserId}/${targetUserId}`);
    const friendshipSnapshot = await friendshipRef.once('value');
    
    if (friendshipSnapshot.exists() && friendshipSnapshot.val().status === 'accepted') {
      return res.status(200).json({ status: 'friends' });
    }

    // Kiểm tra xem đã gửi lời mời kết bạn chưa
    const sentRequestRef = db.ref(`friend_requests/${targetUserId}/${currentUserId}`);
    const sentRequestSnapshot = await sentRequestRef.once('value');
    
    if (sentRequestSnapshot.exists()) {
      return res.status(200).json({ status: 'request_sent' });
    }

    // Kiểm tra xem có lời mời kết bạn từ người dùng đích không
    const receivedRequestRef = db.ref(`friend_requests/${currentUserId}/${targetUserId}`);
    const receivedRequestSnapshot = await receivedRequestRef.once('value');
    
    if (receivedRequestSnapshot.exists()) {
      return res.status(200).json({ status: 'request_received' });
    }

    // Không có mối quan hệ
    return res.status(200).json({ status: 'not_friends' });
  } catch (error) {
    console.error('Lỗi khi kiểm tra trạng thái kết bạn:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi kiểm tra trạng thái kết bạn' });
  }
};

module.exports = {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  unfriend,
  getFriendsList,
  getFriendRequests,
  checkFriendshipStatus,
  deleteFriendRequest
};
