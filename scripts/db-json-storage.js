require('dotenv').config();
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs").promises;
const path = require("path");

class YandexStorageJSONManager {
  constructor() {
    const accessKeyId = process.env.YANDEX_ACCESS_KEY_ID;
    const secretAccessKey = process.env.YANDEX_SECRET_ACCESS_KEY;
    const bucketName = process.env.YANDEX_BUCKET_DB_NAME;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('❌ Необходимо установить переменные окружения YANDEX_ACCESS_KEY_ID и YANDEX_SECRET_ACCESS_KEY');
    }

    this.client = new S3Client({
      region: 'ru-central1',
      endpoint: 'https://storage.yandexcloud.net',
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey
      }
    });
    this.bucketName = bucketName;
  }

  // Загрузить JSON в YOS
  async uploadJSON(key, data) {
    const params = {
      Bucket: this.bucketName,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      ACL: 'public-read',
    };

    try {
      const command = new PutObjectCommand(params);
      await this.client.send(command);
      const publicUrl = `https://${this.bucketName}.storage.yandexcloud.net/${key}`;
      console.log(`✅ JSON загружен: ${publicUrl}`);
      return publicUrl;
    } catch (err) {
      console.error('❌ Ошибка при загрузке JSON в YOS:', err);
      throw err;
    }
  }

  // Прочитать JSON из YOS
  async readJSON(key) {
    const params = {
      Bucket: this.bucketName,
      Key: key,
    };

    try {
      const command = new GetObjectCommand(params);
      const response = await this.client.send(command);
      const data = await response.Body.transformToString();
      return JSON.parse(data);
    } catch (err) {
      if (err.name === 'NoSuchKey') {
        console.log('ℹ️  Файл не найден в YOS:', key);
        return null;
      }
      console.error('❌ Ошибка при чтении JSON из YOS:', err);
      throw err;
    }
  }

  // Загрузить локальный JSON в YOS
  async uploadLocalJSON(jsonFilePath = './data/cards.json', remoteKey = 'cards.json') {
    try {
      const data = await fs.readFile(jsonFilePath, 'utf8');
      const jsonData = JSON.parse(data);

      await this.uploadJSON(remoteKey, jsonData);
      console.log('✅ Данные JSON успешно загружены в YOS.');
    } catch (err) {
      console.error('❌ Ошибка при загрузке JSON в YOS:', err);
      throw err;
    }
  }

  // Скачать JSON из YOS и сохранить локально
  async downloadJSONToLocal(remoteKey = 'cards.json', localFilePath = './data/cards.json') {
    try {
      const data = await this.readJSON(remoteKey);

      if (data) {
        await fs.writeFile(localFilePath, JSON.stringify(data, null, 2));
        console.log(`✅ JSON скачан из YOS и сохранён в ${localFilePath}`);
      } else {
        console.log('ℹ️  Файл не найден в YOS.');
      }
    } catch (err) {
      console.error('❌ Ошибка при скачивании JSON из YOS:', err);
      throw err;
    }
  }
}

// Обработка аргументов командной строки
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  (async () => {
    const manager = new YandexStorageJSONManager();

    if (command === 'upload') {
      await manager.uploadLocalJSON();
    } else if (command === 'load') {
      await manager.downloadJSONToLocal();
    } else {
      console.log('ℹ️  Использование: node yos-json-storage.js [upload|load]');
    }
  })();
}

module.exports = YandexStorageJSONManager;
