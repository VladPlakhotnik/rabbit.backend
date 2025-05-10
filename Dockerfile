FROM node:18-alpine

WORKDIR /app

# Установка pnpm
RUN npm install -g pnpm@10.8.1

# Копирование файлов зависимостей и конфигов
COPY package.json pnpm-lock.yaml tsconfig.json nest-cli.json ./

# Установка зависимостей
RUN pnpm install

# Копирование исходного кода
COPY . .

# Сборка проекта
RUN pnpm build

# Открытие порта
EXPOSE 5000

# Запуск приложения
CMD ["pnpm", "dev"] 