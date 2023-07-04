FROM node:14-alpine

WORKDIR /excalidraw-store

COPY package.json yarn.lock ./
RUN yarn

COPY tsconfig.json ./
COPY . .
RUN yarn build

EXPOSE 8080
CMD ["yarn", "start"]