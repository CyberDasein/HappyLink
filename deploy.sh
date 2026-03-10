#!/bin/bash

echo "🚀 Деплой в ветку deploy..."

# Проверяем наличие docs
if [ ! -d "docs" ]; then
  echo "❌ Папка docs не найдена"
  exit 1
fi

# Получаем URL целевого репозитория (можно переопределить через TARGET_REPO_URL)
# Если TARGET_REPO_URL не задан, используем origin текущего репозитория
TARGET_REPO_URL=${TARGET_REPO_URL:-}
if [ -z "$TARGET_REPO_URL" ]; then
  REPO_URL=$(git remote get-url origin)
else
  REPO_URL="$TARGET_REPO_URL"
fi

# Целевая ветка (по умолчанию 'deploy'), можно переопределить через TARGET_BRANCH
TARGET_BRANCH=${TARGET_BRANCH:-deploy}

# Создаем временную папку
TEMP_DIR="/tmp/deploy-$(date +%s)"
mkdir -p "$TEMP_DIR"

echo "📥 Клонируем ветку $TARGET_BRANCH из $REPO_URL ..."
# Клонируем целевую ветку, если есть — иначе создаём новый репозиторий и ветку
if git ls-remote --heads "$REPO_URL" "$TARGET_BRANCH" | grep -q "$TARGET_BRANCH"; then
  git clone --branch "$TARGET_BRANCH" --single-branch "$REPO_URL" "$TEMP_DIR"
  cd "$TEMP_DIR"
else
  # Если ветки нет, клонируем репозиторий и создаём ветку
  git clone "$REPO_URL" "$TEMP_DIR"
  cd "$TEMP_DIR"
  git checkout -b "$TARGET_BRANCH"
fi

# Ensure git won't automatically convert EOLs in the working copy (avoid LF -> CRLF warnings on Windows)
git config core.autocrlf false || true
git config core.eol lf || true
git config core.safecrlf false || true

echo "📁 Обновляем содержимое..."
# Удаляем старые файлы (кроме .git) — переносимый и безопасный способ
# Не используем сложные find-выражения, которые на некоторых платформах могут удалить .git
for item in ./* ./.??*; do
  # пропускаем, если ничего не найдено
  [ -e "$item" ] || continue
  # не трогаем .git
  if [ "$item" = "./.git" ]; then
    continue
  fi
  rm -rf "$item"
done

# Копируем новые файлы из сборки (если есть)
if [ -d "$OLDPWD/docs" ]; then
  cp -r "$OLDPWD/docs"/* . || true
fi

echo "💾 Коммитим изменения..."
git add .
git commit -m "Deploy build $(date)" || echo "ℹ️  Нет изменений для коммита"

echo "📤 Пушим в ветку $TARGET_BRANCH в $REPO_URL ..."
# Пушим в удалённый репозиторий (если TARGET_REPO_URL задан и это не origin, добавим remote 'target')
if [ -n "$TARGET_REPO_URL" ]; then
  # убедимся, что remote target существует
  if git remote | grep -q '^target$'; then
    git remote remove target || true
  fi
  git remote add target "$TARGET_REPO_URL"
  git add .
  git commit -m "Deploy build $(date)" || echo "ℹ️  Нет изменений для коммита"
  git push target "$TARGET_BRANCH"
else
  git push origin "$TARGET_BRANCH"
fi

echo "🧹 Очищаем временную папку..."
cd "$OLDPWD"
rm -rf "$TEMP_DIR"

echo "✅ Деплой завершен!"
