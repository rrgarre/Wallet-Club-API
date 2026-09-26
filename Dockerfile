FROM node:24.1.0

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3010

CMD ["npm", "run", "start"]
