FROM nginx
COPY app.conf /etc/nginx/conf.d/
COPY udp.conf /etc/nginx/udp.conf
COPY robots.txt /etc/nginx/robots.txt
RUN echo "include udp.conf;" >> /etc/nginx/nginx.conf