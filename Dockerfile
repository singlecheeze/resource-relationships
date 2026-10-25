FROM registry.access.redhat.com/ubi9/nodejs-22:latest AS build
USER 0
WORKDIR /opt/plugin
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run typecheck && npm run build

FROM registry.access.redhat.com/ubi9/nginx-124:latest
COPY --from=build /opt/plugin/dist /usr/share/nginx/html
USER 1001
EXPOSE 9443
ENTRYPOINT ["nginx", "-g", "daemon off;"]
