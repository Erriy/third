FROM node:16.3.0

WORKDIR /node
COPY . /node/
RUN npm install

ENTRYPOINT [ "node", "bin/cli.js" ]

