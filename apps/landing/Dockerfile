# Landing estática de somosperu.lat: no necesita build, solo nginx.
FROM nginx:1.27-alpine
COPY apps/landing/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/landing/public /usr/share/nginx/html
EXPOSE 80
