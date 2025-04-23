const { S3Client, PutObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
require('dotenv').config(); // Đảm bảo biến môi trường được load

// SDK sẽ tự động lấy credentials và region từ environment variables
const s3Client = new S3Client({});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;
const AWS_REGION = process.env.AWS_REGION;

if (!BUCKET_NAME || !AWS_REGION) {
    console.error("Lỗi: Thiếu cấu hình S3_BUCKET_NAME hoặc AWS_REGION trong file .env");
    // Có thể throw Error ở đây để dừng ứng dụng nếu cấu hình S3 là bắt buộc
}

/**
 * Tải file lên S3 với quyền đọc công khai.
 * @param {Buffer} fileBuffer Nội dung file buffer.
 * @param {string} originalFileName Tên file gốc (để lấy extension).
 * @param {string} mimetype Loại MIME của file.
 * @param {string} destinationPath Tiền tố thư mục trên S3 (ví dụ: 'avatars', 'posts', 'chat-media').
 * @returns {Promise<string>} URL công khai của file trên S3.
 * @throws {Error} Nếu có lỗi khi tải lên.
 */
const uploadPublicFileToS3 = async (fileBuffer, originalFileName, mimetype, destinationPath) => {
    if (!BUCKET_NAME || !AWS_REGION) {
        throw new Error("Cấu hình S3 bucket hoặc region bị thiếu.");
    }

    // Tạo key duy nhất với tiền tố thư mục và timestamp
    const fileExtension = originalFileName.split('.').pop();
    const uniqueKey = `${destinationPath}/${Date.now()}_${Math.random().toString(36).substring(2, 15)}.${fileExtension}`;

    const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: uniqueKey,
        Body: fileBuffer,
        ContentType: mimetype
        
    };

    try {
        const command = new PutObjectCommand(uploadParams);
        await s3Client.send(command);

        // Tạo URL public trực tiếp
        const url = `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${uniqueKey}`;

        console.log(`File uploaded publicly to S3: ${url}`);
        return url;
    } catch (err) {
        console.error(`Error uploading public file to S3 (${uniqueKey}):`, err);
        throw new Error('Không thể tải file lên S3.'); // Ném lỗi chung chung hơn
    }
};

/**
 * Xóa file khỏi S3.
 * @param {string} fileUrl URL công khai của file S3 cần xóa.
 * @returns {Promise<void>}
 * @throws {Error} Nếu có lỗi khi xóa.
 */
const deleteFileFromS3 = async (fileUrl) => {
     if (!fileUrl || !BUCKET_NAME || !AWS_REGION) {
        console.warn("Attempted to delete file with invalid URL or missing S3 config.");
        return; // Không làm gì nếu URL không hợp lệ hoặc thiếu config
    }

    // Trích xuất key từ URL
    // Ví dụ URL: https://your-bucket.s3.your-region.amazonaws.com/avatars/167888...jpg
    // Key cần lấy là: avatars/167888...jpg
    let fileKey;
    try {
        const urlParts = new URL(fileUrl);
        // Key là phần path sau dấu '/' đầu tiên
        fileKey = urlParts.pathname.substring(1);
    } catch (e) {
         console.error("Invalid S3 URL format for deletion:", fileUrl);
         return; // Không thể trích xuất key
    }


    if (!fileKey) {
        console.warn("Could not extract S3 key from URL:", fileUrl);
        return;
    }

    const deleteParams = {
        Bucket: BUCKET_NAME,
        Key: fileKey,
    };

    try {
        const command = new DeleteObjectCommand(deleteParams);
        await s3Client.send(command);
        console.log(`File deleted from S3: ${fileKey}`);
    } catch (err) {
        // Lỗi 'NoSuchKey' thường không nghiêm trọng nếu file đã bị xóa trước đó
        if (err.name === 'NoSuchKey') {
            console.warn(`File already deleted or not found on S3: ${fileKey}`);
        } else {
            console.error(`Error deleting file from S3 (${fileKey}):`, err);
            // Quyết định xem có nên ném lỗi hay không.
            // throw new Error('Không thể xóa file khỏi S3.');
        }
    }
};


module.exports = {
    uploadPublicFileToS3,
    deleteFileFromS3
};
