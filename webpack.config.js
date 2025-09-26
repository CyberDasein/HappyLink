const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const fs = require('fs');

// Функция для генерации коротких буквенных ссылок
function generateRandomPath(path, index) {
  const chars = 'abcdefghijklmnopqrstuvwxyz123456789';
  let result = '';

  // Базовая часть из имени
  const namePart = path.toLowerCase()
    .replace(/[^a-zа-яё]/g, '')

  // Добавляем случайные буквы
  for (let i = 0; i < 9; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return namePart + "-" + result;
}

function generateEntriesAndPlugins() {
  // Загружаем готовые карточки
  let existingCards = [];
  if (fs.existsSync('./data/cards.json')) {
    existingCards = JSON.parse(fs.readFileSync('./data/cards.json', 'utf-8'));
  }

  // Загружаем новые карточки
  let newCards = [];
  if (fs.existsSync('./data/new-cards.json')) {
    newCards = JSON.parse(fs.readFileSync('./data/new-cards.json', 'utf-8'));
  }

  let updatedNewCards = false;

  // Обрабатываем новые карточки - только генерируем пути
  newCards.forEach((card, index) => {
    // Генерируем путь для новых карточек
    const entryName = generateRandomPath(card.path, index);
    card.generatedPath = entryName;
    updatedNewCards = true;
    console.log(`🆕 Новый путь для ${card.path}: ${entryName}`);
  });

  // Сохраняем обновленные данные
  if (updatedNewCards) {
    // Добавляем новые карточки к существующим
    const updatedExistingCards = [...existingCards, ...newCards];
    fs.writeFileSync('./data/cards.json', JSON.stringify(updatedExistingCards, null, 2));
    // Очищаем файл новых карточек
    fs.writeFileSync('./data/new-cards.json', '[]');
    console.log('💾 Обновлены cards.json, new-cards.json очищен');

    // Используем обновленные данные
    allCards = updatedExistingCards;
  } else {
    // Если новых карточек нет, используем существующие
    allCards = existingCards;
  }

  const htmlPlugins = [];

  allCards.forEach((card, index) => {
    // Используем сгенерированный путь
    const entryName = card.generatedPath;
    const templatePath = `./src/templates/${card.template}/${card.template}-${card.gender}.ejs`;

    if (entryName) {
      let extraParams = {};
      // Автоматически подключаем все картинки из папки шаблона
      const imagesDir = path.resolve(__dirname, `src/templates/${card.template}/images`);
      if (fs.existsSync(imagesDir)) {
        const imageFiles = fs.readdirSync(imagesDir).filter(f => /\.(png|jpe?g|gif|svg|webp)$/i.test(f));
        extraParams.images = {};
        imageFiles.forEach(img => {
          const varName = img.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
          extraParams.images[varName] = `../assets/${img}`;
        });
      }
      htmlPlugins.push(
        new HtmlWebpackPlugin({
          filename: `${entryName}/index.html`,
          chunks: ['main', card.template],
          inject: true,
          minify: process.env.NODE_ENV === 'production' ? {
            removeComments: true,
            collapseWhitespace: true,
          } : false,
          template: templatePath,
          templateParameters: {
            cardDataJson: card,
            ...extraParams
          }
        })
      );
    }
  });

  const entries = {
    main: './src/js/index.js'
  };

  // Добавляем CSS entry points для каждого уникального шаблона
  const uniqueTemplates = [...new Set(allCards.map(card => card.template))];
  uniqueTemplates.forEach(template => {
    const cssPath = `./src/scss/${template}.scss`;
    if (fs.existsSync(cssPath)) {
      entries[template] = cssPath;
    }
  });
  
  return { entries, htmlPlugins };
}
const { entries, htmlPlugins } = generateEntriesAndPlugins();

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    entry: entries,
    cache: {
      type: 'filesystem',
      buildDependencies: {
        config: [__filename]
      }
    },
    output: {
      path: path.resolve(__dirname, 'docs'),
      filename: isProduction ? '[name].[contenthash].js' : '[name].js',
      assetModuleFilename: 'assets/[name].[contenthash].[ext]',
      clean: true,
    },
    devServer: {
      static: './docs',
      open: true,
    },
    devtool: isProduction ? 'source-map' : 'eval-cheap-module-source-map',
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env'],
              cacheDirectory: true,
            },
          },
        },
        {
          test: /\.scss$/,
          use: [
            MiniCssExtractPlugin.loader,
            'css-loader',
            {
              loader: 'sass-loader',
              options: {
                sassOptions: {
                  silenceDeprecations: ['slash-div']
                }
              }
            }
          ],
        },
        {
          test: /\.html$/,
          use: [
            {
              loader: 'html-loader',
              options: {
                minimize: isProduction,
              },
            },
          ],
        },
        {
          test: /\.(png|jpe?g|gif|svg|webp)$/i,
          type: 'asset',
          parser: {
            dataUrlCondition: {
              maxSize: 8 * 1024,
            },
          },
          use: (function() {
            // image-webpack-loader is slow; only enable in production builds
            if (isProduction) {
              return [
                {
                  loader: 'image-webpack-loader',
                  options: {
                    mozjpeg: { progressive: true, quality: 80 },
                    optipng: { enabled: true },
                    pngquant: { quality: [0.6, 0.8], speed: 4 },
                    gifsicle: { interlaced: false },
                    webp: { quality: 80 },
                  },
                },
              ];
            }
            return [];
          })(),
        },
      ],
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: isProduction ? '[name].[contenthash].css' : '[name].css',
      }),
      // Images are pre-minified and copied to docs/assets by scripts/minify-images.js
      ...htmlPlugins,
    ],
    optimization: {
      splitChunks: {
        chunks: 'all',
      },
    },
  };
};
