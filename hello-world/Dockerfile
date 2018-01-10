FROM arm32v7/node:8.9.4-slim

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

COPY index.js .
COPY package.json .
COPY yarn.lock .

RUN yarn install

CMD node index.js
