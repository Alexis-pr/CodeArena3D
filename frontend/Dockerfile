# Stage 1: Build Angular application
FROM node:24-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias completas para compilación
RUN npm ci

# Copiar código fuente y configuración de Angular CLI
COPY angular.json tsconfig*.json ./
COPY public/ ./public/
COPY src/ ./src/

# Compilar Angular 21 en modo producción (genera dist/frontend/browser)
RUN npm run build

# Stage 2: Servidor Web Nginx
FROM nginx:alpine AS runner

# Copiar artefactos web compilados al directorio público de Nginx
COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html

# Copiar configuración personalizada de Nginx para SPA y WebSockets
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
