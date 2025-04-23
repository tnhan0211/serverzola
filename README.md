# API Documentation

## Users API

### 1. Tìm kiếm người dùng theo email
- **Endpoint**: `GET /api/users/search/email`
- **Authentication**: Yêu cầu token
- **Query Parameters**:
  - `email`: Email cần tìm kiếm
- **Response**: 
```json
{
  "users": [
    {
      "uid": "string",
      "email": "string",
      "first_name": "string",
      "last_name": "string",
      "avatar_url": "string",
      "friendship_status": "friends|request_sent|request_received|not_friends"
    }
  ]
}
```

### 2. Lấy thông tin người dùng theo ID
- **Endpoint**: `GET /api/users/:id`
- **Authentication**: Không yêu cầu
- **Parameters**:
  - `id`: ID của người dùng
- **Response**:
```json
{
  "email": "string",
  "first_name": "string",
  "last_name": "string",
  "avatar_url": "string",
  "status": "active",
  "bio": "string",
  "date_of_birth": "YYYY-MM-DD",
  "gender": "male|female",
  "phone_number": "string"
}
```

### 3. Lấy thông tin trang cá nhân
- **Endpoint**: `GET /api/users/profile/:id`
- **Authentication**: Yêu cầu token
- **Parameters**:
  - `id`: ID của người dùng
- **Response**:
```json
{
  "user": {
    "email": "string",
    "first_name": "string",
    "last_name": "string",
    "avatar_url": "string",
    "friendship_status": "self|friends|request_sent|request_received|not_friends",
    "unread_messages_count": "number",
    "friends_count": "number",
    "groups_count": "number",
    "sent_messages_count": "number",
    "received_messages_count": "number"
  }
}
```

### 4. Lấy thông tin cá nhân qua token
- **Endpoint**: `GET /api/users/profile/me`
- **Authentication**: Yêu cầu token
- **Response**: Giống với endpoint `/api/users/profile/:id`

### 5. Cập nhật thông tin người dùng
- **Endpoint**: `PUT /api/users/:id`
- **Authentication**: Yêu cầu token
- **Parameters**:
  - `id`: ID của người dùng
- **Content-Type**: multipart/form-data
- **Request Body**:
  - `avatar`: File ảnh (tối đa 5MB)
  - `first_name`: string
  - `last_name`: string
  - `email`: string (phải là email hợp lệ)
  - `phone_number`: string (10-15 số)
  - `bio`: string
  - `date_of_birth`: string (format: YYYY-MM-DD)
  - `gender`: string ("male" hoặc "female")
- **Validation**:
  - Avatar: Chỉ chấp nhận file ảnh, tối đa 5MB
  - Email: Phải là email hợp lệ và chưa được sử dụng
  - Phone: 10-15 số và chưa được sử dụng
  - Date of birth: Format YYYY-MM-DD, tuổi từ 13-120
- **Response**:
```json
{
  "message": "Thông tin người dùng đã được cập nhật thành công",
  "user": {
    "email": "string",
    "first_name": "string",
    "last_name": "string",
    "avatar_url": "string",
    "bio": "string",
    "date_of_birth": "YYYY-MM-DD",
    "gender": "male|female",
    "phone_number": "string",
    "updated_at": "number"
  }
}
```

### 6. Xóa người dùng
- **Endpoint**: `DELETE /api/users/:id`
- **Authentication**: Yêu cầu token (chỉ admin và super_admin)
- **Parameters**:
  - `id`: ID của người dùng cần xóa
- **Authorization**:
  - Admin không thể xóa super_admin
  - Chỉ admin và super_admin mới có quyền xóa
- **Response**:
```json
{
  "message": "Người dùng đã được xóa"
}
```

## Authentication API

### 1. Đăng ký tài khoản
- **Endpoint**: `POST /api/auth/register`
- **Content-Type**: application/json
- **Request Body**:
```json
{
  "email": "string",
  "password": "string",
  "phone_number": "string",
  "first_name": "string",
  "last_name": "string",
  "role": "user|admin|super_admin" (optional)
}
```
- **Validation**:
  - Email: Bắt buộc, định dạng email hợp lệ
  - Password: Tối thiểu 6 ký tự, phải chứa ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt
  - Phone: 10-12 số, chỉ chứa số
  - First name & Last name: Bắt buộc, tối đa 50 ký tự, chỉ chứa chữ cái và khoảng trắng
  - Role: Chỉ super_admin mới có thể tạo tài khoản admin hoặc super_admin khác
- **Response**:
```json
{
  "message": "Đăng ký thành công",
  "uid": "string",
  "role": "string"
}
```

### 2. Đăng nhập
- **Endpoint**: `POST /api/auth/login`
- **Content-Type**: application/json
- **Request Body**:
```json
{
  "email": "string",
  "password": "string"
}
```
- **Response**:
```json
{
  "accessToken": "string",
  "refreshToken": "string",
  "user": {
    "uid": "string",
    "email": "string",
    "first_name": "string",
    "last_name": "string",
    "role": "string",
    "status": "string"
  }
}
```

### 3. Đăng xuất
- **Endpoint**: `POST /api/auth/signout`
- **Authentication**: Yêu cầu token
- **Request Body**:
```json
{
  "refreshToken": "string" (optional)
}
```
- **Response**:
```json
{
  "message": "Đăng xuất thành công"
}
```

### 4. Quên mật khẩu
- **Endpoint**: `POST /api/auth/forgot-password`
- **Content-Type**: application/json
- **Request Body**:
```json
{
  "email": "string"
}
```
- **Response**:
```json
{
  "message": "Email hướng dẫn đặt lại mật khẩu đã được gửi"
}
```

### 5. Đặt lại mật khẩu
- **Endpoint**: `POST /api/auth/reset-password`
- **Content-Type**: application/json
- **Request Body**:
```json
{
  "oobCode": "string",
  "newPassword": "string"
}
```
- **Validation**:
  - newPassword: Tối thiểu 6 ký tự
- **Response**:
```json
{
  "message": "Mật khẩu đã được đặt lại thành công"
}
```

### 6. Xác minh email
- **Endpoint**: `POST /api/auth/verify-email`
- **Content-Type**: application/json
- **Request Body**:
```json
{
  "email": "string"
}
```
- **Response**:
```json
{
  "message": "Email xác minh đã được gửi"
}
```

### 7. Làm mới token
- **Endpoint**: `POST /api/auth/refresh-token`
- **Content-Type**: application/json
- **Request Body**:
```json
{
  "refreshToken": "string"
}
```
- **Response**:
```json
{
  "accessToken": "string",
  "refreshToken": "string",
  "expiresIn": 3600
}
```

**Lưu ý về Authentication:**
- Access Token có hiệu lực trong 1 giờ
- Refresh Token có hiệu lực trong 30 ngày
- Tất cả các token đều được lưu trữ và quản lý trong database
- Khi đăng xuất, refresh token sẽ bị vô hiệu hóa
- Các trạng thái tài khoản: active, banned, suspended

## Activity API

### 1. Cập nhật trạng thái trực tuyến
- **Endpoint**: `PUT /api/activity/online`
- **Authentication**: Yêu cầu token
- **Content-Type**: application/json
- **Request Body**:
```json
{
  "is_online": "boolean"
}
```
- **Response**:
```json
{
  "message": "Trạng thái trực tuyến đã được cập nhật"
}
```

### 2. Lấy trạng thái hoạt động của một người dùng
- **Endpoint**: `GET /api/activity/:user_id`
- **Authentication**: Yêu cầu token
- **Parameters**:
  - `user_id`: ID của người dùng cần kiểm tra
- **Response**:
```json
{
  "is_online": "boolean",
  "last_active": "number|null",
  "typing_in": "string|null"
}
```
- **Lưu ý**: Nếu người dùng không tồn tại, trả về lỗi 404

### 3. Lấy trạng thái hoạt động của nhiều người dùng
- **Endpoint**: `POST /api/activity/batch`
- **Authentication**: Yêu cầu token
- **Content-Type**: application/json
- **Request Body**:
```json
{
  "user_ids": ["string"]
}
```
- **Response**:
```json
{
  "user_id1": {
    "is_online": "boolean",
    "last_active": "number|null",
    "typing_in": "string|null"
  },
  "user_id2": {
    "is_online": "boolean",
    "last_active": "number|null",
    "typing_in": "string|null"
  }
}
```
- **Validation**:
  - `user_ids` phải là một mảng không rỗng

**Lưu ý về Activity:**
- `last_active`: Thời gian hoạt động cuối cùng (timestamp)
- `typing_in`: ID của cuộc trò chuyện/nhóm mà người dùng đang nhập liệu
- Trạng thái mặc định khi không có dữ liệu: `is_online: false, last_active: null, typing_in: null`

## Chat API

### 1. Gửi tin nhắn cá nhân
- **Endpoint**: `POST /api/chat/private`
- **Authentication**: Yêu cầu token
- **Content-Type**: multipart/form-data
- **Request Body**:
  - `receiver_id`: id người nhận
  - `content`: string (optional)
  - `media`: File ảnh/video (optional, tối đa 25MB)
  - `type`: "text" (mặc định)
- **Validation**:
  - Phải có ít nhất content hoặc media
  - Media chỉ chấp nhận ảnh hoặc video
- **Response**:
```json
{
  "message": "Tin nhắn đã được gửi",
  "message_id": "string"
}
```

### 2. Lấy lịch sử tin nhắn cá nhân
- **Endpoint**: `GET /api/chat/private/:user_id`
- **Authentication**: Yêu cầu token
- **Response**: Array of messages
```json
[
  {
    "message_id": "string",
    "sender_id": "string",
    "receiver_id": "string",
    "content": "string",
    "type": "text|image|video",
    "media_url": "string|null",
    "status": "sent|read",
    "created_at": "number",
    "is_deleted": "boolean"
  }
]
```

### 3. Tạo nhóm chat
- **Endpoint**: `POST /api/chat/groups`
- **Authentication**: Yêu cầu token
- **Content-Type**: multipart/form-data
- **Request Body**:
  - `name`: string
  - `description`: string (optional)
  - `type`: "private|public" (optional, mặc định: "private")
  - `member_ids`: array of string
  - `avatar`: File ảnh (optional, tối đa 5MB)
- **Validation**:
  - Avatar: Chỉ chấp nhận file ảnh, tối đa 5MB
- **Response**:
```json
{
  "message": "Nhóm chat đã được tạo",
  "group_id": "string",
  "group_data": {
    "group_id": "string",
    "creator_id": "string",
    "name": "string",
    "description": "string",
    "type": "string",
    "avatar_url": "string|null",
    "created_at": "number",
    "updated_at": "number",
    "members_count": "number"
  }
}
```

### 4. Gửi tin nhắn nhóm
- **Endpoint**: `POST /api/chat/groups/message`
- **Authentication**: Yêu cầu token
- **Content-Type**: multipart/form-data
- **Request Body**:
  - `group_id`: string
  - `content`: string (optional)
  - `media`: File ảnh/video (optional, tối đa 25MB)
  - `type`: "text" (mặc định)
- **Response**: Giống với gửi tin nhắn cá nhân

### 5. Lấy tin nhắn nhóm
- **Endpoint**: `GET /api/chat/groups/:group_id/messages`
- **Authentication**: Yêu cầu token
- **Response**: Array of messages (format giống tin nhắn cá nhân)

### 6. Cập nhật trạng thái đang nhập
- **Endpoint**: `POST /api/chat/typing`
- **Authentication**: Yêu cầu token
- **Request Body**:
```json
{
  "conversation_id": "string",
  "is_typing": "boolean"
}
```
- **Response**:
```json
{
  "message": "Trạng thái đang nhập đã được cập nhật"
}
```

### 7. Lấy danh sách chat gần đây
- **Endpoint**: `GET /api/chat/sent`
- **Authentication**: Yêu cầu token
- **Response**:
```json
{
  "recent_chats": [
    {
      "type": "private",
      "user_info": {
        "user_id": "string",
        "displayName": "string",
        "photoURL": "string",
        "is_online": "boolean",
        "last_active": "number"
      },
      "last_message": {
        "message_id": "string",
        "sender_id": "string",
        "content": "string",
        "type": "string",
        "created_at": "number",
        "status": "string"
      }
    }
  ]
}
```

## Friend API

### 1. Gửi lời mời kết bạn
- **Endpoint**: `POST /api/friends/request`
- **Authentication**: Yêu cầu token
- **Request Body**:
```json
{
  "targetUserId": "string"
}
```
- **Response**:
```json
{
  "message": "Đã gửi lời mời kết bạn"
}
```

### 2. Chấp nhận lời mời kết bạn
- **Endpoint**: `POST /api/friends/accept`
- **Authentication**: Yêu cầu token
- **Request Body**:
```json
{
  "user_id": "string"
}
```
- **Response**:
```json
{
  "message": "Đã chấp nhận lời mời kết bạn"
}
```

### 3. Từ chối lời mời kết bạn
- **Endpoint**: `POST /api/friends/reject`
- **Authentication**: Yêu cầu token
- **Request Body**:
```json
{
  "user_id": "string"
}
```
- **Response**:
```json
{
  "message": "Đã từ chối lời mời kết bạn"
}
```

### 4. Hủy kết bạn
- **Endpoint**: `POST /api/friends/unfriend`
- **Authentication**: Yêu cầu token
- **Request Body**:
```json
{
  "friendId": "string"
}
```
- **Response**:
```json
{
  "message": "Đã hủy kết bạn"
}
```

### 5. Lấy danh sách bạn bè
- **Endpoint**: `GET /api/friends/list` hoặc `GET /api/friends/list/:userId`
- **Authentication**: Yêu cầu token
- **Response**:
```json
{
  "friends": [
    {
      "uid": "string",
      "email": "string",
      "first_name": "string",
      "last_name": "string",
      "avatar_url": "string"
    }
  ]
}
```

### 6. Lấy danh sách lời mời kết bạn
- **Endpoint**: `GET /api/friends/requests`
- **Authentication**: Yêu cầu token
- **Response**:
```json
{
  "requests": [
    {
      "sender": {
        "uid": "string",
        "email": "string",
        "first_name": "string",
        "last_name": "string"
      },
      "created_at": "number",
      "status": "pending"
    }
  ]
}
```

## Notification API

### 1. Lấy danh sách thông báo
- **Endpoint**: `GET /api/notifications`
- **Authentication**: Yêu cầu token
- **Query Parameters**:
  - `limit`: number (mặc định: 20)
  - `startAfter`: number
- **Response**:
```json
{
  "notifications": [
    {
      "id": "string",
      "type": "string",
      "actor_id": "string",
      "actor_name": "string",
      "actor_avatar": "string",
      "content": "string",
      "is_read": "boolean",
      "create_at": "number"
    }
  ],
  "pagination": {
    "next_cursor": "number|null",
    "limit": "number"
  }
}
```

### 2. Đánh dấu thông báo đã đọc
- **Endpoint**: `PUT /api/notifications/read`
- **Authentication**: Yêu cầu token
- **Request Body**:
```json
{
  "notification_ids": ["string"]
}
```
- **Response**:
```json
{
  "message": "Đã cập nhật trạng thái đọc thông báo"
}
```

### 3. Xóa thông báo
- **Endpoint**: `DELETE /api/notifications/:notification_id`
- **Authentication**: Yêu cầu token
- **Response**:
```json
{
  "message": "Đã xóa thông báo"
}
```

## Posts API

### 1. Tạo bài viết mới
- **Endpoint**: `POST /api/posts/create`
- **Authentication**: Yêu cầu token
- **Content-Type**: multipart/form-data
- **Request Body**:
  - `content`: string (optional)
  - `media`: File ảnh/video (optional, tối đa 25MB)
  - `visibility`: "everyone" (mặc định)
- **Response**:
```json
{
  "message": "Bài đăng đã được tạo",
  "postId": "string",
  "post": {
    "user_id": "string",
    "content": "string",
    "media_url": "string|null",
    "media_type": "image|video|null",
    "visibility": "string",
    "like_count": "number",
    "comment_count": "number",
    "create_at": "number",
    "update_at": "number"
  }
}
```

### 2. Cập nhật bài viết
- **Endpoint**: `PUT /api/posts/:postId`
- **Authentication**: Yêu cầu token
- **Content-Type**: multipart/form-data
- **Request Body**:
  - `content`: string (optional)
  - `media`: File ảnh/video (optional)
  - `visibility`: string (optional)
- **Response**:
```json
{
  "message": "Bài viết đã được cập nhật"
}
```

### 3. Xóa bài viết
- **Endpoint**: `DELETE /api/posts/:postId`
- **Authentication**: Yêu cầu token
- **Response**:
```json
{
  "message": "Bài viết đã được xóa"
}
```

### 4. Thích bài viết
- **Endpoint**: `POST /api/posts/:postId/like`
- **Authentication**: Yêu cầu token
- **Response**:
```json
{
  "message": "Đã thích bài viết"
}
```

### 5. Bỏ thích bài viết
- **Endpoint**: `DELETE /api/posts/:postId/like`
- **Authentication**: Yêu cầu token
- **Response**:
```json
{
  "message": "Đã bỏ thích bài viết"
}
```

### 6. Thêm bình luận
- **Endpoint**: `POST /api/posts/:postId/comments`
- **Authentication**: Yêu cầu token
- **Request Body**:
```json
{
  "content": "string"
}
```
- **Response**:
```json
{
  "message": "Đã comment bài viết",
  "comment": {
    "comment_id": "string",
    "user_id": "string",
    "content": "string",
    "create_at": "number",
    "is_deleted": "boolean",
    "userInfo": {
      "displayName": "string",
      "photoURL": "string"
    }
  }
}
```

### 7. Xóa bình luận
- **Endpoint**: `DELETE /api/posts/:postId/comments/:commentId`
- **Authentication**: Yêu cầu token
- **Response**:
```json
{
  "message": "Đã xóa bình luận"
}
```

### 8. Lấy danh sách bình luận
- **Endpoint**: `GET /api/posts/:postId/comments`
- **Authentication**: Yêu cầu token
- **Query Parameters**:
  - `limit`: number (mặc định: 10)
  - `startAfter`: string
- **Response**:
```json
{
  "post_id": "string",
  "users": {
    "user_id": {
      "id": "string",
      "displayName": "string",
      "photoURL": "string"
    }
  },
  "comments": [
    {
      "id": "string",
      "content": "string",
      "user_id": "string",
      "create_at": "number"
    }
  ],
  "pagination": {
    "next_cursor": "string|null",
    "limit": "number"
  }
}
```

### 9. Lấy danh sách bài viết của bản thân
- **Endpoint**: `GET /api/posts/me`
- **Authentication**: Yêu cầu token
- **Query Parameters**:
  - `limit`: number (mặc định: 10)
  - `startAfter`: string (post_id để phân trang)
- **Response**:
```json
{
  "posts": [
    {
      "post_id": "string",
      "user_id": "string",
      "content": "string",
      "media_url": "string|null",
      "media_type": "image|video|null",
      "visibility": "string",
      "like_count": "number",
      "comment_count": "number",
      "create_at": "number",
      "update_at": "number",
      "user_info": {
        "user_id": "string",
        "displayName": "string",
        "photoURL": "string"
      }
    }
  ],
  "pagination": {
    "next_cursor": "string|null",
    "limit": "number"
  }
}
```

### 10. Lấy danh sách bài viết của người dùng khác
- **Endpoint**: `GET /api/posts/user/:userId`
- **Authentication**: Yêu cầu token
- **Parameters**:
  - `userId`: ID của người dùng cần xem bài viết
- **Query Parameters**:
  - `limit`: number (mặc định: 10)
  - `startAfter`: string (post_id để phân trang)
- **Validation**:
  - Kiểm tra người dùng có bị chặn không
  - Nếu không phải bạn bè, chỉ hiển thị bài viết công khai
- **Response**: Giống với endpoint `/api/posts/me`

### 11. Lấy danh sách bài viết của bạn bè
- **Endpoint**: `GET /api/posts/friends`
- **Authentication**: Yêu cầu token
- **Query Parameters**:
  - `limit`: number (mặc định: 10)
  - `startAfter`: string (post_id để phân trang)
- **Response**:
```json
{
  "posts": [
    {
      "post_id": "string",
      "user_id": "string",
      "content": "string",
      "media_url": "string|null",
      "media_type": "image|video|null",
      "visibility": "string",
      "like_count": "number",
      "comment_count": "number",
      "create_at": "number",
      "update_at": "number",
      "user_info": {
        "user_id": "string",
        "displayName": "string",
        "photoURL": "string"
      }
    }
  ],
  "pagination": {
    "next_cursor": "string|null",
    "limit": "number"
  }
}
```

### 12. Lấy newsfeed
- **Endpoint**: `GET /api/posts/newsfeed`
- **Authentication**: Yêu cầu token
- **Query Parameters**:
  - `limit`: number (mặc định: 10)
  - `startAfter`: string (post_id để phân trang)
- **Response**:
```json
{
  "posts": [
    {
      "post_id": "string",
      "user_id": "string",
      "content": "string",
      "media_url": "string|null",
      "media_type": "image|video|null",
      "visibility": "string",
      "like_count": "number",
      "comment_count": "number",
      "create_at": "number",
      "update_at": "number",
      "user_info": {
        "user_id": "string",
        "displayName": "string",
        "photoURL": "string"
      },
      "interaction": {
        "has_liked": "boolean",
        "has_commented": "boolean"
      }
    }
  ],
  "pagination": {
    "next_cursor": "string|null",
    "limit": "number"
  }
}
```

**Lưu ý về Posts API:**
1. Phân trang:
   - Sử dụng cursor-based pagination
   - Mặc định 10 bài viết mỗi trang
   - Sắp xếp theo thời gian và mức độ tương tác

2. Quyền riêng tư:
   - Người dùng bị chặn không thể xem bài viết
   - Người không phải bạn bè chỉ xem được bài viết công khai
   - Với API bạn bè, chỉ hiển thị bài viết của những người đã chấp nhận kết bạn
   - Newsfeed hiển thị cả bài viết của bản thân và bạn bè

3. Thông tin trả về:
   - Bao gồm thông tin cơ bản của người đăng
   - Số lượt thích và bình luận
   - URL media nếu có
   - Thông tin tương tác của người dùng hiện tại với bài viết

4. Hiệu suất:
   - Cache thông tin người dùng để tránh truy vấn lặp lại
   - Tối ưu số lượng truy vấn database
   - Dừng xử lý khi đã đủ số lượng bài viết cần thiết

5. Thuật toán sắp xếp newsfeed:
   - Ưu tiên bài viết mới hơn
   - Tăng độ ưu tiên cho bài viết có tương tác của người dùng
   - Like: +2 điểm
   - Comment: +3 điểm
   - Có thể điều chỉnh trọng số để tối ưu hiển thị

## Privacy API

### 1. Lấy cài đặt quyền riêng tư
- **Endpoint**: `GET /api/privacy`
- **Authentication**: Yêu cầu token
- **Response**:
```json
{
  "user_id": "string",
  "blocked_users": ["string"],
  "allow_messages_from": "everyone|friends|nobody",
  "read_receipts": "boolean",
  "show_changes_message": "boolean"
}
```

### 2. Cập nhật cài đặt quyền riêng tư
- **Endpoint**: `PUT /api/privacy`
- **Authentication**: Yêu cầu token
- **Request Body**:
```json
{
  "allow_messages_from": "string",
  "read_receipts": "boolean",
  "show_changes_message": "boolean"
}
```
- **Response**:
```json
{
  "message": "Cài đặt quyền riêng tư đã được cập nhật"
}
```

### 3. Chặn người dùng
- **Endpoint**: `POST /api/privacy/block`
- **Authentication**: Yêu cầu token
- **Request Body**:
```json
{
  "blocked_user_id": "string"
}
```
- **Response**:
```json
{
  "message": "Đã chặn người dùng thành công"
}
```

### 4. Bỏ chặn người dùng
- **Endpoint**: `POST /api/privacy/unblock`
- **Authentication**: Yêu cầu token
- **Request Body**:
```json
{
  "blocked_user_id": "string"
}
```
- **Response**:
```json
{
  "message": "Đã bỏ chặn người dùng thành công"
}
```

### 5. Lấy danh sách người dùng đã chặn
- **Endpoint**: `GET /api/privacy/blocked`
- **Authentication**: Yêu cầu token
- **Response**:
```json
[
  {
    "user_id": "string",
    "first_name": "string",
    "last_name": "string",
    "avatar": "string"
  }
]
```

## Admin API

### 1. Thiết lập quyền cho người dùng
- **Endpoint**: `POST /api/admin/set-claims`
- **Authentication**: Yêu cầu token của super_admin
- **Content-Type**: application/json
- **Request Body**:
```json
{
  "uid": "string",
  "role": "admin|user|super_admin",
  "permissions": {
    "users": {
      "create": "boolean",
      "read": "boolean",
      "update": "boolean",
      "delete": "boolean"
    },
    "posts": {
      "delete": "boolean"
    }
  },
  "isSuperAdmin": "boolean"
}
```
- **Response**:
```json
{
  "message": "Đã thiết lập quyền thành công",
  "user": {
    "uid": "string",
    "role": "string",
    "claims": {
      "role": "string",
      "permissions": {
        "users": {
          "create": "boolean",
          "read": "boolean",
          "update": "boolean",
          "delete": "boolean"
        },
        "posts": {
          "delete": "boolean"
        }
      },
      "isSuperAdmin": "boolean"
    }
  }
}
```

### 2. Lấy danh sách người dùng (Super Admin)
- **Endpoint**: `GET /api/admin/users`
- **Authentication**: Yêu cầu token của super_admin
- **Response**:
```json
{
  "users": [
    {
      "uid": "string",
      "email": "string",
      "displayName": "string"
    }
  ]
}
```

### 3. Cập nhật trạng thái người dùng
- **Endpoint**: `PUT /api/admin/users/:id/status`
- **Authentication**: Yêu cầu token của admin hoặc super_admin
- **Content-Type**: application/json
- **Request Body**:
```json
{
  "status": "active|inactive|suspended|banned"
}
```
- **Validation**:
  - Chỉ super_admin mới có thể thay đổi trạng thái của super_admin khác
  - Admin không thể thay đổi trạng thái của super_admin
- **Response**:
```json
{
  "message": "Đã cập nhật trạng thái người dùng thành công",
  "user": {
    "uid": "string",
    "status": "string",
    "updated_at": "string"
  }
}
```

### 4. Tạo tài khoản admin nội bộ
- **Endpoint**: `POST /api/admin/internal-admin`
- **Authentication**: Yêu cầu token của super_admin
- **Content-Type**: application/json
- **Request Body**:
```json
{
  "email": "string",
  "password": "string",
  "first_name": "string",
  "last_name": "string",
  "permissions": {
    "users": {
      "create": "boolean",
      "read": "boolean",
      "update": "boolean",
      "delete": "boolean"
    },
    "posts": {
      "delete": "boolean"
    }
  }
}
```
- **Validation**:
  - Email phải đúng định dạng và chưa được sử dụng
  - Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt
  - Yêu cầu đầy đủ thông tin cơ bản (email, password, first_name, last_name)
- **Response**:
```json
{
  "message": "Tạo tài khoản admin nội bộ thành công",
  "admin": {
    "uid": "string",
    "email": "string",
    "first_name": "string",
    "last_name": "string",
    "role": "admin",
    "status": "active",
    "created_at": "string",
    "created_by": "string",
    "permissions": {
      "users": {
        "create": "boolean",
        "read": "boolean",
        "update": "boolean",
        "delete": "boolean"
      },
      "posts": {
        "delete": "boolean"
      }
    },
    "is_internal": true,
    "claims": {
      "role": "admin",
      "permissions": {
        "users": {
          "create": "boolean",
          "read": "boolean",
          "update": "boolean",
          "delete": "boolean"
        },
        "posts": {
          "delete": "boolean"
        }
      },
      "isSuperAdmin": false
    }
  }
}
```

**Lưu ý về Admin API:**
1. Phân quyền:
   - Super Admin có toàn quyền trong hệ thống
   - Admin có thể quản lý user thường nhưng không thể quản lý super admin
   - Admin nội bộ có các quyền được cấp phép cụ thể
   - User không có quyền truy cập các API admin

2. Xóa tài khoản:
   - Super Admin có thể xóa tài khoản user và admin
   - Admin chỉ có thể xóa tài khoản user
   - Không ai có thể xóa tài khoản super admin

3. Trạng thái tài khoản:
   - active: Tài khoản đang hoạt động
   - inactive: Tài khoản tạm ngưng
   - suspended: Tài khoản bị đình chỉ
   - banned: Tài khoản bị cấm vĩnh viễn

4. Bảo mật:
   - Tất cả các API admin đều yêu cầu xác thực
   - Token phải hợp lệ và chưa hết hạn
   - Role và permissions được kiểm tra nghiêm ngặt
