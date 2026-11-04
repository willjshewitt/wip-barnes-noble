FROM nginx:1.28-alpine
COPY index.html /usr/share/nginx/html/index.html
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY data/ /usr/share/nginx/html/data/
COPY img/ /usr/share/nginx/html/img/
COPY fonts/ /usr/share/nginx/html/fonts/
COPY share/ /usr/share/nginx/html/share/
EXPOSE 80
