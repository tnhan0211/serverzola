const { firestore, db, admin } = require("../config/firebase");
const { FieldValue } = require("firebase-admin/firestore");
const { uploadPublicFileToS3 } = require("../utils/s3Client");
const multer = require("multer");
const { createNotification } = require("./notifications");
const { request } = require("express");
const { response } = require("express");

// Hàm kiểm tra người dùng có bị chặn không
const checkIfBlocked = async (userId, targetUserId) => {
  const privacySnapshot = await db.ref(`user_privacy/${targetUserId}`).once('value');
  const privacy = privacySnapshot.val() || { blocked_users: [] };
  return privacy.blocked_users?.includes(userId) || false;
};

const createPost = async (req, res, next) => {
  try {
    const { content, visibility = "everyone" } = req.body;
    const user_id = req.user.uid;
    const file = req.file;

    let mediaUrl = null;
    let mediaType = null;

    if (file) {
      if (!content && !file) {
        return res
          .status(400)
          .json({ error: "Bài viết phải có nội dung hoặc hình ảnh, video!" });
      }
      try {
        mediaUrl = await uploadPublicFileToS3(
          file.buffer,
          file.originalname,
          file.mimetype,
          "posts"
        );
        mediaType = file.mimetype.startsWith("image/")
          ? "image"
          : file.mimetype.startsWith("video/")
          ? "video"
          : null;
      } catch (uploadError) {
        console.error("Lỗi khi tải lên media file", uploadError);
        return res
          .status(500)
          .json({ error: "Lỗi server khi tải ảnh/video lên" });
      }
    } else if (!content) {
      return res.status(400).json({ error: "Bài viết phải có nội dung!" });
    }

    const postData = {
      user_id,
      content: content || null,
      media_url: mediaUrl,
      media_type: mediaType,
      visibility,
      like_count: 0,
      comment_count: 0,
      create_at: FieldValue.serverTimestamp(),
      update_at: FieldValue.serverTimestamp(),
      is_deleted: false,
    };

    // Ghi vào Firestore
    const postsCollectionRef = firestore.collection("posts");
    const newPostDocRef = await postsCollectionRef.add(postData);

    // Lấy lại dữ liệu vừa ghi để có timestamp thực
    const savedPostSnap = await newPostDocRef.get();
    const savedPostData = savedPostSnap.data();

    // Ghi vào Realtime Database
    const userPostsRef = db.ref(`posts/${user_id}/${newPostDocRef.id}`);
    await userPostsRef.set(true);

    console.log("Bài viết mới đã được tạo với ID: ", newPostDocRef.id);

    res.status(201).json({
      message: "Bài đăng đã được tạo",
      postId: newPostDocRef.id,
      post: {
        ...savedPostData,
        post_id: newPostDocRef.id,
      },
    });
  } catch (error) {
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ error: `Lỗi Multer: ${error.message}` });
    } else if (error.message === "Chỉ chấp nhận file ảnh!") {
      return res.status(400).json({ error: error.message });
    }
    console.error("Lỗi khi tạo bài viết (Firestore): ", error);
    next(error);
  }
};

const deletePost = async (req, res, next) => {
  try {
    const postId = req.params.postId;
    const userId = req.user.uid;

    const postRef = firestore.collection("posts").doc(postId);
    const postSnap = await postRef.get();

    if (!postSnap.exists) {
      return res.status(404).json({ error: "Bài viết không tồn tại" });
    }

    const postData = postSnap.data();
    if (postData.user_id !== userId) {
      return res
        .status(403)
        .json({ error: "Bạn không có quyền xoá bài viết này" });
    }

    await postRef.update({
      is_deleted: true,
      update_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Cập nhật Realtime Database
    const userPostRef = db.ref(`posts/${userId}/${postId}`);
    await userPostRef.remove();

    res.json({ message: "Bài viết đã được xoá (đánh dấu là is_deleted)" });
  } catch (error) {
    console.error("Lỗi khi xoá bài viết:", error);
    next(error);
  }
};
const updatePost = async (req, res, next) => {
  try {
    const postId = req.params.postId;
    const userId = req.user.uid;
    const { content, visibility } = req.body;
    const file = req.file;

    const postRef = firestore.collection("posts").doc(postId);
    const postSnap = await postRef.get();

    if (!postSnap.exists) {
      return res.status(404).json({ error: "Bài viết không tồn tại" });
    }

    const postData = postSnap.data();
    if (postData.user_id !== userId) {
      return res
        .status(403)
        .json({ error: "Bạn không có quyền chỉnh sửa bài viết này" });
    }

    const updateData = {
      update_at: FieldValue.serverTimestamp(),
    };

    if (content) updateData.content = content;
    if (visibility) updateData.visibility = visibility;

    if (file) {
      const mediaUrl = await uploadPublicFileToS3(
        file.buffer,
        file.originalname,
        file.mimetype,
        "posts"
      );
      updateData.media_url = mediaUrl;
      updateData.media_type = file.mimetype.startsWith("image/")
        ? "image"
        : file.mimetype.startsWith("video/")
        ? "video"
        : null;
    }

    await postRef.update(updateData);

    res.json({ message: "Bài viết đã được cập nhật" });
  } catch (error) {
    console.error("Lỗi khi cập nhật bài viết:", error);
    next(error);
  }
};

const likePost = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user.uid;

    //Checking post is existing
    const postRef = firestore.collection("posts").doc(postId);
    const postDoc = await postRef.get();
    if (!postDoc.exists) {
      return res.status(404).json({ error: "Bài viết không tồn tại" });
    }

    const postData = postDoc.data();
    
    // Kiểm tra xem người đăng bài có chặn người like không
    const isBlocked = await checkIfBlocked(userId, postData.user_id);
    if (isBlocked) {
      return res.status(403).json({ error: "Bạn không thể tương tác với bài viết này" });
    }

    //Checking is liked?
    const likeRef = postRef.collection("likes").doc(userId);
    const likeDoc = await likeRef.get();
    if (likeDoc.exists) {
      return res.status(404).json({ error: "Bạn đã like bài viết này rồi" });
    }

    //Like trong subcollection
    await likeRef.set({
      user_id: userId,
      create_at: FieldValue.serverTimestamp(),
    });
    //Cap nhat so luot thich
    await postRef.update({
      like_count: FieldValue.increment(1),
    });
    //Cap nhat vao RTDB
    const userLikeRef = db.ref(`likes/${userId}/${postId}`);
    await userLikeRef.set(true);
    res.status(200).json({ message: "Đã thích bài viết!" });
  } catch (error) {
    console.error("Không thể thích bài viết", error);
    next(error);
  }
};

const unlikePost = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user.uid;
    //Checking post is existing
    const postRef = firestore.collection("posts").doc(postId);
    const postDoc = await postRef.get();
    if (!postDoc.exists) {
      return res.status(404).json({ error: "Bài viết không tồn tại" });
    }

    const postData = postDoc.data();
    
    // Kiểm tra xem người đăng bài có chặn người unlike không
    const isBlocked = await checkIfBlocked(userId, postData.user_id);
    if (isBlocked) {
      return res.status(403).json({ error: "Bạn không thể tương tác với bài viết này" });
    }

    //Checking is liked?
    const likeRef = postRef.collection("likes").doc(userId);
    const likeDoc = await likeRef.get();
    if (!likeDoc.exists) {
      return res.status(404).json({ error: "Bạn chưa like bài viết này!" });
    }
    //del like
    await likeRef.delete();
    await postRef.update({
      like_count: FieldValue.increment(-1),
    });
    //del from RTDB
    const userLikeRef = db.ref(`likes/${userId}/${postId}`);
    await userLikeRef.remove();
    res.status(200).json({ message: "Đã bỏ thích bài viết!" });
  } catch (error) {
    console.error("Không thể bỏ thích bài viết", error);
    next(error);
  }
};

const addComment = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;
    const userId = req.user.uid;

    if (!content || content.trim() === "") {
      return res
        .status(400)
        .json({ error: "Nội dung bình luận không được để trống" });
    }
    const postRef = firestore.collection("posts").doc(postId);
    const postDoc = await postRef.get();

    if (!postDoc.exists) {
      return res.status(404).json({ error: "Bài viết không tồn tại" });
    }

    const postData = postDoc.data();
    
    // Kiểm tra xem người đăng bài có chặn người comment không
    const isBlocked = await checkIfBlocked(userId, postData.user_id);
    if (isBlocked) {
      return res.status(403).json({ error: "Bạn không thể bình luận bài viết này" });
    }

    //Tạo comment
    const commentRef = postRef.collection("comments").doc();
    const commentData = {
      user_id: userId,
      content: content.trim(),
      create_at: FieldValue.serverTimestamp(),
      is_deleted: false,
    };

    await commentRef.set(commentData);
    //Update so luong comments
    await postRef.update({
      comment_count: FieldValue.increment(1),
    });

    //Update to RTDB
    const userCommentRef = db.ref(`comments/${userId}/${commentRef.id}`);
    await userCommentRef.set(true);

    // Lấy thông tin user từ RTDB
    const userRef = db.ref(`users/${userId}`);
    const userSnapshot = await userRef.get();
    const userData = userSnapshot.val();

    // Tạo thông báo cho chủ bài viết (nếu không phải chính họ comment)
    if (postData.user_id !== userId) {
      // Lấy thông tin bài viết để hiển thị trong thông báo
      const notificationData = {
        type: 'post_comment',
        actor_id: userId,
        actor_name: userData.first_name + userData.last_name || 'Người dùng Zola',
        actor_avatar: userData.photoURL || null,
        post_id: postId,
        content: content.trim().substring(0, 50) + (content.length > 50 ? '...' : ''),
        post_content: postData.content ? postData.content.substring(0, 50) + (postData.content.length > 50 ? '...' : '') : 'bài viết của bạn'
      };

      await createNotification(postData.user_id, notificationData);
    }

    res.status(200).json({
      message: "Đã comment bài viết!",
      comment: {
        ...commentData,
        comment_id: commentRef.id,
        userInfo: {
          displayName: userData.displayName,
          photoURL: userData.photoURL
        }
      }
    });
  } catch (error) {
    console.error("Lỗi khi thêm bình luận", error);
    next(error);
  }
};

const deleteComment = async(req, res, next)=>{
  try {
    const {postId, commentId} = req.params;
    const userId = req.user.uid;
    
    const postRef = firestore.collection('posts').doc(postId);
    const postDoc = await postRef.get();
    if(!postDoc.exists){
      return res.status(404).json({error: 'Bài viết không tồn tại'});
    }

    const postData = postDoc.data();
    
    // Kiểm tra xem người đăng bài có chặn người xóa comment không
    const isBlocked = await checkIfBlocked(userId, postData.user_id);
    if (isBlocked) {
      return res.status(403).json({ error: "Bạn không thể tương tác với bài viết này" });
    }

    const commentRef = postRef.collection('comments').doc(commentId);
    const commentDoc = await commentRef.get();
    if(!commentDoc.exists){
      return res.status(404).json({error: 'Comment không tồn tại'});
    }
    const commentData = commentDoc.data();
    //soft delete
    await commentRef.update({
      is_deleted: true
    });
    //Giam sl comments
    await postRef.update({
      comment_count: FieldValue.increment(-1)
    });

    //Update RTDB
    const userCommentRef = db.ref(`comments/${commentData.user_id}/${commentId}`);
    await userCommentRef.remove();
    res.status(200).json({message: 'Đã xóa bình luận'});
  } catch (error) {
    console.error('Lỗi server khi xóa bình luận', error);
    next(error);
  }
}
const getPosts = async(req, res)=>{

  try {
    const {postId} = request.params;
    const {limit = 10, startAfter} = req.query;
    const userId = req.user.uid;

    const postRef = firestore.collection('posts').doc(postId);
    const postDoc = await postRef.get();
    if(!postDoc.exists()){
      return res.status(404).json({error: 'Bài viết không tồn tại'});
    }

    const postData = postDoc.data();

    const isBlocked = await checkIfBlocked(userId, postData.user_id);
    if(isBlocked){
      return res.status(403).json({ error: "Bạn không thể xem bài viết này" });
    }
    
    //query posts
    let postsQuery = postRef
  } catch (error) {
    res.status(500).json({error: "Lỗi server"});
    
  }
};
const getComments = async(req, res, next)=>{
  try {
    const {postId}= req.params;
    const {limit= 10, startAfter} = req.query;
    const userId = req.user.uid;
    
    const postRef = firestore.collection('posts').doc(postId);
    const postDoc = await postRef.get();
    if(!postDoc.exists){
      return res.status(404).json({error: 'Bài viết không tồn tại'});
    }

    const postData = postDoc.data();
    
    // Kiểm tra xem người đăng bài có chặn người xem comment không
    const isBlocked = await checkIfBlocked(userId, postData.user_id);
    if (isBlocked) {
      return res.status(403).json({ error: "Bạn không thể xem bình luận của bài viết này" });
    }

    //query comment tu subcollection
    let commentsQuery = postRef.collection('comments')
      .orderBy('create_at', 'desc')
      .limit(parseInt(limit));

    if(startAfter){
      const startAfterDoc = await postRef.collection('comments').doc(startAfter).get();
      if(startAfterDoc.exists){
        commentsQuery = commentsQuery.startAfter(startAfterDoc);
      }
    }

    const commentsSnapshot = await commentsQuery.get();
    const comments = [];
    const userIds = new Set();

    // Lấy comments và user IDs
    commentsSnapshot.forEach(doc =>{
      const commentData = doc.data();
      // Chỉ thêm comment chưa bị xóa
      if (!commentData.is_deleted) {
        userIds.add(commentData.user_id);
        comments.push({
          id: doc.id,
          content: commentData.content,
          user_id: commentData.user_id,
          create_at: commentData.create_at
        });
      }
    });

    // Lấy thông tin users từ RTDB
    const usersRef = db.ref('users');
    const userPromises = Array.from(userIds).map(userId => 
      usersRef.child(userId).get()
    );
    const userSnapshots = await Promise.all(userPromises);

    // Tạo object users chứa thông tin user
    const users = {};
    userSnapshots.forEach(snapshot => {
      if (snapshot.exists()) {
        const userData = snapshot.val();
        users[snapshot.key] = {
          id: snapshot.key,
          displayName: userData.first_name + ' ' + userData.last_name || 'Người dùng Zola',
          photoURL: userData.photoURL || null
        };
      }
    });

    // Chỉ lấy cursor tiếp theo nếu số lượng comment chưa bị xóa đạt limit
    let nextPageCursor = null;
    if (comments.length === parseInt(limit)) {
      nextPageCursor = comments[comments.length - 1].id;
    }

    res.status(200).json({
      post_id: postId,
      users: users, // Object chứa thông tin các users
      comments: comments, // Array chứa các comments
      pagination: {
        next_cursor: nextPageCursor,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Lỗi khi lấy danh sách bình luận:', error);
    next(error);
  }
};

const getMyPosts = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const { limit = 10, startAfter } = req.query;

    // Query bài viết từ Firestore
    let postsQuery = firestore.collection('posts')
      .orderBy('create_at', 'desc')
      .limit(parseInt(limit));

    if (startAfter) {
      const startAfterDoc = await firestore.collection('posts').doc(startAfter).get();
      if (startAfterDoc.exists) {
        postsQuery = postsQuery.startAfter(startAfterDoc);
      }
    }

    const postsSnapshot = await postsQuery.get();
    const posts = [];

    // Lấy thông tin user từ RTDB
    const userRef = db.ref(`users/${userId}`);
    const userSnapshot = await userRef.get();
    const userData = userSnapshot.val();

    postsSnapshot.forEach(doc => {
      const postData = doc.data();
      // Chỉ thêm bài viết của user hiện tại và chưa bị xóa
      if (postData.user_id === userId && !postData.is_deleted) {
        posts.push({
          post_id: doc.id,
          ...postData,
          user_info: {
            user_id: userId,
            displayName: userData.first_name + ' ' + userData.last_name || 'Người dùng Zola',
            photoURL: userData.photoURL || null
          }
        });
      }
    });

    // Xác định cursor cho trang tiếp theo nếu đủ số lượng bài viết hợp lệ
    let nextPageCursor = null;
    if (posts.length === parseInt(limit)) {
      nextPageCursor = posts[posts.length - 1].post_id;
    }

    res.status(200).json({
      posts,
      pagination: {
        next_cursor: nextPageCursor,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Lỗi khi lấy danh sách bài viết:', error);
    next(error);
  }
};

const getUserPosts = async (req, res, next) => {
  try {
    const { userId: targetUserId } = req.params;
    const currentUserId = req.user.uid;
    const { limit = 10, startAfter } = req.query;

    // Kiểm tra xem có bị chặn không
    const isBlocked = await checkIfBlocked(currentUserId, targetUserId);
    if (isBlocked) {
      return res.status(403).json({ error: "Bạn không thể xem bài viết của người này" });
    }

    // Kiểm tra trạng thái bạn bè
    const friendshipRef = db.ref(`friendships/${currentUserId}/${targetUserId}`);
    const friendshipSnapshot = await friendshipRef.once('value');
    const friendship = friendshipSnapshot.val();
    const isFriend = friendship && friendship.status === 'accepted';

    // Query bài viết từ Firestore
    let postsQuery = firestore.collection('posts')
      .orderBy('create_at', 'desc')
      .limit(parseInt(limit) * 3); // Tăng limit lên để đảm bảo đủ số lượng sau khi lọc

    if (startAfter) {
      const startAfterDoc = await firestore.collection('posts').doc(startAfter).get();
      if (startAfterDoc.exists) {
        postsQuery = postsQuery.startAfter(startAfterDoc);
      }
    }

    const postsSnapshot = await postsQuery.get();
    const posts = [];

    // Lấy thông tin user từ RTDB
    const userRef = db.ref(`users/${targetUserId}`);
    const userSnapshot = await userRef.get();
    const userData = userSnapshot.val();

    postsSnapshot.forEach(doc => {
      const postData = doc.data();
      // Chỉ thêm bài viết của user target, chưa bị xóa và có quyền xem
      if (postData.user_id === targetUserId && 
          !postData.is_deleted && 
          (isFriend || postData.visibility === 'everyone')) {
        posts.push({
          post_id: doc.id,
          ...postData,
          user_info: {
            user_id: targetUserId,
            displayName: userData.first_name + ' ' + userData.last_name || 'Người dùng Zola',
            photoURL: userData.photoURL || null
          }
        });

        // Dừng nếu đã đủ số lượng bài viết cần thiết
        if (posts.length === parseInt(limit)) {
          return false; // Break forEach loop
        }
      }
    });

    // Xác định cursor cho trang tiếp theo
    let nextPageCursor = null;
    if (posts.length === parseInt(limit)) {
      nextPageCursor = posts[posts.length - 1].post_id;
    }

    res.status(200).json({
      posts,
      pagination: {
        next_cursor: nextPageCursor,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Lỗi khi lấy danh sách bài viết:', error);
    next(error);
  }
};

const getPostsFriends = async(req, res, next)=>{
  try {
    const currentUserId = req.user.uid;
    const {limit = 10, startAfter} = req.query;

    // 1. Lấy danh sách bạn bè
    const friendshipsRef = db.ref(`friendships/${currentUserId}`);
    const friendshipsSnapshot = await friendshipsRef.once('value');
    const friendships = friendshipsSnapshot.val() || {};

    // Lọc ra danh sách ID của bạn bè đã chấp nhận
    const friendIds = Object.entries(friendships)
      .filter(([_, data]) => data.status === 'accepted')
      .map(([friendId, _]) => friendId);

    if (friendIds.length === 0) {
      return res.status(200).json({
        posts: [],
        pagination: {
          next_cursor: null,
          limit: parseInt(limit)
        }
      });
    }

    // 2. Query bài viết từ Firestore
    let postsQuery = firestore.collection('posts')
      .orderBy('create_at', 'desc')
      .limit(parseInt(limit) * 3); // Tăng limit để đảm bảo đủ dữ liệu sau khi lọc

    if (startAfter) {
      const startAfterDoc = await firestore.collection('posts').doc(startAfter).get();
      if (startAfterDoc.exists) {
        postsQuery = postsQuery.startAfter(startAfterDoc);
      }
    }

    const postsSnapshot = await postsQuery.get();
    const posts = [];
    const userInfoMap = new Map(); // Cache thông tin user

    // 3. Lọc và xử lý bài viết
    for (const doc of postsSnapshot.docs) {
      const postData = doc.data();
      
      // Chỉ lấy bài viết của bạn bè và chưa bị xóa
      if (friendIds.includes(postData.user_id) && !postData.is_deleted) {
        // Lấy thông tin user nếu chưa có trong cache
        if (!userInfoMap.has(postData.user_id)) {
          const userRef = db.ref(`users/${postData.user_id}`);
          const userSnapshot = await userRef.get();
          const userData = userSnapshot.val();
          userInfoMap.set(postData.user_id, {
            user_id: postData.user_id,
            displayName: userData.first_name + ' ' + userData.last_name || 'Người dùng Zola',
            photoURL: userData.photoURL || null
          });
        }

        posts.push({
          post_id: doc.id,
          ...postData,
          user_info: userInfoMap.get(postData.user_id)
        });

        // Dừng khi đủ số lượng bài viết cần thiết
        if (posts.length === parseInt(limit)) {
          break;
        }
      }
    }

    // 4. Xác định cursor cho trang tiếp theo
    let nextPageCursor = null;
    if (posts.length === parseInt(limit)) {
      nextPageCursor = posts[posts.length - 1].post_id;
    }

    res.status(200).json({
      posts,
      pagination: {
        next_cursor: nextPageCursor,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Lỗi khi lấy danh sách bài viết của bạn bè:', error);
    next(error);
  }
};

const getNewsFeed = async (req, res, next) => {
  try {
    const currentUserId = req.user.uid;
    const { limit = 10, startAfter } = req.query;

    // 1. Lấy danh sách bạn bè
    const friendshipsRef = db.ref(`friendships/${currentUserId}`);
    const friendshipsSnapshot = await friendshipsRef.once('value');
    const friendships = friendshipsSnapshot.val() || {};

    // Lọc ra danh sách ID của bạn bè đã chấp nhận
    const friendIds = Object.entries(friendships)
      .filter(([_, data]) => data.status === 'accepted')
      .map(([friendId, _]) => friendId);

    // Thêm ID của người dùng hiện tại vào danh sách để lấy cả bài viết của họ
    friendIds.push(currentUserId);

    // 2. Query bài viết từ Firestore
    let postsQuery = firestore.collection('posts')
      .orderBy('create_at', 'desc')
      .limit(parseInt(limit) * 2); // Tăng limit để đảm bảo đủ dữ liệu sau khi lọc

    if (startAfter) {
      const startAfterDoc = await firestore.collection('posts').doc(startAfter).get();
      if (startAfterDoc.exists) {
        postsQuery = postsQuery.startAfter(startAfterDoc);
      }
    }

    const postsSnapshot = await postsQuery.get();
    const posts = [];
    const userInfoMap = new Map(); // Cache thông tin user

    // 3. Lọc và xử lý bài viết
    for (const doc of postsSnapshot.docs) {
      const postData = doc.data();
      
      // Kiểm tra quyền xem bài viết
      if (friendIds.includes(postData.user_id) && !postData.is_deleted) {
        // Nếu là bài viết của người khác và không công khai, chỉ hiện khi là bạn bè
        if (postData.user_id !== currentUserId && 
            postData.visibility !== 'everyone' && 
            !friendIds.includes(postData.user_id)) {
          continue;
        }

        // Lấy thông tin user nếu chưa có trong cache
        if (!userInfoMap.has(postData.user_id)) {
          const userRef = db.ref(`users/${postData.user_id}`);
          const userSnapshot = await userRef.get();
          const userData = userSnapshot.val();
          userInfoMap.set(postData.user_id, {
            user_id: postData.user_id,
            displayName: userData.first_name + ' ' + userData.last_name || 'Người dùng Zola',
            photoURL: userData.photoURL || null
          });
        }

        // 4. Lấy thông tin tương tác của người dùng hiện tại với bài viết
        const [likeSnapshot, commentSnapshot] = await Promise.all([
          firestore.collection('posts').doc(doc.id)
            .collection('likes').doc(currentUserId).get(),
          firestore.collection('posts').doc(doc.id)
            .collection('comments').where('user_id', '==', currentUserId).get()
        ]);

        posts.push({
          post_id: doc.id,
          ...postData,
          user_info: userInfoMap.get(postData.user_id),
          interaction: {
            has_liked: likeSnapshot.exists,
            has_commented: !commentSnapshot.empty
          }
        });

        // Dừng khi đủ số lượng bài viết cần thiết
        if (posts.length === parseInt(limit)) {
          break;
        }
      }
    }

    // 5. Sắp xếp lại theo thời gian và mức độ tương tác
    posts.sort((a, b) => {
      // Ưu tiên bài viết mới
      const timeWeight = b.create_at - a.create_at;
      
      // Cộng thêm điểm cho bài viết có tương tác
      const getInteractionScore = (post) => {
        let score = 0;
        if (post.interaction.has_liked) score += 2;
        if (post.interaction.has_commented) score += 3;
        return score;
      };
      
      const interactionWeight = getInteractionScore(b) - getInteractionScore(a);
      
      // Kết hợp các yếu tố (có thể điều chỉnh trọng số)
      return timeWeight + interactionWeight * 1000; // Tăng ảnh hưởng của tương tác
    });

    // 6. Xác định cursor cho trang tiếp theo
    let nextPageCursor = null;
    if (posts.length === parseInt(limit)) {
      nextPageCursor = posts[posts.length - 1].post_id;
    }

    res.status(200).json({
      posts,
      pagination: {
        next_cursor: nextPageCursor,
        limit: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Lỗi khi lấy newsfeed:', error);
    next(error);
  }
};

module.exports = {
  createPost,
  deletePost,
  updatePost,
  likePost,
  unlikePost,
  addComment,
  deleteComment,
  getComments,
  getMyPosts,
  getUserPosts,
  getPostsFriends,
  getNewsFeed
};
