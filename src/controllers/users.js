const { auth, db } = require("../config/firebase");
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const { uploadPublicFileToS3, deleteFileFromS3 } = require("../utils/s3Client");
const multer = require("multer");
require("dotenv").config();

// Lấy thông tin người dùng theo ID
const getUserProfile = async (req, res) => {
  try {
    const uid = req.params.id; // Lấy ID từ URL

    const userSnapshot = await db.ref(`users/${uid}`).once("value");
    const userData = userSnapshot.val();

    if (!userData) {
      return res.status(404).json({ error: "Không tìm thấy người dùng" });
    }

    // Loại bỏ trường password_hash trước khi trả về
    delete userData.password_hash;

    // Đảm bảo trường status luôn tồn tại
    if (!userData.status) {
      userData.status = "active"; // Giá trị mặc định nếu chưa có
    }

    res.status(200).json(userData);
  } catch (error) {
    console.error("Lỗi khi lấy thông tin người dùng:", error);
    res.status(500).json({ error: error.message });
  }
};

// Cập nhật thông tin người dùng
const updateUserProfile = async (req, res) => {
  try {
    const targetUid = req.params.id;
    const currentUser = req.user;
    const file = req.file;
    if (currentUser.uid !== targetUid) {
      return res
        .status(403)
        .json({ error: "Bạn không có quyền cập nhật thông tin!" });
    }
    // Kiểm tra user tồn tại
    const userSnapshot = await db.ref(`users/${targetUid}`).once("value");
    if (!userSnapshot.exists()) {
      return res.status(404).json({ error: "Không tìm thấy người dùng" });
    }

    const userData = userSnapshot.val();
    const {
      first_name,
      last_name,
      email,
      phone_number,
      bio,
      date_of_birth,
      gender,
    } = req.body;
    const updateData = {};

    // Chỉ thêm các trường có giá trị vào updateData
    let newAvatarUrl = userData.avatar_url;
    if (file) {
      try {
        //upload file img to avatars folder in S3
        newAvatarUrl = await uploadPublicFileToS3(
          file.buffer,
          file.originalname,
          file.mimetype,
          "avatars"
        );

        //delete old avartar
        if (userData.avatar_url) {
          if (
            userData.avatar_url.includes(".s3.") &&
            userData.avatar_url.includes(process.env.S3_BUCKET_NAME)
          ) {
            await deleteFileFromS3(userData.avatar_url);
          } else {
            console.log(
              "This Avatar is not on S3, ignore delete",
              userData.avatar_url
            );
          }
        }
      } catch (uploadError) {
        console.error("Can't upload the avatar", uploadError);
        return res.status(500).json({ error: "Server cant upload the avatar" });
      }
    }
    updateData.avatar_url = newAvatarUrl;
    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined) updateData.last_name = last_name;

    if (bio !== undefined) updateData.bio = bio;

    // Kiểm tra và cập nhật ngày sinh
    if (date_of_birth !== undefined) {
      // Kiểm tra định dạng ngày sinh (YYYY-MM-DD)
      const dateFormat = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateFormat.test(date_of_birth)) {
        return res.status(400).json({
          error:
            "Ngày sinh không đúng định dạng. Vui lòng sử dụng định dạng YYYY-MM-DD (VD: 2000-12-31)",
        });
      }

      // Chuyển đổi date_of_birth thành đối tượng Date
      const [year, month, day] = date_of_birth.split("-").map(Number);
      const birthDate = new Date(year, month - 1, day); // month - 1 vì tháng trong JS bắt đầu từ 0
      const today = new Date();

      // Kiểm tra tính hợp lệ của ngày sinh
      if (
        isNaN(birthDate.getTime()) ||
        birthDate.getFullYear() !== year ||
        birthDate.getMonth() !== month - 1 ||
        birthDate.getDate() !== day
      ) {
        return res.status(400).json({ error: "Ngày sinh không hợp lệ" });
      }

      // Kiểm tra ngày sinh không được trong tương lai
      if (birthDate > today) {
        return res
          .status(400)
          .json({ error: "Ngày sinh không thể là ngày trong tương lai" });
      }

      // Tính tuổi
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birthDate.getDate())
      ) {
        age--;
      }

      // Kiểm tra tuổi có nằm trong khoảng hợp lệ không (13-120 tuổi)
      if (age < 13) {
        return res
          .status(400)
          .json({ error: "Người dùng phải từ 13 tuổi trở lên" });
      }
      if (age > 120) {
        return res
          .status(400)
          .json({ error: "Tuổi không hợp lệ (không thể lớn hơn 120)" });
      }

      updateData.date_of_birth = date_of_birth;
    }

    // Kiểm tra và cập nhật giới tính
    if (gender !== undefined) {
      if (!["male", "female"].includes(gender)) {
        return res.status(400).json({ error: "Giới tính không hợp lệ" });
      }
      updateData.gender = gender;
    }

    // Kiểm tra và cập nhật email
    if (email !== undefined && email !== userData.email) {
      // Kiểm tra email có hợp lệ không
      if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        return res.status(400).json({ error: "Email không hợp lệ" });
      }

      // Kiểm tra email đã tồn tại chưa
      const emailSnapshot = await db
        .ref("users")
        .orderByChild("email")
        .equalTo(email)
        .once("value");

      if (emailSnapshot.exists()) {
        return res.status(400).json({ error: "Email đã được sử dụng" });
      }

      updateData.email = email;

      // Cập nhật email trong Firebase Auth
      try {
        await auth.updateUser(targetUid, { email });
      } catch (error) {
        console.error("Lỗi khi cập nhật email trong Firebase Auth:", error);
        return res.status(400).json({ error: "Không thể cập nhật email" });
      }
    }

    // Kiểm tra và cập nhật số điện thoại
    if (phone_number !== undefined && phone_number !== userData.phone_number) {
      // Kiểm tra số điện thoại có hợp lệ không
      if (phone_number && !phone_number.match(/^\+?[0-9]{10,15}$/)) {
        return res.status(400).json({ error: "Số điện thoại không hợp lệ" });
      }

      // Kiểm tra số điện thoại đã tồn tại chưa
      if (phone_number) {
        const phoneSnapshot = await db
          .ref("users")
          .orderByChild("phone_number")
          .equalTo(phone_number)
          .once("value");

        if (phoneSnapshot.exists()) {
          return res
            .status(400)
            .json({ error: "Số điện thoại đã được sử dụng" });
        }
      }

      updateData.phone_number = phone_number;
    }

    // Thêm thời gian cập nhật
    updateData.updated_at = admin.database.ServerValue.TIMESTAMP;

    // Thực hiện cập nhật trong Realtime Database
    await db.ref(`users/${targetUid}`).update(updateData);

    // Lấy dữ liệu mới nhất sau khi cập nhật
    const updatedSnapshot = await db.ref(`users/${targetUid}`).once("value");
    const updatedData = updatedSnapshot.val();

    // Loại bỏ thông tin nhạy cảm trước khi trả về
    const { password_hash, ...safeUserData } = updatedData;

    res.status(200).json({
      message: "Thông tin người dùng đã được cập nhật thành công",
      user: safeUserData,
    });
  } catch (error) {
    console.error("Lỗi khi cập nhật thông tin người dùng:", error);
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ error: `Lỗi Multer: ${error.message}` });
    } else if (error.message === "Chỉ chấp nhận file ảnh!") {
      return res.status(400).json({ error: error.message });
    }
    res
      .status(500)
      .json({ error: "Có lỗi xảy ra khi cập nhật thông tin người dùng" });
  }
};

// Xóa người dùng (chỉ admin mới có quyền)
const deleteUser = async (req, res) => {
  try {
    const uid = req.params.id;
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Không tìm thấy token xác thực" });
    }

    const token = authHeader.split("Bearer ")[1];

    // Xác thực JWT token thay vì Firebase ID token
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);

    console.log("Token info:", decodedToken); // Thêm log để kiểm tra token

    // Kiểm tra quyền super_admin
    if (decodedToken.role === "super_admin") {
      await auth.deleteUser(uid);
      await db.ref(`users/${uid}`).remove();

      // Xóa các dữ liệu liên quan
      await db.ref(`friendships/${uid}`).remove();
      await db.ref(`friend_requests/${uid}`).remove();
      await db.ref(`user_tokens/${uid}`).remove();

      return res.status(200).json({ message: "Người dùng đã được xóa" });
    }

    // Kiểm tra quyền admin
    if (decodedToken.role === "admin") {
      // Kiểm tra xem user cần xóa có phải là super_admin không
      const userSnapshot = await db.ref(`users/${uid}`).once("value");
      const userData = userSnapshot.val();

      if (userData && userData.role === "super_admin") {
        return res
          .status(403)
          .json({ error: "Không thể xóa tài khoản super_admin" });
      }

      await auth.deleteUser(uid);
      await db.ref(`users/${uid}`).remove();

      // Xóa các dữ liệu liên quan
      await db.ref(`friendships/${uid}`).remove();
      await db.ref(`friend_requests/${uid}`).remove();
      await db.ref(`user_tokens/${uid}`).remove();

      return res.status(200).json({ message: "Người dùng đã được xóa" });
    }

    return res.status(403).json({ error: "Không có quyền xóa người dùng" });
  } catch (error) {
    console.error("Lỗi khi xóa người dùng:", error);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Token không hợp lệ" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token đã hết hạn" });
    }

    res.status(500).json({ error: error.message });
  }
};

/**
 * Tìm kiếm người dùng bằng email
 */
const searchUsersByEmail = async (req, res) => {
  try {
    const { email } = req.query;
    const currentUserId = req.user.uid;

    if (!email) {
      return res
        .status(400)
        .json({ error: "Thiếu thông tin email để tìm kiếm" });
    }

    // Lấy tất cả người dùng từ database
    const usersRef = db.ref("users");
    const usersSnapshot = await usersRef.once("value");
    const users = usersSnapshot.val();

    if (!users) {
      return res.status(200).json({ users: [] });
    }

    // Lọc người dùng theo email và loại bỏ thông tin nhạy cảm
    const filteredUsers = [];

    Object.keys(users).forEach((uid) => {
      const user = users[uid];

      // Bỏ qua người dùng hiện tại
      if (uid === currentUserId) return;

      // Kiểm tra email có chứa chuỗi tìm kiếm không (không phân biệt hoa thường)
      if (
        user.email &&
        user.email.toLowerCase().includes(email.toLowerCase())
      ) {
        // Loại bỏ thông tin nhạy cảm
        const { password_hash, ...safeUserData } = user;

        // Thêm uid vào dữ liệu người dùng
        filteredUsers.push({
          ...safeUserData,
          uid,
        });
      }
    });

    // Kiểm tra trạng thái kết bạn cho mỗi người dùng
    const usersWithFriendStatus = await Promise.all(
      filteredUsers.map(async (user) => {
        // Kiểm tra xem đã là bạn bè chưa
        const friendshipRef = db.ref(
          `friendships/${currentUserId}/${user.uid}`
        );
        const friendshipSnapshot = await friendshipRef.once("value");

        if (
          friendshipSnapshot.exists() &&
          friendshipSnapshot.val().status === "accepted"
        ) {
          return { ...user, friendship_status: "friends" };
        }

        // Kiểm tra xem đã gửi lời mời kết bạn chưa
        const sentRequestRef = db.ref(
          `friend_requests/${user.uid}/${currentUserId}`
        );
        const sentRequestSnapshot = await sentRequestRef.once("value");

        if (sentRequestSnapshot.exists()) {
          return { ...user, friendship_status: "request_sent" };
        }

        // Kiểm tra xem có lời mời kết bạn từ người dùng đích không
        const receivedRequestRef = db.ref(
          `friend_requests/${currentUserId}/${user.uid}`
        );
        const receivedRequestSnapshot = await receivedRequestRef.once("value");

        if (receivedRequestSnapshot.exists()) {
          return { ...user, friendship_status: "request_received" };
        }

        // Không có mối quan hệ
        return { ...user, friendship_status: "not_friends" };
      })
    );

    res.status(200).json({ users: usersWithFriendStatus });
  } catch (error) {
    console.error("Lỗi khi tìm kiếm người dùng:", error);
    res.status(500).json({ error: "Đã xảy ra lỗi khi tìm kiếm người dùng" });
  }
};

// Lấy thông tin trang cá nhân
const getProfilePage = async (req, res) => {
  try {
    const userId = req.params.id;
    const currentUserId = req.user.uid;

    // Lấy thông tin người dùng
    const userSnapshot = await db.ref(`users/${userId}`).once("value");
    const userData = userSnapshot.val();

    if (!userData) {
      return res.status(404).json({ error: "Không tìm thấy người dùng" });
    }

    // Kiểm tra mối quan hệ bạn bè
    const friendshipStatus = await checkFriendshipStatus(userId, currentUserId);

    // Lấy số lượng tin nhắn chưa đọc
    const unreadMessagesCount = await getUnreadMessagesCount(
      userId,
      currentUserId
    );

    // Lấy số lượng người bạn
    const friendsCount = await getFriendsCount(userId);

    // Lấy số lượng nhóm
    const groupsCount = await getGroupsCount(userId);

    // Lấy số lượng tin nhắn đã gửi
    const sentMessagesCount = await getSentMessagesCount(userId);

    // Lấy số lượng tin nhắn đã nhận
    const receivedMessagesCount = await getReceivedMessagesCount(userId);

    res.status(200).json({
      user: {
        ...userData,
        friendship_status: friendshipStatus,
        unread_messages_count: unreadMessagesCount,
        friends_count: friendsCount,
        groups_count: groupsCount,
        sent_messages_count: sentMessagesCount,
        received_messages_count: receivedMessagesCount,
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy thông tin trang cá nhân:", error);
    res
      .status(500)
      .json({ error: "Đã xảy ra lỗi khi lấy thông tin trang cá nhân" });
  }
};

// Hàm hỗ trợ: Kiểm tra mối quan hệ bạn bè
const checkFriendshipStatus = async (userId, currentUserId) => {
  if (userId === currentUserId) return "self";

  // Kiểm tra xem đã là bạn chưa
  const friendshipRef = db.ref(`friendships/${userId}/${currentUserId}`);
  const friendshipSnapshot = await friendshipRef.once("value");

  if (friendshipSnapshot.exists()) {
    return "friends";
  }

  // Kiểm tra xem đã gửi lời mời kết bạn chưa
  const sentRequestRef = db.ref(`friend_requests/${userId}/${currentUserId}`);
  const sentRequestSnapshot = await sentRequestRef.once("value");

  if (sentRequestSnapshot.exists()) {
    return "request_sent";
  }

  // Kiểm tra xem có lời mời kết bạn từ người dùng đích không
  const receivedRequestRef = db.ref(
    `friend_requests/${currentUserId}/${userId}`
  );
  const receivedRequestSnapshot = await receivedRequestRef.once("value");

  if (receivedRequestSnapshot.exists()) {
    return "request_received";
  }

  return "not_friends";
};

// Hàm hỗ trợ: Lấy số lượng tin nhắn chưa đọc
const getUnreadMessagesCount = async (userId, currentUserId) => {
  const messagesRef = db.ref("private_messages");
  const snapshot = await messagesRef
    .orderByChild("receiver_id")
    .equalTo(currentUserId)
    .once("value");

  let count = 0;
  snapshot.forEach((message) => {
    const msg = message.val();
    if (msg.sender_id === userId && msg.status === "sent") {
      count++;
    }
  });

  return count;
};

// Hàm hỗ trợ: Lấy số lượng người bạn
const getFriendsCount = async (userId) => {
  const friendshipsRef = db.ref(`friendships/${userId}`);
  const snapshot = await friendshipsRef.once("value");
  return snapshot.numChildren();
};

// Hàm hỗ trợ: Lấy số lượng nhóm
const getGroupsCount = async (userId) => {
  const groupsRef = db.ref(`group_members/${userId}`);
  const snapshot = await groupsRef.once("value");
  return snapshot.numChildren();
};

// Hàm hỗ trợ: Lấy số lượng tin nhắn đã gửi
const getSentMessagesCount = async (userId) => {
  const privateMessagesRef = db.ref("private_messages");
  const groupMessagesRef = db.ref("group_messages");

  const [privateSnapshot, groupSnapshot] = await Promise.all([
    privateMessagesRef.orderByChild("sender_id").equalTo(userId).once("value"),
    groupMessagesRef.orderByChild("sender_id").equalTo(userId).once("value"),
  ]);

  return privateSnapshot.numChildren() + groupSnapshot.numChildren();
};

// Hàm hỗ trợ: Lấy số lượng tin nhắn đã nhận
const getReceivedMessagesCount = async (userId) => {
  const privateMessagesRef = db.ref("private_messages");
  const snapshot = await privateMessagesRef
    .orderByChild("receiver_id")
    .equalTo(userId)
    .once("value");

  return snapshot.numChildren();
};

// Lấy thông tin trang cá nhân thông qua token
const getProfileByToken = async (req, res) => {
  try {
    const currentUserId = req.user.uid;
    console.log("Current user ID:", currentUserId); // Log ID người dùng

    // Lấy thông tin người dùng
    const userSnapshot = await db.ref(`users/${currentUserId}`).once("value");
    const userData = userSnapshot.val();

    // Log thông tin người dùng
    console.log("User data:", userData);

    if (!userData) {
      // Kiểm tra xem người dùng có tồn tại trong Firebase Auth không
      try {
        const userRecord = await auth.getUser(currentUserId);
        console.log("User exists in Firebase Auth:", userRecord.email);

        // Nếu người dùng tồn tại trong Firebase Auth nhưng không có trong Realtime Database
        // Tạo user trong Realtime Database
        await db.ref(`users/${currentUserId}`).set({
          uid: currentUserId,
          email: userRecord.email,
          first_name: userRecord.displayName || "",
          last_name: "",
          avatar_url: userRecord.photoURL || "",
          status: "active",
          role: "user",
          created_at: Date.now(),
        });

        // Lấy lại dữ liệu mới
        const newUserSnapshot = await db
          .ref(`users/${currentUserId}`)
          .once("value");
        const newUserData = newUserSnapshot.val();

        // Tiếp tục với dữ liệu mới
        userData = newUserData;
      } catch (authError) {
        console.error("Lỗi khi kiểm tra Firebase Auth:", authError);
        return res.status(404).json({ error: "Không tìm thấy người dùng" });
      }
    }

    // Kiểm tra mối quan hệ bạn bè (với chính mình)
    const friendshipStatus = "self";

    // Lấy số lượng tin nhắn chưa đọc
    const unreadMessagesCount = await getUnreadMessagesCount(
      currentUserId,
      currentUserId
    );

    // Lấy số lượng người bạn
    const friendsCount = await getFriendsCount(currentUserId);

    // Lấy số lượng nhóm
    const groupsCount = await getGroupsCount(currentUserId);

    // Lấy số lượng tin nhắn đã gửi
    const sentMessagesCount = await getSentMessagesCount(currentUserId);

    // Lấy số lượng tin nhắn đã nhận
    const receivedMessagesCount = await getReceivedMessagesCount(currentUserId);

    res.status(200).json({
      user: {
        ...userData,
        friendship_status: friendshipStatus,
        unread_messages_count: unreadMessagesCount,
        friends_count: friendsCount,
        groups_count: groupsCount,
        sent_messages_count: sentMessagesCount,
        received_messages_count: receivedMessagesCount,
      },
    });
  } catch (error) {
    console.error("Lỗi khi lấy thông tin trang cá nhân:", error);
    res
      .status(500)
      .json({ error: "Đã xảy ra lỗi khi lấy thông tin trang cá nhân" });
  }
};

module.exports = {
  getUserProfile,
  updateUserProfile,
  deleteUser,
  searchUsersByEmail,
  getProfilePage,
  getProfileByToken,
};
