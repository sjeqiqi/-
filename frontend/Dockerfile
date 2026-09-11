# 生产多阶段构建 Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# 依赖安装
COPY package*.json ./
RUN npm install

# 源码编译打包 (单文件输出)
COPY . .
RUN npm run build

# 生产级 Nginx 轻量镜像
FROM nginx:alpine

# 拷贝单文件生产包与静态图标
COPY --from=builder /app/dist/index.html /usr/share/nginx/html/index.html
COPY --from=builder /app/public/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
