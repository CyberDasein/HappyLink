#!/bin/bash

echo "🚀 Деплой в ветку deploy..."

# Проверяем наличие docs
if [ ! -d "docs" ]; then
  echo "❌ Папка docs не найдена"
  exit 1
fi

# Получаем URL репозитория
REPO_URL=$(git remote get-url origin)

# Создаем временную папку
TEMP_DIR="/tmp/deploy-$(date +%s)"
mkdir -p "$TEMP_DIR"

echo "📥 Клонируем ветку deploy..."
# Клонируем только ветку deploy
if git ls-remote --heads "$REPO_URL" deploy | grep -q deploy; then
  git clone --branch deploy --single-branch "$REPO_URL" "$TEMP_DIR"
  cd "$TEMP_DIR"
else
  # Если ветки deploy нет, создаем новую
  git clone "$REPO_URL" "$TEMP_DIR"
  cd "$TEMP_DIR"
  git checkout -b deploy
fi

echo "📁 Обновляем содержимое..."
# Удаляем старые файлы (кроме .git)
find . -not -path "./.git/*" -not -name ".git" -not -path "." -delete 2>/dev/null || true
find . -not -path "./.git" -not -name ".git" -type d -empty -delete 2>/dev/null || true

# Копируем новые файлы
cp -r "$OLDPWD/docs"/* .

echo "💾 Коммитим изменения..."
git add .
git commit -m "Deploy build $(date)" || echo "ℹ️  Нет изменений для коммита"

echo "📤 Пушим в ветку deploy..."
git push origin deploy

echo "🧹 Очищаем временную папку..."
cd "$OLDPWD"
rm -rf "$TEMP_DIR"

echo "✅ Деплой завершен!"
