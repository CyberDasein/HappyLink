require('dotenv').config();
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

class YandexStorageUploader {
  constructor() {
    const accessKeyId = process.env.YANDEX_ACCESS_KEY_ID;
    const secretAccessKey = process.env.YANDEX_SECRET_ACCESS_KEY;
    const bucketName = process.env.YANDEX_BUCKET_NAME || 'postcards-bucket';

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
    this.tempDir = path.join(__dirname, 'temp-optimized');
    
    // Создаем временную папку для оптимизированных изображений
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async optimizeImage(inputPath, fileName) {
    try {
      const ext = path.extname(fileName).toLowerCase();
      const outputFileName = `${path.basename(fileName, ext)}.optimized${ext}`;
      const outputPath = path.join(this.tempDir, outputFileName);
      
      console.log(`🎨 Оптимизируем изображение: ${fileName}`);
      
      // Используем sharp для оптимизации
      let sharpInstance = sharp(inputPath);
      
      // Получаем метаданные
      const metadata = await sharpInstance.metadata();
      
      // Ограничиваем размер изображения
      let resizeOptions = {};
      if (metadata.width > 1200 || metadata.height > 1200) {
        resizeOptions = {
          width: Math.min(metadata.width, 1200),
          height: Math.min(metadata.height, 1200),
          fit: 'inside',
          withoutEnlargement: true
        };
        sharpInstance = sharpInstance.resize(resizeOptions);
      }
      
      // Применяем оптимизации в зависимости от типа файла
      switch (ext) {
        case '.jpg':
        case '.jpeg':
          sharpInstance = sharpInstance.jpeg({ 
            quality: 80,
            progressive: true,
            chromaSubsampling: '4:4:4'
          });
          break;
        case '.png':
          sharpInstance = sharpInstance.png({ 
            quality: 80,
            compressionLevel: 8,
            progressive: true
          });
          break;
        case '.webp':
          sharpInstance = sharpInstance.webp({ 
            quality: 80,
            lossless: false
          });
          break;
        default:
          // Для GIF и других форматов просто уменьшаем размер
          if (resizeOptions.width || resizeOptions.height) {
            // Уже применено выше
          }
      }
      
      // Сохраняем оптимизированное изображение
      await sharpInstance.toFile(outputPath);
      
      // Показываем статистику
      const originalSize = fs.statSync(inputPath).size;
      const optimizedSize = fs.statSync(outputPath).size;
      const savedPercent = Math.round((1 - optimizedSize / originalSize) * 100);
      
      console.log(`📊 Оптимизация: ${originalSize} → ${optimizedSize} байт (${savedPercent}% экономия)`);
      
      return outputPath;
      
    } catch (error) {
      console.warn(`⚠️  Ошибка оптимизации, используем оригинал: ${error.message}`);
      return inputPath;
    }
  }

  async uploadImage(localImagePath, remoteFileName) {
    try {
      if (!fs.existsSync(localImagePath)) {
        throw new Error(`Файл не найден: ${localImagePath}`);
      }

      // Оптимизируем изображение перед загрузкой
      const optimizedPath = await this.optimizeImage(localImagePath, remoteFileName);
      const finalPath = optimizedPath;
      
      console.log(`📤 Загружаем изображение`);
      const fileContent = fs.readFileSync(finalPath);
      const contentType = this.getContentType(finalPath);
      
      const params = {
        Bucket: this.bucketName,
        Key: `images/${remoteFileName}`,
        Body: fileContent,
        ACL: 'public-read',
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000' // 1 год кэширования
      };

      const command = new PutObjectCommand(params);
      await this.client.send(command);
      
      const publicUrl = `https://${this.bucketName}.storage.yandexcloud.net/images/${remoteFileName}`;
      
      // Удаляем временный файл оптимизированного изображения
      if (finalPath !== localImagePath && fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
      }
      
      console.log(`✅ Успешно загружено: ${publicUrl}`);
      return publicUrl;
    } catch (error) {
      console.error(`❌ Ошибка загрузки:`, error.message);
      throw error;
    }
  }

  getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    return contentTypes[ext] || 'image/jpeg';
  }

  // Очищаем временную папку
  cleanup() {
    if (fs.existsSync(this.tempDir)) {
      const files = fs.readdirSync(this.tempDir);
      files.forEach(file => {
        const filePath = path.join(this.tempDir, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
      fs.rmdirSync(this.tempDir);
      console.log('🧹 Временная папка очищена');
    }
  }
}

async function processCardsData() {
  try {
    if (!fs.existsSync('./data/new-cards.json')) {
      throw new Error('Файл data/new-cards.json не найден');
    }

    const cardsData = JSON.parse(fs.readFileSync('./data/new-cards.json', 'utf-8'));
    const uploader = new YandexStorageUploader();
    
    console.log('🚀 Начинаем обработку изображений...');
    console.log(`📊 Найдено карточек: ${cardsData.length}`);
    
    let updated = false;
    let successCount = 0;
    let errorCount = 0;
    
    for (const [index, card] of cardsData.entries()) {
      console.log(`\n--- Обработка карточки ${index + 1}/${cardsData.length}: ${card.name} ---`);
      
      if (card.photo && !card.photo.startsWith('https://storage.yandexcloud')) {
        const localImagePath = path.resolve(__dirname, card.photo);
        console.log(`📁 Локальный путь: ${localImagePath}`);
        
        if (fs.existsSync(localImagePath)) {
          try {
            console.log(`📤 Загружаем изображение для ${card.name}`);
            
            const fileExtension = path.extname(card.photo);
            const baseName = card.slug || card.name || `card-${index}`;
            const fileName = `${baseName.replace(/[^a-zA-Z0-9-_]/g, '-')}-${Date.now()}${fileExtension}`;
            
            console.log(`🏷️  Имя файла в хранилище: ${fileName}`);
            
            const publicUrl = await uploader.uploadImage(localImagePath, fileName);
            
            card.photo = publicUrl;
            updated = true;
            successCount++;
            
            console.log(`✅ Ссылка обновлена для ${card.name}: ${publicUrl}`);
            
          } catch (error) {
            errorCount++;
            console.error(`❌ Не удалось загрузить изображение для ${card.name}:`, error.message);
          }
        } else {
          console.log(`⚠️  Файл не найден, пропускаем: ${localImagePath}`);
        }
      } else {
        console.log(`ℹ️  Уже содержит URL или пустое поле, пропускаем: ${card.photo || 'пусто'}`);
      }
    }
    
    console.log(`\n📊 Статистика: ${successCount} успешно, ${errorCount} ошибок`);
    
    if (updated) {
      fs.writeFileSync('./data/new-cards.json', JSON.stringify(cardsData, null, 2));
      console.log('💾 Данные new-cards.json обновлены');
    } else {
      console.log('ℹ️  Нет изменений для сохранения');
    }
    
    // Очищаем временные файлы
    uploader.cleanup();
    
    return cardsData;
  } catch (error) {
    console.error('❌ Критическая ошибка обработки данных:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Запуск если файл вызван напрямую
if (require.main === module) {
  console.log('🔧 Проверка переменных окружения...');
  console.log('YANDEX_ACCESS_KEY_ID:', process.env.YANDEX_ACCESS_KEY_ID ? '✓ Установлен' : '❌ Не установлен');
  console.log('YANDEX_SECRET_ACCESS_KEY:', process.env.YANDEX_SECRET_ACCESS_KEY ? '✓ Установлен' : '❌ Не установлен');
  console.log('YANDEX_BUCKET_NAME:', process.env.YANDEX_BUCKET_NAME || 'postcards-bucket (по умолчанию)');
  
  processCardsData();
}

module.exports = processCardsData;
