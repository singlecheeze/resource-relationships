FROM registry.access.redhat.com/ubi9/nodejs-22:latest AS build
USER 0
WORKDIR /opt/plugin
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run typecheck && npm run build

FROM registry.access.redhat.com/ubi9/nginx-124:latest
USER 0
COPY --from=build /opt/plugin/dist /usr/share/nginx/html
# Normalize extracted/build-context permissions for OpenShift's arbitrary UID.
# Static assets need read access and directory traversal, never write access.
RUN chmod a+rx /usr /usr/share /usr/share/nginx && \
    find /usr/share/nginx/html -type d -exec chmod 0755 {} + && \
    find /usr/share/nginx/html -type f -exec chmod 0644 {} +
USER 1001
EXPOSE 9443
ENTRYPOINT ["nginx", "-e", "stderr", "-g", "daemon off;"]
