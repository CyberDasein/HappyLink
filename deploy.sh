#!/bin/bash

echo "🚀 Деплой в ветку deploy..."

# Проверяем наличие docs
if [ ! -d "docs" ]; then
  echo "❌ Папка docs не найдена"
  exit 1
fi

# Получаем URL удаленного репозитория
REMOTE_URL=$(git remote get-url origin)
if [ -z "$REMOTE_URL" ]; then
  echo "❌ Не найден удаленный репозиторий origin"
  exit 1
fi

echo "🔗 Удаленный репозиторий: $REMOTE_URL"

# Создаем временную папку
TEMP_DIR="/tmp/deploy-$(date +%s)"
mkdir -p "$TEMP_DIR"

# Клонируем репозиторий в временную папку
echo "📥 Клонируем репозиторий..."
git clone "$REMOTE_URL" "$TEMP_DIR"
cd "$TEMP_DIR"

# Переключаемся на ветку deploy или создаем её
echo "🌿 Работаем с веткой deploy..."
if git show-ref --verify --quiet refs/heads/deploy; then
  git checkout deploy
else
  git checkout -b deploy
fi

# Очищаем текущее содержимое ветки deploy
echo "🧹 Очищаем содержимое ветки deploy..."
git rm -rf . >/dev/null 2>&1 || true

# Копируем содержимое docs из основного репозитория
echo "📁 Копируем новое содержимое..."
cp -r "$OLDPWD/docs"/* .

# Добавляем файлы и коммитим
echo "💾 Создаем коммит..."
git add .
git commit -m "Deploy build $(date)" || echo "ℹ️  Нет изменений для коммита"

# Пушим в ветку deploy
echo "📤 Пушим в ветку deploy..."
git push origin deploy

# Возвращаемся и очищаем
echo "🧹 Очищаем временную папку..."
cd "$OLDPWD"
rm -rf "$TEMP_DIR"

echo "✅ Деплой завершен!"
