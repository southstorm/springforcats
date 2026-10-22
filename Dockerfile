FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATA_DIR=/data
EXPOSE 3001
VOLUME ["/data"]
CMD ["npm", "start"]
