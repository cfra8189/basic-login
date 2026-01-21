FROM node:18-alpine
WORKDIR /usr/src/app

# Copy package files first to install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Copy app
COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD [ "npm", "start" ]
# Dockerfile removed per request
