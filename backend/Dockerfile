# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar todas las dependencias para compilar
RUN npm ci

# Copiar archivos de configuración y código fuente
COPY tsconfig*.json nest-cli.json ./
COPY src/ ./src/

# Compilar la aplicación NestJS
RUN npm run build

# Stage 2: Production Runner
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copiar package*.json e instalar solo dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copiar artefactos compilados desde el builder
COPY --from=builder /app/dist ./dist

# Copiar scripts de base de datos por si se requiere ejecutar migraciones
COPY database/ ./database/

EXPOSE 3000

CMD ["node", "dist/main.js"]
