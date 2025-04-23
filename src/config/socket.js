const socketIO = require('socket.io');
const { db } = require('./firebase');
const jwt = require('jsonwebtoken');

let io;

const initSocket = (server) => {
  io = socketIO(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Xác thực người dùng thông qua token
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Không có token xác thực'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (error) {
      return next(new Error('Token không hợp lệ'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.uid;
    console.log(`Người dùng ${userId} đã kết nối`);

    // Thêm người dùng vào phòng cá nhân
    socket.join(userId);

    // Cập nhật trạng thái online
    db.ref(`user_activity/${userId}`).update({
      is_online: true,
      last_active: Date.now()
    });

    // Xử lý tin nhắn cá nhân
    socket.on('send_private_message', async (data) => {
      try {
        const { receiver_id, content, type = 'text' } = data;
        const sender_id = userId;

        // Kiểm tra người nhận có tồn tại không
        const receiverSnapshot = await db.ref(`users/${receiver_id}`).once('value');
        if (!receiverSnapshot.exists()) {
          socket.emit('error', { message: 'Người nhận không tồn tại' });
          return;
        }

        // Kiểm tra quyền riêng tư
        const privacySnapshot = await db.ref(`user_privacy/${receiver_id}`).once('value');
        const privacy = privacySnapshot.val() || {};
        const blockedUsers = privacy.blocked_users || [];

        if (blockedUsers.includes(sender_id)) {
          socket.emit('error', { message: 'Bạn không thể gửi tin nhắn cho người dùng này' });
          return;
        }

        // Tạo tin nhắn mới
        const messageRef = db.ref('private_messages').push();
        const message_id = messageRef.key;

        const messageData = {
          message_id,
          sender_id,
          receiver_id,
          content,
          type,
          status: 'sent',
          created_at: Date.now(),
          is_deleted: false
        };

        await messageRef.set(messageData);

        // Cập nhật trạng thái hoạt động
        await db.ref(`user_activity/${sender_id}`).update({
          typing_in: null,
          last_active: Date.now()
        });

        // Gửi tin nhắn đến người nhận
        socket.to(receiver_id).emit('receive_private_message', messageData);

        // Phản hồi người gửi
        socket.emit('private_message_sent', { 
          message: 'Tin nhắn đã được gửi',
          message_id,
          messageData
        });
      } catch (error) {
        console.error('Lỗi khi gửi tin nhắn cá nhân:', error);
        socket.emit('error', { message: 'Đã xảy ra lỗi khi gửi tin nhắn' });
      }
    });

    // Xử lý tin nhắn nhóm
    socket.on('send_group_message', async (data) => {
      try {
        const { group_id, content, type = 'text' } = data;
        const sender_id = userId;

        // Kiểm tra nhóm có tồn tại không
        const groupSnapshot = await db.ref(`group_chats/${group_id}`).once('value');
        if (!groupSnapshot.exists()) {
          socket.emit('error', { message: 'Nhóm không tồn tại' });
          return;
        }

        // Kiểm tra người gửi có trong nhóm không
        const memberSnapshot = await db.ref(`group_members/${group_id}_${sender_id}`).once('value');
        if (!memberSnapshot.exists() || memberSnapshot.val().status !== 'active') {
          socket.emit('error', { message: 'Bạn không phải là thành viên của nhóm này' });
          return;
        }

        // Tạo tin nhắn mới
        const messageRef = db.ref('group_messages').push();
        const message_id = messageRef.key;

        const messageData = {
          message_id,
          group_id,
          sender_id,
          content,
          type,
          status: 'sent',
          created_at: Date.now(),
          is_deleted: false
        };

        await messageRef.set(messageData);

        // Cập nhật thời gian cập nhật của nhóm
        await db.ref(`group_chats/${group_id}`).update({
          updated_at: Date.now()
        });

        // Gửi tin nhắn đến tất cả thành viên trong nhóm
        socket.to(group_id).emit('receive_group_message', messageData);

        // Phản hồi người gửi
        socket.emit('group_message_sent', { 
          message: 'Tin nhắn đã được gửi',
          message_id,
          messageData
        });
      } catch (error) {
        console.error('Lỗi khi gửi tin nhắn nhóm:', error);
        socket.emit('error', { message: 'Đã xảy ra lỗi khi gửi tin nhắn' });
      }
    });

    // Xử lý trạng thái đang nhập
    socket.on('typing', async (data) => {
      try {
        const { conversation_id, is_typing } = data;
        
        // Cập nhật trạng thái đang nhập
        await db.ref(`user_activity/${userId}`).update({
          typing_in: is_typing ? conversation_id : null,
          last_active: Date.now()
        });
        
        // Nếu là tin nhắn cá nhân
        if (conversation_id.indexOf('_') === -1) {
          socket.to(conversation_id).emit('user_typing', {
            user_id: userId,
            is_typing
          });
        } else {
          // Nếu là nhóm chat
          socket.to(conversation_id).emit('user_typing', {
            user_id: userId,
            is_typing,
            group_id: conversation_id
          });
        }
      } catch (error) {
        console.error('Lỗi khi cập nhật trạng thái đang nhập:', error);
      }
    });

    // Tham gia nhóm chat
    socket.on('join_group', async (group_id) => {
      try {
        // Kiểm tra người dùng có trong nhóm không
        const memberSnapshot = await db.ref(`group_members/${group_id}_${userId}`).once('value');
        if (memberSnapshot.exists() && memberSnapshot.val().status === 'active') {
          socket.join(group_id);
          socket.emit('joined_group', { group_id });
        } else {
          socket.emit('error', { message: 'Bạn không phải là thành viên của nhóm này' });
        }
      } catch (error) {
        console.error('Lỗi khi tham gia nhóm chat:', error);
        socket.emit('error', { message: 'Đã xảy ra lỗi khi tham gia nhóm chat' });
      }
    });

    // Xử lý ngắt kết nối
    socket.on('disconnect', () => {
      console.log(`Người dùng ${userId} đã ngắt kết nối`);
      
      // Cập nhật trạng thái offline
      db.ref(`user_activity/${userId}`).update({
        is_online: false,
        last_active: Date.now(),
        typing_in: null
      });
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO chưa được khởi tạo');
  }
  return io;
};

module.exports = {
  initSocket,
  getIO
};
