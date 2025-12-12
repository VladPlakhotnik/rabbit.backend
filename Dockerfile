FROM node:18-alpine

WORKDIR /app

# Копирование файлов зависимостей и конфигов
COPY package.json yarn.lock tsconfig.json nest-cli.json ./

# Установка зависимостей
RUN yarn install --frozen-lockfile

# Копирование исходного кода
COPY . .

# Сборка проекта
RUN yarn build

# Открытие порта
EXPOSE 5000

# Запуск приложения
CMD ["yarn", "dev"] 