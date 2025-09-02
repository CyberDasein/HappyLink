#!/bin/bash

echo "🚀 Деплой в ветку deploy..."

# Проверяем наличие docs
if [ ! -d "docs" ]; then
  echo "❌ Папка docs не найдена"
  exit 1
fi

# Создаем временную папку
TEMP_DIR="/tmp/deploy-$(date +%s)"
mkdir -p "$TEMP_DIR"

# Копируем docs
cp -r docs/* "$TEMP_DIR/"

# Сохраняем текущую директорию
ORIGINAL_DIR=$(pwd)

# Переходим во временную папку
cd "$TEMP_DIR"

# Создаем коммит
git init
git add .
git commit -m "Deploy build $(date)"

# Пушим в ветку deploy
git push -f origin deploy:deploy

# Возвращаемся и очищаем
cd "$ORIGINAL_DIR"
rm -rf "$TEMP_DIR"

echo "✅ Деплой завершен!"
