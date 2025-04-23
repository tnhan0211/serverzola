const { db } = require('../config/firebase');
const { getIO } = require('../config/socket');
const {uploadPublicFileToS3} = require('../utils/s3Client');
const multer = require('multer');
const { createNotification } = require('./notifications');


// Gửi tin nhắn cá nhân
const sendPrivateMessage = async (req, res) => {
  try {
    const { receiver_id, content, type = 'text'} = req.body;
    const sender_id = req.user.uid;
    const file = req.file;
    
    // Kiểm tra người nhận có tồn tại không
    const receiverSnapshot = await db.ref(`users/${receiver_id}`).once('value');
    if (!receiverSnapshot.exists()) {
      return res.status(404).json({ error: 'Người nhận không tồn tại' });
    }
    
    // Kiểm tra quyền riêng tư (nếu có)
    const privacySnapshot = await db.ref(`user_privacy/${receiver_id}`).once('value');
    const privacy = privacySnapshot.val() || {};
    
    // Kiểm tra người gửi có bị chặn không
    const blockedUsers = privacy.blocked_users || [];
    if (blockedUsers.includes(sender_id)) {
      return res.status(403).json({ error: 'Bạn không thể gửi tin nhắn cho người dùng này' });
    }
    //upload media file
    let messageType = type;
    let messageMediaUrl = null;
    if(file){
      if(!content && !file){
        return res.status(400).json({error: 'Tin nhắn phải có nội dung hoặc media!'});

      }
      try {
        messageType = file.mimetype.startsWith('image/') ? 'image' : (file.mimetype.startsWith('video/') ? 'video' : 'file');
        messageMediaUrl = await uploadPublicFileToS3(file.buffer, file.originalname, file.mimetype, 'chat-media');
      } catch (uploadError) {
        console.error("Cant upload your media file to S3 chat", uploadError);
        return res.status(500).json({error: "Server error to up load media file"});
      }
    }else if(!content){
      return res.status(400).json({error: 'Tin nhắn phải có nội dung hoặc media!'});
    }

    // Tạo tin nhắn mới
    const messageRef = db.ref('private_messages').push();
    const message_id = messageRef.key;
    
    const messageData = {
      message_id,
      sender_id,
      receiver_id,
      content: content || null,
      type: messageType,
      status: 'sent',
      created_at: Date.now(),
      is_deleted: false,
      media_url: messageMediaUrl
    };
    
    
    await messageRef.set(messageData);
    
    // Cập nhật trạng thái hoạt động
    await db.ref(`user_activity/${sender_id}`).update({
      typing_in: null,
      last_active: Date.now()
    });
    
    // Lấy thông tin người gửi
    const senderSnapshot = await db.ref(`users/${sender_id}`).once('value');
    const senderData = senderSnapshot.val();
    
    // Tạo thông báo cho người nhận
    const notificationData = {
      type: 'private_message',
      actor_id: sender_id,
      actor_name: senderData.first_name + senderData.last_name,
      actor_avatar: senderData.photoURL || null,
      message_id,
      content: content ? content.substring(0, 50) + (content.length > 50 ? '...' : '') : 'Đã gửi một ' + messageType
    };

    await createNotification(receiver_id, notificationData);
    
    // Gửi thông báo qua Socket.IO
    try {
      const io = getIO();
      io.to(receiver_id).emit('receive_private_message', messageData);
    } catch (socketError) {
      console.error('Socket.IO chưa được khởi tạo hoặc có lỗi:', socketError);
    }
    
    res.status(201).json({ 
      message: 'Tin nhắn đã được gửi',
      message_id
    });
  } catch (error) {
    console.error('Lỗi khi gửi tin nhắn cá nhân:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi gửi tin nhắn' });
  }
};

// Lấy lịch sử tin nhắn cá nhân
const getPrivateMessages = async (req, res) => {
  try {
    const { user_id } = req.params;
    const current_user_id = req.user.uid;
    
    // Lấy tin nhắn giữa hai người dùng
    const messagesSnapshot = await db.ref('private_messages')
      .orderByChild('created_at')
      .once('value');
    
    const messages = [];
    messagesSnapshot.forEach(snapshot => {
      const message = snapshot.val();
      if ((message.sender_id === current_user_id && message.receiver_id === user_id) ||
          (message.sender_id === user_id && message.receiver_id === current_user_id)) {
        messages.push(message);
      }
    });
    
    // Sắp xếp tin nhắn theo thời gian
    messages.sort((a, b) => a.created_at - b.created_at);
    
    // Cập nhật trạng thái đã đọc
    const updatePromises = [];
    messages.forEach(message => {
      if (message.receiver_id === current_user_id && message.status !== 'read') {
        updatePromises.push(
          db.ref(`private_messages/${message.message_id}`).update({
            status: 'read',
            read_at: Date.now()
          })
        );
      }
    });
    
    await Promise.all(updatePromises);
    
    // Gửi thông báo đã đọc qua Socket.IO
    try {
      const io = getIO();
      messages.forEach(message => {
        if (message.receiver_id === current_user_id && message.sender_id === user_id) {
          io.to(user_id).emit('message_read', {
            message_id: message.message_id,
            read_at: Date.now()
          });
        }
      });
    } catch (socketError) {
      console.error('Socket.IO chưa được khởi tạo hoặc có lỗi:', socketError);
    }
    
    res.status(200).json(messages);
  } catch (error) {
    console.error('Lỗi khi lấy lịch sử tin nhắn:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi lấy lịch sử tin nhắn' });
  }
};

// Tạo nhóm chat mới
const createGroupChat = async (req, res) => {
  try {
    const { name, description = '', type = 'private', member_ids = [] } = req.body;
    const creator_id = req.user.uid;
    const file = req.file;

    let avatar_url = null;
    if(file) {
      // Kiểm tra xem file có phải là hình ảnh không
      if(!file.mimetype.startsWith('image/')) {
        return res.status(400).json({error: 'Chỉ cho phép upload file hình ảnh cho avatar nhóm!'});
      }

      try {
        avatar_url = await uploadPublicFileToS3(file.buffer, file.originalname, file.mimetype, 'group-avatars');
      } catch (uploadError) {
        console.error("Không thể upload ảnh avatar lên S3:", uploadError);
        return res.status(500).json({error: "Lỗi server khi upload ảnh avatar"});
      }
    }
    
    // Thêm người tạo vào danh sách thành viên nếu chưa có
    if (!member_ids.includes(creator_id)) {
      member_ids.push(creator_id);
    }
    
    // Tạo nhóm mới
    const groupRef = db.ref('group_chats').push();
    const group_id = groupRef.key;
    
    const groupData = {
      group_id,
      creator_id,
      name,
      description,
      type,
      avatar_url,
      created_at: Date.now(),
      updated_at: Date.now(),
      members_count: member_ids.length
    };
    
    await groupRef.set(groupData);
    
    // Thêm các thành viên vào nhóm
    const memberPromises = member_ids.map(user_id => {
      const role = user_id === creator_id ? 'admin' : 'member';
      return db.ref(`group_members/${group_id}_${user_id}`).set({
        group_id,
        user_id,
        role,
        status: 'active',
        joined_at: Date.now()
      });
    });
    
    await Promise.all(memberPromises);
    
    // Tạo tin nhắn hệ thống
    const systemMessageRef = db.ref('group_messages').push();
    const systemMessage = {
      message_id: systemMessageRef.key,
      group_id,
      sender_id: creator_id,
      content: `${req.user.displayName || 'Người dùng'} đã tạo nhóm`,
      type: 'system',
      status: 'sent',
      created_at: Date.now(),
      is_deleted: false
    };
    
    await systemMessageRef.set(systemMessage);
    
    // Gửi thông báo qua Socket.IO
    try {
      const io = getIO();
      member_ids.forEach(user_id => {
        io.to(user_id).emit('group_created', {
          group_data: groupData,
          system_message: systemMessage
        });
      });
    } catch (socketError) {
      console.error('Socket.IO chưa được khởi tạo hoặc có lỗi:', socketError);
    }
    
    res.status(201).json({
      message: 'Nhóm chat đã được tạo',
      group_id,
      group_data: groupData
    });
  } catch (error) {
    console.error('Lỗi khi tạo nhóm chat:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi tạo nhóm chat' });
  }
};


// Gửi tin nhắn nhóm
const sendGroupMessage = async (req, res) => {
  try {
    // Lấy dữ liệu từ form-data hoặc raw JSON
    const group_id = req.body.group_id;
    const content = req.body.content;
    const type = req.body.type || 'text';
    const sender_id = req.user.uid;
    const file = req.file;

    // Log để debug
    console.log('Request body:', req.body);
    console.log('Group ID:', group_id);
    console.log('Content:', content);
    console.log('Type:', type);
    console.log('File:', file);

    if (!group_id) {
      return res.status(400).json({ error: 'Thiếu group_id' });
    }
    
    // Kiểm tra nhóm có tồn tại không
    const groupSnapshot = await db.ref(`group_chats/${group_id}`).once('value');
    if (!groupSnapshot.exists()) {
      return res.status(404).json({ error: 'Nhóm không tồn tại' });
    }
    
    // Kiểm tra người gửi có trong nhóm không
    const memberSnapshot = await db.ref(`group_members/${group_id}_${sender_id}`).once('value');
    if (!memberSnapshot.exists() || memberSnapshot.val().status !== 'active') {
      return res.status(403).json({ error: 'Bạn không phải là thành viên của nhóm này' });
    }

    // Lấy thông tin người gửi trước khi xử lý tin nhắn
    const senderSnapshot = await db.ref(`users/${sender_id}`).once('value');
    if (!senderSnapshot.exists()) {
      return res.status(404).json({ error: 'Không tìm thấy thông tin người gửi' });
    }
    const senderData = senderSnapshot.val();
    
    //upload media file
    let messageType = type;
    let messageMediaUrl = null;

    if(file){
      if(!content && !file){
        return res.status(400).json({error: 'Tin nhắn phải có nội dung hoặc media!'});
      }
      try {
        messageType = file.mimetype.startsWith('image/') ? 'image' : (file.mimetype.startsWith('video/') ? 'video' : 'file');
        messageMediaUrl = await uploadPublicFileToS3(file.buffer, file.originalname, file.mimetype, 'chat-media');
      } catch (uploadError) {
        console.error("Cant upload your media file to S3 chat", uploadError);
        return res.status(500).json({error: "Server error to up load media file"});
      }
    }else if(!content){
      return res.status(400).json({error: 'Tin nhắn phải có nội dung hoặc media!'});
    }

    // Tạo tin nhắn mới
    const messageRef = db.ref('group_messages').push();
    const message_id = messageRef.key;
    
    const messageData = {
      message_id,
      group_id,
      sender_id,
      content: content || null,
      type: messageType,
      status: 'sent',
      created_at: Date.now(),
      is_deleted: false,
      media_url: messageMediaUrl
    };
    await messageRef.set(messageData);
    
    // Cập nhật thời gian cập nhật của nhóm
    await db.ref(`group_chats/${group_id}`).update({
      updated_at: Date.now()
    });
    
    // Cập nhật trạng thái hoạt động
    await db.ref(`user_activity/${sender_id}`).update({
      typing_in: null,
      last_active: Date.now()
    });

    const groupData = groupSnapshot.val();

    // Lấy danh sách thành viên nhóm (trừ người gửi)
    const membersSnapshot = await db.ref('group_members')
      .orderByChild('group_id')
      .equalTo(group_id)
      .once('value');
    
    const members = [];
    membersSnapshot.forEach(memberSnap => {
      const memberData = memberSnap.val();
      if (memberData.user_id !== sender_id && memberData.status === 'active') {
        members.push(memberData.user_id);
      }
    });

    // Tạo thông báo cho mỗi thành viên
    const notificationData = {
      type: 'group_message',
      actor_id: sender_id,
      actor_name: senderData.first_name + senderData.last_name || 'Người dùng Zola',
      actor_avatar: senderData.photoURL || null,
      group_id,
      group_name: groupData.name,
      message_id,
      content: content ? content.substring(0, 50) + (content.length > 50 ? '...' : '') : 'Đã gửi một ' + messageType
    };

    const notificationPromises = members.map(member_id => 
      createNotification(member_id, notificationData)
    );

    await Promise.all(notificationPromises);
    
    // Gửi thông báo qua Socket.IO
    try {
      const io = getIO();
      io.to(group_id).emit('receive_group_message', messageData);
    } catch (socketError) {
      console.error('Socket.IO chưa được khởi tạo hoặc có lỗi:', socketError);
    }
    
    res.status(201).json({ 
      message: 'Tin nhắn đã được gửi',
      message_id
    });
  } catch (error) {
    console.error('Lỗi khi gửi tin nhắn nhóm:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi gửi tin nhắn' });
  }
};

// Lấy tin nhắn của nhóm
const getGroupMessages = async (req, res) => {
  try {
    const { group_id } = req.params;
    const user_id = req.user.uid;
    
    // Kiểm tra người dùng có trong nhóm không
    const memberSnapshot = await db.ref(`group_members/${group_id}_${user_id}`).once('value');
    if (!memberSnapshot.exists() || memberSnapshot.val().status !== 'active') {
      return res.status(403).json({ error: 'Bạn không phải là thành viên của nhóm này' });
    }
    
    // Lấy tin nhắn của nhóm
    const messagesSnapshot = await db.ref('group_messages')
      .orderByChild('group_id')
      .equalTo(group_id)
      .once('value');
    
    const messages = [];
    messagesSnapshot.forEach(snapshot => {
      messages.push(snapshot.val());
    });
    
    // Sắp xếp tin nhắn theo thời gian
    messages.sort((a, b) => a.created_at - b.created_at);
    
    // Cập nhật last_read_message_id
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      await db.ref(`group_members/${group_id}_${user_id}`).update({
        last_read_message_id: lastMessage.message_id
      });
    }
    
    res.status(200).json(messages);
  } catch (error) {
    console.error('Lỗi khi lấy tin nhắn nhóm:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi lấy tin nhắn nhóm' });
  }
};

// Cập nhật trạng thái đang nhập
const updateTypingStatus = async (req, res) => {
  try {
    const { conversation_id, is_typing } = req.body;
    const user_id = req.user.uid;
    
    await db.ref(`user_activity/${user_id}`).update({
      typing_in: is_typing ? conversation_id : null,
      last_active: Date.now(),
      is_online: true
    });
    
    // Gửi thông báo qua Socket.IO
    try {
      const io = getIO();
      
      // Nếu là tin nhắn cá nhân
      if (conversation_id.indexOf('_') === -1) {
        io.to(conversation_id).emit('user_typing', {
          user_id,
          is_typing
        });
      } else {
        // Nếu là nhóm chat
        io.to(conversation_id).emit('user_typing', {
          user_id,
          is_typing,
          group_id: conversation_id
        });
      }
    } catch (socketError) {
      console.error('Socket.IO chưa được khởi tạo hoặc có lỗi:', socketError);
    }
    
    res.status(200).json({ message: 'Trạng thái đang nhập đã được cập nhật' });
  } catch (error) {
    console.error('Lỗi khi cập nhật trạng thái đang nhập:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi cập nhật trạng thái đang nhập' });
  }
};

//Lấy danh sách chat bạn bè gần đây
const getFriendListMessages = async (req, res) => {
  try {
    const user_id = req.user.uid; // Lấy user_id từ middleware xác thực

    // 1. Lấy danh sách bạn bè đã chấp nhận
    const friendshipRef = db.ref(`friendships/${user_id}`);
    const friendshipSnapshot = await friendshipRef.once('value');
    const friendsData = friendshipSnapshot.val() || {};
    const friend_ids = Object.keys(friendsData).filter(id => friendsData[id].status === 'accepted');

    if (friend_ids.length === 0) {
      return res.status(200).json({ recent_chats: [] });
    }

    // 2. Lấy tất cả tin nhắn riêng liên quan đến người dùng hiện tại
    const privateMessagesRef = db.ref('private_messages');
    const messagesSnapshot = await privateMessagesRef.orderByChild('created_at').once('value');
    const allMessages = [];
    messagesSnapshot.forEach(snap => {
      const msg = snap.val();
      if (msg.sender_id === user_id || msg.receiver_id === user_id) {
        allMessages.push(msg);
      }
    });

    // 3. Tìm tin nhắn cuối cùng với mỗi người bạn
    const latestMessagesByFriend = {};
    allMessages.forEach(msg => {
      const other_user_id = msg.sender_id === user_id ? msg.receiver_id : msg.sender_id;

      // Chỉ xử lý nếu người kia là bạn bè
      if (friend_ids.includes(other_user_id)) {
        if (!latestMessagesByFriend[other_user_id] || msg.created_at > latestMessagesByFriend[other_user_id].created_at) {
          latestMessagesByFriend[other_user_id] = msg;
        }
      }
    });

    // 4. Lấy thông tin chi tiết của bạn bè có tin nhắn
    const friendInfoPromises = Object.keys(latestMessagesByFriend).map(friendId =>
      db.ref(`users/${friendId}`).once('value')
    );
    const friendInfoSnapshots = await Promise.all(friendInfoPromises);

    const friendInfos = {};
    friendInfoSnapshots.forEach(snap => {
      if (snap.exists()) {
        friendInfos[snap.key] = snap.val();
      }
    });

    // 5. Tạo danh sách kết quả và sắp xếp
    const recentChats = Object.keys(latestMessagesByFriend).map(friendId => {
      const friendInfo = friendInfos[friendId] || {};
      const lastMessage = latestMessagesByFriend[friendId];
      return {
        type: 'private',
        user_info: {
          user_id: friendId,
          displayName: friendInfo.first_name + friendInfo.last_name || 'Người dùng Zola',
          photoURL: friendInfo.photoURL || null,
          is_online: friendInfo.is_online || false,
          last_active: friendInfo.last_active || null
        },
        last_message: {
          message_id: lastMessage.message_id,
          sender_id: lastMessage.sender_id,
          content: lastMessage.content,
          type: lastMessage.type,
          created_at: lastMessage.created_at,
          status: lastMessage.receiver_id === user_id ? lastMessage.status : 'sent' // Hiển thị status nếu người dùng là người nhận
        }
      };
    });

    // Sắp xếp theo thời gian tin nhắn cuối cùng, mới nhất trước
    recentChats.sort((a, b) => b.last_message.created_at - a.last_message.created_at);

    res.status(200).json({ recent_chats: recentChats });

  } catch (error) {
    console.error('Lỗi khi lấy danh sách tin nhắn bạn bè:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi lấy danh sách tin nhắn bạn bè' });
  }
};

const getRecentGroupChats = async (req, res) => {
  try {
    const user_id = req.user.uid;

    // 1. Lấy danh sách các nhóm mà người dùng là thành viên
    const groupMembersRef = db.ref('group_members');
    // Firebase Realtime DB không hỗ trợ query phức tạp trên key ghép, nên cần lấy về và lọc
    const membersSnapshot = await groupMembersRef.once('value');
    const allMembers = membersSnapshot.val() || {};
    const userGroupIds = Object.keys(allMembers)
      .filter(key => allMembers[key].user_id === user_id && allMembers[key].status === 'active')
      .map(key => allMembers[key].group_id);

    if (userGroupIds.length === 0) {
      return res.status(200).json({ recent_chats: [] });
    }

    // 2. Lấy tin nhắn cuối cùng cho mỗi nhóm hiệu quả hơn
    const latestMessagePromises = userGroupIds.map(groupId =>
      db.ref('group_messages')
        .orderByChild('group_id')
        .equalTo(groupId)
        .limitToLast(1) // Chỉ lấy tin nhắn cuối cùng
        .once('value')
    );

    const latestMessageSnapshots = await Promise.all(latestMessagePromises);

    const latestMessagesByGroup = {};
    latestMessageSnapshots.forEach(snap => {
      snap.forEach(messageSnap => { // limitToLast(1) vẫn trả về snapshot chứa 1 item
        const message = messageSnap.val();
        if (message) {
            latestMessagesByGroup[message.group_id] = message;
        }
      });
    });

    // 3. Lấy thông tin chi tiết của các nhóm có tin nhắn
    const groupInfoPromises = Object.keys(latestMessagesByGroup).map(groupId =>
      db.ref(`group_chats/${groupId}`).once('value')
    );
    const groupInfoSnapshots = await Promise.all(groupInfoPromises);

    const groupInfos = {};
    groupInfoSnapshots.forEach(snap => {
      if (snap.exists()) {
        groupInfos[snap.key] = snap.val();
      }
    });

     // 4. Lấy thông tin thành viên (để biết last_read_message_id)
     const memberInfoPromises = Object.keys(latestMessagesByGroup).map(groupId =>
        db.ref(`group_members/${groupId}_${user_id}`).once('value')
      );
    const memberInfoSnapshots = await Promise.all(memberInfoPromises);
    const memberInfos = {};
    memberInfoSnapshots.forEach(snap => {
        if(snap.exists()){
            memberInfos[snap.val().group_id] = snap.val();
        }
    });


    // 5. Tạo danh sách kết quả và sắp xếp
    const recentChats = Object.keys(latestMessagesByGroup).map(groupId => {
      const groupInfo = groupInfos[groupId] || {};
      const lastMessage = latestMessagesByGroup[groupId];
      const memberInfo = memberInfos[groupId] || {};
      const unreadCount = lastMessage.message_id !== memberInfo.last_read_message_id ? 1 : 0; // Logic đếm tin chưa đọc cơ bản

      // Cần thêm logic đếm số tin chưa đọc chính xác hơn nếu cần
      // Ví dụ: query các tin nhắn sau last_read_message_id

      return {
        type: 'group',
        group_info: {
          group_id: groupId,
          name: groupInfo.name,
          avatar_url: groupInfo.avatar_url || null,
          members_count: groupInfo.members_count || 0
        },
        last_message: {
          message_id: lastMessage.message_id,
          sender_id: lastMessage.sender_id,
           // Có thể lấy displayName của người gửi nếu cần
          content: lastMessage.content,
          type: lastMessage.type,
          created_at: lastMessage.created_at
        },
        unread_count: unreadCount // Số tin nhắn chưa đọc (cần cải thiện)
      };
    });

    // Sắp xếp theo thời gian tin nhắn cuối cùng, mới nhất trước
    recentChats.sort((a, b) => b.last_message.created_at - a.last_message.created_at);

    res.status(200).json({ recent_chats: recentChats });

  } catch (error) {
    console.error('Lỗi khi lấy danh sách chat nhóm gần đây:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi lấy danh sách chat nhóm gần đây' });
  }
};

// Lấy danh sách các nhóm đã tham gia (bao gồm nhóm tự tạo)
const getJoinedGroups = async (req, res) => {
  try {
    const user_id = req.user.uid; // Lấy user_id từ middleware xác thực

    // 1. Lấy danh sách ID các nhóm mà người dùng là thành viên đang hoạt động
    const groupMembersRef = db.ref('group_members');
    const membersSnapshot = await groupMembersRef.orderByChild('user_id').equalTo(user_id).once('value'); // Query hiệu quả hơn
    const allMembersData = membersSnapshot.val() || {};

    const joinedGroupIds = Object.keys(allMembersData)
      .filter(key => allMembersData[key].status === 'active')
      .map(key => allMembersData[key].group_id);

    if (joinedGroupIds.length === 0) {
      return res.status(200).json({ joined_groups: [] });
    }

    // 2. Lấy thông tin chi tiết của từng nhóm đã tham gia
    const groupInfoPromises = joinedGroupIds.map(groupId =>
      db.ref(`group_chats/${groupId}`).once('value')
    );
    const groupInfoSnapshots = await Promise.all(groupInfoPromises);

    const joinedGroups = [];
    groupInfoSnapshots.forEach(snap => {
      if (snap.exists()) {
        // Có thể bổ sung thêm thông tin thành viên nếu cần (ví dụ: vai trò của user trong nhóm)
        // const memberInfo = allMembersData[`${snap.key}_${user_id}`];
        joinedGroups.push({
            ...snap.val(),
            // role: memberInfo ? memberInfo.role : 'unknown' // Ví dụ thêm vai trò
        });
      } else {
        console.warn(`Không tìm thấy thông tin cho group_id: ${snap.key}`); // Ghi log nếu nhóm không tồn tại nhưng vẫn có trong group_members
      }
    });

    // Sắp xếp danh sách nhóm (ví dụ: theo tên hoặc thời gian tạo/cập nhật) - tùy chọn
    joinedGroups.sort((a, b) => (a.name || '').localeCompare(b.name || '')); // Sắp xếp theo tên

    res.status(200).json({ joined_groups: joinedGroups });

  } catch (error) {
    console.error('Lỗi khi lấy danh sách nhóm đã tham gia:', error);
    res.status(500).json({ error: 'Đã xảy ra lỗi khi lấy danh sách nhóm' });
  }
};

module.exports = {
  sendPrivateMessage,
  getPrivateMessages,
  createGroupChat,
  sendGroupMessage,
  getGroupMessages,
  updateTypingStatus,
  getFriendListMessages,
  getRecentGroupChats,
  getJoinedGroups
};
